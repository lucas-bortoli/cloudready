use std::path::Path;

use rusqlite::Connection;
use thiserror::Error;

mod migrations;

#[derive(Debug, Error)]
pub enum Error {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("database was created by an unsupported pre-migration release")]
    UnsupportedLegacyDatabase,
}

pub type Result<T> = std::result::Result<T, Error>;

/// The kernel's shared SQLite database and schema migration runner.
pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path)?;
        // WAL lets readers proceed while a later writer commits.
        connection.execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
        )?;
        migrate(&connection)?;
        Ok(Self { connection })
    }

    pub(crate) fn connection(&self) -> &Connection {
        &self.connection
    }

    #[allow(dead_code)]
    pub(crate) fn connection_mut(&mut self) -> &mut Connection {
        &mut self.connection
    }
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
        std::env::temp_dir().join(format!("cloudready-database-{}.sqlite", Uuid::new_v4()))
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
