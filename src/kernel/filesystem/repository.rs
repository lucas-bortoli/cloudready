//! SQLite node lookups, row projection, search-index updates, and value conversion.
use super::{Entry, Error, FileSystem, Result, path::parts};
use rusqlite::{OptionalExtension, Transaction, params};
use uuid::Uuid;
impl FileSystem<'_> {
    pub(super) fn file_id(&self, path: &str) -> Result<Uuid> {
        let node = self.node_id(path)?.ok_or(Error::NotFound)?;
        let kind: String = self.database.connection().query_row(
            "SELECT kind FROM filesystem_nodes WHERE id=?1 AND user_id=?2",
            params![id(node), id(self.user_id)],
            |r| r.get(0),
        )?;
        if kind != "file" {
            return Err(Error::InvalidOperation);
        }
        Ok(node)
    }

    pub(super) fn node_id(&self, path: &str) -> Result<Option<Uuid>> {
        let parts = parts(path)?;
        if parts.is_empty() {
            return Ok(Some(Uuid::nil()));
        }
        // The nil UUID is the internal parent ID of the virtual root.
        let mut parent = Uuid::nil();
        for part in parts {
            let next: Option<Vec<u8>> = self
                .database
                .connection()
                .query_row(
                    "SELECT id FROM filesystem_nodes WHERE user_id=?1 AND parent_id=?2 AND name=?3 AND deletion_id IS NULL",
                    params![id(self.user_id), id(parent), part],
                    |r| r.get(0),
                )
                .optional()?;
            match next {
                Some(value) => parent = uuid(value)?,
                None => return Ok(None),
            }
        }
        Ok(Some(parent))
    }

    pub(super) fn parent_and_name(&self, path: &str) -> Result<(Uuid, String)> {
        let mut parts = parts(path)?;
        let name = parts.pop().ok_or(Error::Invalid)?.to_owned();
        let parent_path = if parts.is_empty() {
            "/".into()
        } else {
            format!("/{}", parts.join("/"))
        };
        let parent = self.node_id(&parent_path)?.ok_or(Error::NotFound)?;
        let kind: String = if parent.is_nil() {
            "directory".into()
        } else {
            self.database.connection().query_row(
                "SELECT kind FROM filesystem_nodes WHERE id=?1 AND user_id=?2",
                params![id(parent), id(self.user_id)],
                |r| r.get(0),
            )?
        };
        if kind != "directory" {
            return Err(Error::InvalidOperation);
        }
        Ok((parent, name))
    }

    pub(super) fn is_descendant(&self, node: Uuid, ancestor: Uuid) -> Result<bool> {
        let mut current = Some(node);
        while let Some(value) = current {
            if value == ancestor {
                return Ok(true);
            }
            if value.is_nil() {
                break;
            }
            current = self
                .database
                .connection()
                .query_row(
                    "SELECT parent_id FROM filesystem_nodes WHERE id=?1 AND user_id=?2",
                    params![id(value), id(self.user_id)],
                    |r| uuid(r.get(0)?),
                )
                .optional()?;
        }
        Ok(false)
    }

    pub(super) fn entry_by_id(&self, node: Uuid, path: &str) -> Result<Entry> {
        self.database.connection().query_row("SELECT id,name,kind,current_revision_id,created_at,updated_at FROM filesystem_nodes WHERE id=?1 AND user_id=?2 AND deletion_id IS NULL",params![id(node), id(self.user_id)],|r|self.entry_from_row(r,path)).map_err(|e|if matches!(e,rusqlite::Error::QueryReturnedNoRows){Error::NotFound}else{Error::Database(e)})
    }

    pub(super) fn entry_from_row(
        &self,
        row: &rusqlite::Row<'_>,
        parent: &str,
    ) -> rusqlite::Result<Entry> {
        let node = uuid(row.get(0)?)?;
        let name: String = row.get(1)?;
        let kind: String = row.get(2)?;
        let current: Option<Vec<u8>> = row.get(3)?;
        let created = row.get(4)?;
        let updated = row.get(5)?;
        self.entry_from_values(node, name, kind, current, created, updated, parent)
    }

    pub(super) fn entry_from_values(
        &self,
        node: Uuid,
        name: String,
        kind: String,
        current: Option<Vec<u8>>,
        created: i64,
        updated: i64,
        parent: &str,
    ) -> rusqlite::Result<Entry> {
        let path = if parent == "/" {
            format!("/{name}")
        } else {
            format!("{parent}/{name}")
        };
        if kind == "directory" {
            Ok(Entry::Directory {
                id: node,
                path,
                name,
                created_at: created,
                updated_at: updated,
            })
        } else {
            let revision = uuid(current.ok_or(rusqlite::Error::QueryReturnedNoRows)?)?;
            let (size, mime): (i64, String) = self.database.connection().query_row(
                "SELECT size,mime_type FROM file_revisions WHERE id=?1",
                params![id(revision)],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            Ok(Entry::File {
                id: node,
                path,
                name,
                size: size as u64,
                mime_type: mime,
                created_at: created,
                updated_at: updated,
            })
        }
    }
}
pub(super) fn update_fts(tx: &Transaction<'_>, node: Uuid, name: &str) -> Result<()> {
    tx.execute(
        "DELETE FROM entry_search WHERE node_id=?1",
        params![id(node)],
    )?;
    tx.execute(
        "INSERT INTO entry_search(node_id,name) VALUES (?1,?2)",
        params![id(node), name],
    )?;
    Ok(())
}
pub(super) fn id(uuid: Uuid) -> Vec<u8> {
    uuid.as_bytes().to_vec()
}
pub(super) fn uuid(bytes: Vec<u8>) -> rusqlite::Result<Uuid> {
    Uuid::from_slice(&bytes).map_err(|_| rusqlite::Error::InvalidQuery)
}
pub(super) fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}
pub(super) fn map_constraint(error: rusqlite::Error) -> Error {
    match error {
        rusqlite::Error::SqliteFailure(_, _) => Error::Conflict,
        other => Error::Database(other),
    }
}
