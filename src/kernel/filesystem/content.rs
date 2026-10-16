//! Immutable file revisions, deduplicated content chunks, and byte-range operations.
use super::{
    Entry, Error, FileSystem, Result, Version,
    repository::{id, now, uuid},
};
use rusqlite::{OptionalExtension, params};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use uuid::Uuid;
/// Fixed-size pieces let new revisions reuse all unchanged content.
const CHUNK_SIZE: usize = 1024 * 1024;
impl FileSystem<'_> {
    /// Copies the requested byte range from the current revision into the supplied writer.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::InvalidRange`], [`Error::NotFound`],
    /// [`Error::InvalidOperation`], [`Error::Database`], or [`Error::Io`].
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
        let mut statement = self.database.connection().prepare("SELECT rc.chunk_index, rc.byte_length, c.content FROM revision_chunks rc JOIN chunks c ON c.id=rc.chunk_id WHERE rc.revision_id=?1 ORDER BY rc.chunk_index")?;
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

    /// Replaces file content, or writes at a byte offset, creating an immutable revision.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::InvalidRange`], [`Error::NotFound`],
    /// [`Error::InvalidOperation`], [`Error::Database`], or [`Error::Io`].
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

    /// Resizes a file, padding growth with zero bytes and recording a new revision.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::InvalidRange`], [`Error::NotFound`],
    /// [`Error::InvalidOperation`], or [`Error::Database`].
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

    /// Lists a file's immutable revisions, newest first.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::NotFound`], [`Error::InvalidOperation`],
    /// or [`Error::Database`].
    pub fn versions(&self, path: &str) -> Result<Vec<Version>> {
        let file = self.file_id(path)?;
        let mut q=self.database.connection().prepare("SELECT id,size,mime_type,created_at FROM file_revisions WHERE file_id=?1 ORDER BY sequence DESC")?;
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

    /// Makes an owned historical revision current without rewriting its immutable bytes.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::NotFound`], [`Error::InvalidOperation`],
    /// or [`Error::Database`].
    pub fn restore_version(&mut self, path: &str, revision: Uuid) -> Result<Entry> {
        let file = self.file_id(path)?;
        let tx = self.database.connection().unchecked_transaction()?;
        let valid: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM file_revisions WHERE id=?1 AND file_id=?2)",
            params![id(revision), id(file)],
            |r| r.get(0),
        )?;
        if !valid {
            return Err(Error::NotFound);
        };
        tx.execute(
            "UPDATE filesystem_nodes SET current_revision_id=?1,updated_at=?2 WHERE id=?3 AND user_id=?4",
            params![id(revision), now(), id(file), id(self.user_id)],
        )?;
        tx.commit()?;
        self.stat(path)
    }

    pub(super) fn create_revision(&mut self, file: Uuid, content: &[u8], path: &str) -> Result<()> {
        let tx = self.database.connection().unchecked_transaction()?;
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
            "UPDATE filesystem_nodes SET current_revision_id=?1,updated_at=?2 WHERE id=?3 AND user_id=?4",
            params![id(revision), now(), id(file), id(self.user_id)],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub(super) fn read_revision(&self, revision: Uuid, out: &mut Vec<u8>) -> Result<()> {
        let mut q=self.database.connection().prepare("SELECT c.content FROM revision_chunks rc JOIN chunks c ON c.id=rc.chunk_id WHERE rc.revision_id=?1 ORDER BY rc.chunk_index")?;
        let rows = q.query_map(params![id(revision)], |r| r.get::<_, Vec<u8>>(0))?;
        for row in rows {
            out.extend_from_slice(&row?)
        }
        Ok(())
    }

    pub(super) fn current_revision(&self, node: Uuid) -> Result<Uuid> {
        self.database
            .connection()
            .query_row(
                "SELECT current_revision_id FROM filesystem_nodes WHERE id=?1 AND user_id=?2",
                params![id(node), id(self.user_id)],
                |r| uuid(r.get(0)?),
            )
            .map_err(Error::from)
    }

    pub(super) fn revision_size(&self, revision: Uuid) -> Result<u64> {
        Ok(self.database.connection().query_row(
            "SELECT size FROM file_revisions WHERE id=?1",
            params![id(revision)],
            |r| r.get::<_, i64>(0),
        )? as u64)
    }
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
