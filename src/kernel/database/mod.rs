use std::{
    io,
    path::{Path, PathBuf},
};

use rusqlite::Connection;
use thiserror::Error;

mod migrations;

#[derive(Debug, Error)]
pub enum Error {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("database was created by an unsupported pre-migration release")]
    UnsupportedLegacyDatabase,
    #[error("could not restrict database credential file access")]
    CredentialProtection(#[from] io::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

/// The kernel's shared SQLite database and schema migration runner.
pub struct Database {
    connection: Connection,
    path: PathBuf,
}

impl Database {
    /// Opens the shared SQLite database, applies pending migrations, and protects its files.
    ///
    /// # Arguments
    ///
    /// * `path` - Filesystem path to the database file.
    ///
    /// # Errors
    ///
    /// Returns [`Error::UnsupportedLegacyDatabase`] for an unsupported pre-migration database,
    /// [`Error::Sqlite`] for SQLite failures, or [`Error::CredentialProtection`] when file access
    /// cannot be restricted to the current operating system user.
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path)?;
        // WAL lets readers proceed while a later writer commits.
        connection.execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
        )?;
        migrate(&connection)?;
        let database = Self {
            connection,
            path: path.to_path_buf(),
        };
        database.protect_credentials()?;
        Ok(database)
    }

    /// Borrows the database connection for an internal read or write operation.
    pub(crate) fn connection(&self) -> &Connection {
        &self.connection
    }

    #[allow(dead_code)]
    /// Mutably borrows the database connection for operations requiring a mutable handle.
    pub(crate) fn connection_mut(&mut self) -> &mut Connection {
        &mut self.connection
    }

    /// Restricts the SQLite file and its existing WAL sidecars to the current OS user.
    ///
    /// # Errors
    ///
    /// Returns an I/O error if the operating system cannot apply the owner-only permissions.
    pub(crate) fn protect_credentials(&self) -> io::Result<()> {
        for suffix in ["", "-wal", "-shm"] {
            let path = if suffix.is_empty() {
                self.path.clone()
            } else {
                PathBuf::from(format!("{}{}", self.path.display(), suffix))
            };
            if path.exists() {
                restrict_to_owner(&path)?;
            }
        }
        Ok(())
    }
}

#[cfg(unix)]
fn restrict_to_owner(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
}

#[cfg(windows)]
fn restrict_to_owner(path: &Path) -> io::Result<()> {
    use std::process::Command;
    let output = Command::new("whoami.exe")
        .args(["/user", "/fo", "csv", "/nh"])
        .output()?;
    if !output.status.success() {
        return Err(io::Error::other("could not determine current Windows user"));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let sid = text
        .split('"')
        .find(|part| {
            part.starts_with("S-1-")
                && part
                    .chars()
                    .all(|ch| ch.is_ascii_digit() || ch == '-' || ch == 'S')
        })
        .ok_or_else(|| io::Error::other("could not parse current Windows user SID"))?;
    let output = Command::new("icacls.exe")
        .arg(path)
        .args(["/inheritance:r", "/grant:r", &format!("*{sid}:(F)")])
        .output()?;
    if !output.status.success() {
        return Err(io::Error::other("could not set database file ACL"));
    }
    Ok(())
}

fn migrate(connection: &Connection) -> Result<()> {
    if !ledger_exists(connection)? {
        if has_user_schema(connection)? {
            return Err(Error::UnsupportedLegacyDatabase);
        }
        connection.execute_batch(
            "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL);",
        )?;
    }

    for migration in migrations::ALL {
        let applied: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
            [migration.version],
            |row| row.get(0),
        )?;
        if applied {
            continue;
        }
        let transaction = connection.unchecked_transaction()?;
        (migration.apply)(&transaction)?;
        transaction.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
            (migration.version, migration.name, now()),
        )?;
        transaction.commit()?;
    }
    Ok(())
}

fn ledger_exists(connection: &Connection) -> Result<bool> {
    Ok(connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations')",
        [],
        |row| row.get(0),
    )?)
}

fn has_user_schema(connection: &Connection) -> Result<bool> {
    Ok(connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%')",
        [],
        |row| row.get(0),
    )?)
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock is after the Unix epoch")
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn path() -> std::path::PathBuf {
        let directory = std::env::temp_dir().join("cloudready-databases");
        std::fs::create_dir_all(&directory).unwrap();
        directory.join(format!("cloudready-database-{}.sqlite", Uuid::new_v4()))
    }

    #[test]
    fn migrates_a_new_database_once() {
        let path = path();
        let database = Database::open(&path).unwrap();
        let count: i64 = database
            .connection()
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, migrations::ALL.len() as i64);
        drop(database);

        let database = Database::open(&path).unwrap();
        let count: i64 = database
            .connection()
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, migrations::ALL.len() as i64);

        assert!(
            database
                .connection()
                .prepare("SELECT id, name, kind FROM nodes")
                .is_err()
        );
    }

    #[test]
    fn rejects_a_legacy_database_without_a_migration_ledger() {
        let path = path();
        Connection::open(&path)
            .unwrap()
            .execute_batch("CREATE TABLE nodes (id BLOB PRIMARY KEY);")
            .unwrap();

        assert!(matches!(
            Database::open(&path),
            Err(Error::UnsupportedLegacyDatabase)
        ));
    }
}
