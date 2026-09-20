use std::{
    io::{Read, Write},
    path::Path,
};

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

/// Fixed-size pieces let new revisions reuse all unchanged content.
const CHUNK_SIZE: usize = 1024 * 1024;

#[derive(Debug, Error)]
pub enum Error {
    #[error("path does not exist")]
    NotFound,
    #[error("an entry already exists at that path")]
    Conflict,
    #[error("invalid path or byte range")]
    Invalid,
    #[error("invalid byte range")]
    InvalidRange,
    #[error("operation is not valid for this entry")]
    InvalidOperation,
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Entry {
    File {
        id: Uuid,
        path: String,
        name: String,
        size: u64,
        mime_type: String,
        created_at: i64,
        updated_at: i64,
    },
    Directory {
        id: Uuid,
        path: String,
        name: String,
        created_at: i64,
        updated_at: i64,
    },
}

#[derive(Debug, Serialize)]
pub struct Version {
    pub id: Uuid,
    pub size: u64,
    pub mime_type: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct DeletedEntry {
    pub deletion_id: Uuid,
    pub entry: Entry,
    pub deleted_at: i64,
}

/// SQLite owns both the logical namespace and file bytes.
/// Revisions are immutable ordered sequences of deduplicated chunks.
pub struct FileSystem {
    connection: Connection,
}

impl FileSystem {
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path)?;
        // WAL lets readers proceed while a later writer commits.
        connection.execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
        )?;
        migrate(&connection)?;
        Ok(Self { connection })
    }

    pub fn list(&self, path: &str) -> Result<Vec<Entry>> {
        let parent = self.node_id(path)?.ok_or(Error::NotFound)?;
        let mut statement = self.connection.prepare("SELECT id, name, kind, current_revision_id, created_at, updated_at FROM nodes WHERE parent_id=?1 AND deletion_id IS NULL ORDER BY kind DESC, name COLLATE NOCASE")?;
        let rows =
            statement.query_map(params![id(parent)], |row| self.entry_from_row(row, path))?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Error::from)
    }

    pub fn stat(&self, path: &str) -> Result<Entry> {
        if path == "/" {
            // Root is virtual: it has no database row to mutate or remove.
            return Ok(Entry::Directory {
                id: Uuid::nil(),
                path: "/".into(),
                name: "/".into(),
                created_at: 0,
                updated_at: 0,
            });
        }
        let node = self.node_id(path)?.ok_or(Error::NotFound)?;
        self.entry_by_id(node, path)
    }

    pub fn exists(&self, path: &str) -> bool {
        self.stat(path).is_ok()
    }

    pub fn create_file(&mut self, path: &str) -> Result<Entry> {
        let (parent, name) = self.parent_and_name(path)?;
        let now = now();
        let file = Uuid::new_v4();
        let revision = Uuid::new_v4();
        let tx = self.connection.transaction()?;
        tx.execute("INSERT INTO nodes (id,parent_id,name,kind,current_revision_id,created_at,updated_at) VALUES (?1,?2,?3,'file',?4,?5,?5)", params![id(file), id(parent), name, id(revision), now]).map_err(map_constraint)?;
        tx.execute("INSERT INTO file_revisions (id,file_id,sequence,size,mime_type,created_at) VALUES (?1,?2,0,0,'application/octet-stream',?3)", params![id(revision), id(file), now])?;
        update_fts(&tx, file, &name)?;
        tx.commit()?;
        self.stat(path)
    }

    pub fn create_directory(&mut self, path: &str) -> Result<Entry> {
        let (parent, name) = self.parent_and_name(path)?;
        let now = now();
        let node = Uuid::new_v4();
        let tx = self.connection.transaction()?;
        tx.execute("INSERT INTO nodes (id,parent_id,name,kind,created_at,updated_at) VALUES (?1,?2,?3,'directory',?4,?4)", params![id(node), id(parent), name, now]).map_err(map_constraint)?;
        update_fts(&tx, node, &name)?;
        tx.commit()?;
        self.stat(path)
    }

    pub fn read_file(
        &self,
        path: &str,
        offset: u64,
        length: Option<u64>,
        output: &mut impl Write,
    ) -> Result<u64> {
        let node = self.file_id(path)?;
        let revision = self.current_revision(node)?;
        let size = self.revision_size(revision)?;
        if offset > size {
            return Err(Error::InvalidRange);
        }
        // An omitted length reads through EOF; ranges are clipped to its boundary.
        let remaining = length.unwrap_or(size - offset).min(size - offset);
        let end = offset + remaining;
        let mut statement = self.connection.prepare("SELECT rc.chunk_index, rc.byte_length, c.content FROM revision_chunks rc JOIN chunks c ON c.id=rc.chunk_id WHERE rc.revision_id=?1 ORDER BY rc.chunk_index")?;
        let mut written = 0;
        let mut cursor = 0u64;
        let rows = statement.query_map(params![id(revision)], |r| {
            Ok((r.get::<_, i64>(1)? as u64, r.get::<_, Vec<u8>>(2)?))
        })?;
        for row in rows {
            let (chunk_len, bytes) = row?;
            let chunk_end = cursor + chunk_len;
            if chunk_end > offset && cursor < end {
                let start = offset.saturating_sub(cursor) as usize;
                let stop = (end.min(chunk_end) - cursor) as usize;
                output.write_all(&bytes[start..stop])?;
                written += (stop - start) as u64;
            }
            cursor = chunk_end;
            if cursor >= end {
                break;
            }
        }
        Ok(written)
    }

    pub fn write_file(
        &mut self,
        path: &str,
        offset: Option<u64>,
        input: &mut impl Read,
    ) -> Result<Entry> {
        let file = self.file_id(path)?;
        let previous = self.current_revision(file)?;
        let mut old = Vec::new();
        self.read_revision(previous, &mut old)?;
        let mut data = Vec::new();
        input.read_to_end(&mut data)?;
        // No offset replaces the file; an offset patches it and zero-fills a gap.
        let content = if let Some(offset) = offset {
            let start = usize::try_from(offset).map_err(|_| Error::InvalidRange)?;
            if start > old.len() {
                old.resize(start, 0);
            }
            if start + data.len() > old.len() {
                old.resize(start + data.len(), 0);
            }
            old[start..start + data.len()].copy_from_slice(&data);
            old
        } else {
            data
        };
        self.create_revision(file, &content, path)?;
        self.stat(path)
    }

    pub fn truncate(&mut self, path: &str, size: u64) -> Result<Entry> {
        let file = self.file_id(path)?;
        let previous = self.current_revision(file)?;
        let mut content = Vec::new();
        self.read_revision(previous, &mut content)?;
        let size = usize::try_from(size).map_err(|_| Error::InvalidRange)?;
        content.resize(size, 0);
        self.create_revision(file, &content, path)?;
        self.stat(path)
    }

    pub fn move_entry(&mut self, source: &str, destination: &str) -> Result<Entry> {
        if source == "/" || destination == "/" {
            return Err(Error::Invalid);
        }
        let node = self.node_id(source)?.ok_or(Error::NotFound)?;
        let (parent, name) = self.parent_and_name(destination)?;
        if self.node_id(destination)?.is_some() {
            return Err(Error::Conflict);
        }
        if self.is_descendant(parent, node)? {
            return Err(Error::InvalidOperation);
        }
        let tx = self.connection.transaction()?;
        tx.execute(
            "UPDATE nodes SET parent_id=?1,name=?2,updated_at=?3 WHERE id=?4",
            params![id(parent), name, now(), id(node)],
        )
        .map_err(map_constraint)?;
        update_fts(&tx, node, &name)?;
        tx.commit()?;
        self.stat(destination)
    }

    pub fn copy(&mut self, source: &str, destination: &str) -> Result<Entry> {
        let source_id = self.file_id(source)?;
        let (parent, name) = self.parent_and_name(destination)?;
        if self.node_id(destination)?.is_some() {
            return Err(Error::Conflict);
        }
        let old = self.current_revision(source_id)?;
        let now = now();
        let file = Uuid::new_v4();
        let revision = Uuid::new_v4();
        let tx = self.connection.transaction()?;
        let (size, mime): (i64, String) = tx.query_row(
            "SELECT size,mime_type FROM file_revisions WHERE id=?1",
            params![id(old)],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        tx.execute("INSERT INTO nodes (id,parent_id,name,kind,current_revision_id,created_at,updated_at) VALUES (?1,?2,?3,'file',?4,?5,?5)", params![id(file),id(parent),name,id(revision),now]).map_err(map_constraint)?;
        tx.execute("INSERT INTO file_revisions (id,file_id,sequence,size,mime_type,created_at) VALUES (?1,?2,0,?3,?4,?5)",params![id(revision),id(file),size,mime,now])?;
        // The copied file gets independent revision metadata but references the same bytes.
        tx.execute("INSERT INTO revision_chunks (revision_id,chunk_index,chunk_id,byte_length) SELECT ?1,chunk_index,chunk_id,byte_length FROM revision_chunks WHERE revision_id=?2",params![id(revision),id(old)])?;
        update_fts(&tx, file, &name)?;
        tx.commit()?;
        self.stat(destination)
    }

    pub fn remove(&mut self, path: &str, recursive: bool) -> Result<Uuid> {
        let node = self.node_id(path)?.ok_or(Error::NotFound)?;
        if !recursive
            && self.connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM nodes WHERE parent_id=?1 AND deletion_id IS NULL)",
                params![id(node)],
                |r| r.get::<_, bool>(0),
            )?
        {
            return Err(Error::InvalidOperation);
        }
        let deletion = Uuid::new_v4();
        let tx = self.connection.transaction()?;
        tx.execute(
            "INSERT INTO deletions (id,deleted_at) VALUES (?1,?2)",
            params![id(deletion), now()],
        )?;
        // One deletion ID marks a complete visible subtree without destroying its history.
        tx.execute("WITH RECURSIVE tree(id) AS (SELECT id FROM nodes WHERE id=?1 UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id=t.id WHERE n.deletion_id IS NULL) UPDATE nodes SET deletion_id=?2 WHERE id IN tree",params![id(node),id(deletion)])?;
        tx.execute(
            "DELETE FROM entry_search WHERE node_id IN (SELECT id FROM nodes WHERE deletion_id=?1)",
            params![id(deletion)],
        )?;
        tx.commit()?;
        Ok(deletion)
    }

    pub fn list_deleted(&self) -> Result<Vec<DeletedEntry>> {
        let mut q=self.connection.prepare("SELECT n.id,n.name,n.kind,n.current_revision_id,n.created_at,n.updated_at,n.deletion_id,d.deleted_at FROM nodes n JOIN deletions d ON d.id=n.deletion_id WHERE NOT EXISTS(SELECT 1 FROM nodes p WHERE p.id=n.parent_id AND p.deletion_id=n.deletion_id) ORDER BY d.deleted_at DESC")?;
        let rows = q.query_map([], |r| {
            let node = uuid(r.get(0)?)?;
            let name: String = r.get(1)?;
            let kind: String = r.get(2)?;
            let current: Option<Vec<u8>> = r.get(3)?;
            let created = r.get(4)?;
            let updated = r.get(5)?;
            let deletion = uuid(r.get(6)?)?;
            let deleted = r.get(7)?;
            let entry = self.entry_from_values(node, name, kind, current, created, updated, "/")?;
            Ok(DeletedEntry {
                deletion_id: deletion,
                entry,
                deleted_at: deleted,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Error::from)
    }

    pub fn restore(&mut self, deletion: Uuid) -> Result<()> {
        let tx = self.connection.transaction()?;
        let conflict:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM nodes n WHERE n.deletion_id=?1 AND EXISTS(SELECT 1 FROM nodes live WHERE live.parent_id=n.parent_id AND live.name=n.name AND live.deletion_id IS NULL))",params![id(deletion)],|r|r.get(0))?;
        // Restoring must never overwrite a newer live sibling with the same name.
        if conflict {
            return Err(Error::Conflict);
        };
        // Restoring a version changes only the current pointer; historical bytes stay immutable.
        tx.execute(
            "UPDATE nodes SET deletion_id=NULL WHERE deletion_id=?1",
            params![id(deletion)],
        )?;
        let mut q = tx.prepare("SELECT id,name FROM nodes WHERE deletion_id IS NULL")?;
        let rows = q.query_map([], |r| Ok((uuid(r.get(0)?)?, r.get::<_, String>(1)?)))?;
        for row in rows {
            let (node, name) = row?;
            update_fts(&tx, node, &name)?;
        }
        drop(q);
        tx.commit()?;
        Ok(())
    }

    pub fn versions(&self, path: &str) -> Result<Vec<Version>> {
        let file = self.file_id(path)?;
        let mut q=self.connection.prepare("SELECT id,size,mime_type,created_at FROM file_revisions WHERE file_id=?1 ORDER BY sequence DESC")?;
        let rows = q.query_map(params![id(file)], |r| {
            Ok(Version {
                id: uuid(r.get(0)?)?,
                size: r.get::<_, i64>(1)? as u64,
                mime_type: r.get(2)?,
                created_at: r.get(3)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Error::from)
    }
    pub fn restore_version(&mut self, path: &str, revision: Uuid) -> Result<Entry> {
        let file = self.file_id(path)?;
        let tx = self.connection.transaction()?;
        let valid: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM file_revisions WHERE id=?1 AND file_id=?2)",
            params![id(revision), id(file)],
            |r| r.get(0),
        )?;
        if !valid {
            return Err(Error::NotFound);
        };
        tx.execute(
            "UPDATE nodes SET current_revision_id=?1,updated_at=?2 WHERE id=?3",
            params![id(revision), now(), id(file)],
        )?;
        tx.commit()?;
        self.stat(path)
    }
    pub fn search(&self, query: &str, mime: Option<&str>) -> Result<Vec<Entry>> {
        let mut q=self.connection.prepare("SELECT n.id,n.name,n.kind,n.current_revision_id,n.created_at,n.updated_at FROM entry_search s JOIN nodes n ON n.id=s.node_id LEFT JOIN file_revisions r ON r.id=n.current_revision_id WHERE entry_search MATCH ?1 AND n.deletion_id IS NULL AND (?2 IS NULL OR r.mime_type=?2) ORDER BY rank")?;
        let rows = q.query_map(params![query, mime], |r| self.entry_from_row(r, "/"))?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Error::from)
    }

    fn create_revision(&mut self, file: Uuid, content: &[u8], path: &str) -> Result<()> {
        let tx = self.connection.transaction()?;
        let sequence: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sequence)+1,0) FROM file_revisions WHERE file_id=?1",
            params![id(file)],
            |r| r.get(0),
        )?;
        let revision = Uuid::new_v4();
        let mime = detect_mime(content, path);
        tx.execute("INSERT INTO file_revisions (id,file_id,sequence,size,mime_type,created_at) VALUES (?1,?2,?3,?4,?5,?6)",params![id(revision),id(file),sequence,content.len() as i64,mime,now()])?;
        // SHA-256 gives identical bytes one durable chunk across every revision.
        for (index, chunk) in content.chunks(CHUNK_SIZE).enumerate() {
            let digest = Sha256::digest(chunk);
            let chunk_id: Option<Vec<u8>> = tx
                .query_row(
                    "SELECT id FROM chunks WHERE sha256=?1",
                    params![digest.as_slice()],
                    |r| r.get(0),
                )
                .optional()?;
            let chunk_id = match chunk_id {
                Some(value) => uuid(value)?,
                None => {
                    let value = Uuid::new_v4();
                    tx.execute(
                        "INSERT INTO chunks (id,sha256,byte_length,content) VALUES (?1,?2,?3,?4)",
                        params![id(value), digest.as_slice(), chunk.len() as i64, chunk],
                    )?;
                    value
                }
            };
            tx.execute("INSERT INTO revision_chunks (revision_id,chunk_index,chunk_id,byte_length) VALUES (?1,?2,?3,?4)",params![id(revision),index as i64,id(chunk_id),chunk.len() as i64])?;
        }
        tx.execute(
            "UPDATE nodes SET current_revision_id=?1,updated_at=?2 WHERE id=?3",
            params![id(revision), now(), id(file)],
        )?;
        tx.commit()?;
        Ok(())
    }
    fn read_revision(&self, revision: Uuid, out: &mut Vec<u8>) -> Result<()> {
        let mut q=self.connection.prepare("SELECT c.content FROM revision_chunks rc JOIN chunks c ON c.id=rc.chunk_id WHERE rc.revision_id=?1 ORDER BY rc.chunk_index")?;
        let rows = q.query_map(params![id(revision)], |r| r.get::<_, Vec<u8>>(0))?;
        for row in rows {
            out.extend_from_slice(&row?)
        }
        Ok(())
    }
    fn file_id(&self, path: &str) -> Result<Uuid> {
        let node = self.node_id(path)?.ok_or(Error::NotFound)?;
        let kind: String = self.connection.query_row(
            "SELECT kind FROM nodes WHERE id=?1",
            params![id(node)],
            |r| r.get(0),
        )?;
        if kind != "file" {
            return Err(Error::InvalidOperation);
        }
        Ok(node)
    }
    fn current_revision(&self, node: Uuid) -> Result<Uuid> {
        self.connection
            .query_row(
                "SELECT current_revision_id FROM nodes WHERE id=?1",
                params![id(node)],
                |r| uuid(r.get(0)?),
            )
            .map_err(Error::from)
    }
    fn revision_size(&self, revision: Uuid) -> Result<u64> {
        Ok(self.connection.query_row(
            "SELECT size FROM file_revisions WHERE id=?1",
            params![id(revision)],
            |r| r.get::<_, i64>(0),
        )? as u64)
    }
    fn node_id(&self, path: &str) -> Result<Option<Uuid>> {
        let parts = parts(path)?;
        if parts.is_empty() {
            return Ok(Some(Uuid::nil()));
        }
        // The nil UUID is the internal parent ID of the virtual root.
        let mut parent = Uuid::nil();
        for part in parts {
            let next: Option<Vec<u8>> = self
                .connection
                .query_row(
                    "SELECT id FROM nodes WHERE parent_id=?1 AND name=?2 AND deletion_id IS NULL",
                    params![id(parent), part],
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
    fn parent_and_name(&self, path: &str) -> Result<(Uuid, String)> {
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
            self.connection.query_row(
                "SELECT kind FROM nodes WHERE id=?1",
                params![id(parent)],
                |r| r.get(0),
            )?
        };
        if kind != "directory" {
            return Err(Error::InvalidOperation);
        }
        Ok((parent, name))
    }
    fn is_descendant(&self, node: Uuid, ancestor: Uuid) -> Result<bool> {
        let mut current = Some(node);
        while let Some(value) = current {
            if value == ancestor {
                return Ok(true);
            }
            if value.is_nil() {
                break;
            }
            current = self
                .connection
                .query_row(
                    "SELECT parent_id FROM nodes WHERE id=?1",
                    params![id(value)],
                    |r| uuid(r.get(0)?),
                )
                .optional()?;
        }
        Ok(false)
    }
    fn entry_by_id(&self, node: Uuid, path: &str) -> Result<Entry> {
        self.connection.query_row("SELECT id,name,kind,current_revision_id,created_at,updated_at FROM nodes WHERE id=?1 AND deletion_id IS NULL",params![id(node)],|r|self.entry_from_row(r,path)).map_err(|e|if matches!(e,rusqlite::Error::QueryReturnedNoRows){Error::NotFound}else{Error::Database(e)})
    }
    fn entry_from_row(&self, row: &rusqlite::Row<'_>, parent: &str) -> rusqlite::Result<Entry> {
        let node = uuid(row.get(0)?)?;
        let name: String = row.get(1)?;
        let kind: String = row.get(2)?;
        let current: Option<Vec<u8>> = row.get(3)?;
        let created = row.get(4)?;
        let updated = row.get(5)?;
        self.entry_from_values(node, name, kind, current, created, updated, parent)
    }
    fn entry_from_values(
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
            let (size, mime): (i64, String) = self.connection.query_row(
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

/// Create the initial storage format. Released changes belong in numbered migrations.
fn migrate(connection: &Connection) -> Result<()> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS deletions (id BLOB PRIMARY KEY, deleted_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS nodes (id BLOB PRIMARY KEY,parent_id BLOB NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('file','directory')),current_revision_id BLOB,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deletion_id BLOB REFERENCES deletions(id)); CREATE TABLE IF NOT EXISTS file_revisions (id BLOB PRIMARY KEY,file_id BLOB NOT NULL REFERENCES nodes(id),sequence INTEGER NOT NULL,size INTEGER NOT NULL,mime_type TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(file_id,sequence)); CREATE TABLE IF NOT EXISTS chunks (id BLOB PRIMARY KEY,sha256 BLOB NOT NULL UNIQUE,byte_length INTEGER NOT NULL,content BLOB NOT NULL); CREATE TABLE IF NOT EXISTS revision_chunks (revision_id BLOB NOT NULL REFERENCES file_revisions(id),chunk_index INTEGER NOT NULL,chunk_id BLOB NOT NULL REFERENCES chunks(id),byte_length INTEGER NOT NULL,PRIMARY KEY(revision_id,chunk_index)); CREATE UNIQUE INDEX IF NOT EXISTS live_children ON nodes(parent_id,name) WHERE deletion_id IS NULL; CREATE INDEX IF NOT EXISTS live_children_by_parent ON nodes(parent_id) WHERE deletion_id IS NULL; CREATE INDEX IF NOT EXISTS revisions_by_file ON file_revisions(file_id,sequence DESC); CREATE INDEX IF NOT EXISTS revisions_by_mime ON file_revisions(mime_type); CREATE INDEX IF NOT EXISTS nodes_by_updated ON nodes(updated_at); CREATE VIRTUAL TABLE IF NOT EXISTS entry_search USING fts5(node_id UNINDEXED,name);")?;
    Ok(())
}
fn update_fts(tx: &Transaction<'_>, node: Uuid, name: &str) -> Result<()> {
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
fn parts(path: &str) -> Result<Vec<&str>> {
    if !path.starts_with('/') || path.contains("//") {
        return Err(Error::Invalid);
    }
    // Logical paths are never host paths: reject traversal and ambiguous separators.
    let values: Vec<_> = path.split('/').filter(|s| !s.is_empty()).collect();
    if values
        .iter()
        .any(|v| v.is_empty() || *v == "." || *v == ".." || v.contains('\\') || v.contains('\0'))
    {
        return Err(Error::Invalid);
    }
    Ok(values)
}
fn id(uuid: Uuid) -> Vec<u8> {
    uuid.as_bytes().to_vec()
}
fn uuid(bytes: Vec<u8>) -> rusqlite::Result<Uuid> {
    Uuid::from_slice(&bytes).map_err(|_| rusqlite::Error::InvalidQuery)
}
fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}
fn detect_mime(content: &[u8], path: &str) -> String {
    // Content signatures win; filename extensions are only a fallback.
    infer::get(content)
        .map(|v| v.mime_type().to_owned())
        .or_else(|| mime_from_extension(path))
        .unwrap_or_else(|| "application/octet-stream".into())
}
fn mime_from_extension(path: &str) -> Option<String> {
    match path.rsplit('.').next()?.to_ascii_lowercase().as_str() {
        "txt" | "md" | "rs" | "ts" | "tsx" | "js" | "json" | "css" | "html" => {
            Some("text/plain".into())
        }
        "png" => Some("image/png".into()),
        "jpg" | "jpeg" => Some("image/jpeg".into()),
        "pdf" => Some("application/pdf".into()),
        _ => None,
    }
}
fn map_constraint(error: rusqlite::Error) -> Error {
    match error {
        rusqlite::Error::SqliteFailure(_, _) => Error::Conflict,
        other => Error::Database(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    fn fs() -> FileSystem {
        FileSystem::open(
            &std::env::temp_dir().join(format!("cloudready-{}.sqlite", Uuid::new_v4())),
        )
        .unwrap()
    }
    #[test]
    fn versions_ranges_and_restore() {
        let mut fs = fs();
        fs.create_file("/a.txt").unwrap();
        fs.write_file("/a.txt", None, &mut Cursor::new(b"hello"))
            .unwrap();
        fs.write_file("/a.txt", Some(1), &mut Cursor::new(b"a"))
            .unwrap();
        let mut out = Vec::new();
        fs.read_file("/a.txt", 1, Some(3), &mut out).unwrap();
        assert_eq!(out, b"all");
        assert_eq!(fs.versions("/a.txt").unwrap().len(), 3);
        fs.truncate("/a.txt", 8).unwrap();
        let mut out = Vec::new();
        fs.read_file("/a.txt", 0, None, &mut out).unwrap();
        assert_eq!(&out[..5], b"hallo");
        assert_eq!(&out[5..], [0, 0, 0]);
    }
    #[test]
    fn deletion_and_restore() {
        let mut fs = fs();
        fs.create_directory("/d").unwrap();
        fs.create_file("/d/a").unwrap();
        let deleted = fs.remove("/d", true).unwrap();
        assert!(!fs.exists("/d/a"));
        fs.restore(deleted).unwrap();
        assert!(fs.exists("/d/a"));
    }

    #[test]
    fn copy_search_and_mime() {
        let mut fs = fs();
        fs.create_file("/photo.png").unwrap();
        fs.write_file(
            "/photo.png",
            None,
            &mut Cursor::new([0x89, b'P', b'N', b'G', 13, 10, 26, 10]),
        )
        .unwrap();
        match fs.stat("/photo.png").unwrap() {
            Entry::File { mime_type, .. } => assert_eq!(mime_type, "image/png"),
            Entry::Directory { .. } => panic!("expected file"),
        }
        fs.copy("/photo.png", "/copy.png").unwrap();
        fs.move_entry("/copy.png", "/image.png").unwrap();
        assert_eq!(fs.search("image", Some("image/png")).unwrap().len(), 1);
    }
}
