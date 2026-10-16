//! Owner-scoped namespace mutations, directory operations, and search.
use super::{
    DeletedEntry, Entry, Error, FileSystem, Result,
    repository::{id, map_constraint, now, update_fts, uuid},
};
use crate::database::Database;
use rusqlite::params;
use uuid::Uuid;
impl<'database> FileSystem<'database> {
    /// Binds all namespace operations to the server-authenticated owner.
    pub fn new(database: &'database Database, user_id: Uuid) -> Self {
        Self { database, user_id }
    }

    /// Lists live children of a directory in this profile's namespace.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`] for unsafe paths, [`Error::NotFound`] for absent parents,
    /// or [`Error::Database`] for storage failures.
    pub fn list(&self, path: &str) -> Result<Vec<Entry>> {
        // The parent ID alone is insufficient because every profile has a virtual root UUID.
        let parent = self.node_id(path)?.ok_or(Error::NotFound)?;
        let mut statement = self.database.connection().prepare("SELECT id, name, kind, current_revision_id, created_at, updated_at FROM filesystem_nodes WHERE user_id=?1 AND parent_id=?2 AND deletion_id IS NULL ORDER BY kind DESC, name COLLATE NOCASE")?;
        let rows = statement.query_map(params![id(self.user_id), id(parent)], |row| {
            self.entry_from_row(row, path)
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Error::from)
    }

    /// Reads live entry metadata; the virtual root has no backing database row.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::NotFound`], or [`Error::Database`].
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

    /// Creates an empty file and its initial immutable revision.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::NotFound`], [`Error::InvalidOperation`],
    /// [`Error::Conflict`], or [`Error::Database`].
    pub fn create_file(&mut self, path: &str) -> Result<Entry> {
        let (parent, name) = self.parent_and_name(path)?;
        let now = now();
        let file = Uuid::new_v4();
        let revision = Uuid::new_v4();
        let tx = self.database.connection().unchecked_transaction()?;
        tx.execute("INSERT INTO filesystem_nodes (id,user_id,parent_id,name,kind,current_revision_id,created_at,updated_at) VALUES (?1,?2,?3,?4,'file',?5,?6,?6)", params![id(file), id(self.user_id), id(parent), name, id(revision), now]).map_err(map_constraint)?;
        tx.execute("INSERT INTO file_revisions (id,file_id,sequence,size,mime_type,created_at) VALUES (?1,?2,0,0,'application/octet-stream',?3)", params![id(revision), id(file), now])?;
        update_fts(&tx, file, &name)?;
        tx.commit()?;
        self.stat(path)
    }

    /// Creates a directory beneath an existing directory.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::NotFound`], [`Error::InvalidOperation`],
    /// [`Error::Conflict`], or [`Error::Database`].
    pub fn create_directory(&mut self, path: &str) -> Result<Entry> {
        let (parent, name) = self.parent_and_name(path)?;
        let now = now();
        let node = Uuid::new_v4();
        let tx = self.database.connection().unchecked_transaction()?;
        tx.execute("INSERT INTO filesystem_nodes (id,user_id,parent_id,name,kind,created_at,updated_at) VALUES (?1,?2,?3,?4,'directory',?5,?5)", params![id(node), id(self.user_id), id(parent), name, now]).map_err(map_constraint)?;
        update_fts(&tx, node, &name)?;
        tx.commit()?;
        self.stat(path)
    }

    /// Moves or renames an entry without allowing a directory to move into its descendants.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::NotFound`], [`Error::InvalidOperation`],
    /// [`Error::Conflict`], or [`Error::Database`].
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
        let tx = self.database.connection().unchecked_transaction()?;
        tx.execute(
            "UPDATE filesystem_nodes SET parent_id=?1,name=?2,updated_at=?3 WHERE id=?4 AND user_id=?5",
            params![id(parent), name, now(), id(node), id(self.user_id)],
        )
        .map_err(map_constraint)?;
        update_fts(&tx, node, &name)?;
        tx.commit()?;
        self.stat(destination)
    }

    /// Copies a file's current content to a new path.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::NotFound`], [`Error::InvalidOperation`],
    /// [`Error::Conflict`], or [`Error::Database`].
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
        let tx = self.database.connection().unchecked_transaction()?;
        let (size, mime): (i64, String) = tx.query_row(
            "SELECT size,mime_type FROM file_revisions WHERE id=?1",
            params![id(old)],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        tx.execute("INSERT INTO filesystem_nodes (id,user_id,parent_id,name,kind,current_revision_id,created_at,updated_at) VALUES (?1,?2,?3,?4,'file',?5,?6,?6)", params![id(file),id(self.user_id),id(parent),name,id(revision),now]).map_err(map_constraint)?;
        tx.execute("INSERT INTO file_revisions (id,file_id,sequence,size,mime_type,created_at) VALUES (?1,?2,0,?3,?4,?5)",params![id(revision),id(file),size,mime,now])?;
        // The copied file gets independent revision metadata but references the same bytes.
        tx.execute("INSERT INTO revision_chunks (revision_id,chunk_index,chunk_id,byte_length) SELECT ?1,chunk_index,chunk_id,byte_length FROM revision_chunks WHERE revision_id=?2",params![id(revision),id(old)])?;
        update_fts(&tx, file, &name)?;
        tx.commit()?;
        self.stat(destination)
    }

    /// Soft-deletes an entry and returns the identifier needed to restore the deletion.
    ///
    /// # Errors
    /// Returns [`Error::Invalid`], [`Error::NotFound`], [`Error::InvalidOperation`]
    /// for a forbidden or non-recursive directory deletion, or [`Error::Database`].
    pub fn remove(&mut self, path: &str, recursive: bool) -> Result<Uuid> {
        let node = self.node_id(path)?.ok_or(Error::NotFound)?;
        if !recursive
            && self.database.connection().query_row(
                "SELECT EXISTS(SELECT 1 FROM filesystem_nodes WHERE user_id=?1 AND parent_id=?2 AND deletion_id IS NULL)",
                params![id(self.user_id), id(node)],
                |r| r.get::<_, bool>(0),
            )?
        {
            return Err(Error::InvalidOperation);
        }
        let deletion = Uuid::new_v4();
        let tx = self.database.connection().unchecked_transaction()?;
        tx.execute(
            "INSERT INTO deletions (id,deleted_at) VALUES (?1,?2)",
            params![id(deletion), now()],
        )?;
        // One deletion ID marks a complete visible subtree without destroying its history.
        tx.execute("WITH RECURSIVE tree(id) AS (SELECT id FROM filesystem_nodes WHERE id=?1 AND user_id=?2 UNION ALL SELECT n.id FROM filesystem_nodes n JOIN tree t ON n.parent_id=t.id WHERE n.user_id=?2 AND n.deletion_id IS NULL) UPDATE filesystem_nodes SET deletion_id=?3 WHERE id IN tree",params![id(node),id(self.user_id),id(deletion)])?;
        tx.execute(
            "DELETE FROM entry_search WHERE node_id IN (SELECT id FROM filesystem_nodes WHERE deletion_id=?1 AND user_id=?2)",
            params![id(deletion), id(self.user_id)],
        )?;
        tx.commit()?;
        Ok(deletion)
    }

    /// Lists this profile's restorable deleted entries.
    ///
    /// # Errors
    /// Returns [`Error::Database`] if deletion records cannot be read.
    pub fn list_deleted(&self) -> Result<Vec<DeletedEntry>> {
        let mut q=self.database.connection().prepare("SELECT n.id,n.name,n.kind,n.current_revision_id,n.created_at,n.updated_at,n.deletion_id,d.deleted_at FROM filesystem_nodes n JOIN deletions d ON d.id=n.deletion_id WHERE n.user_id=?1 AND NOT EXISTS(SELECT 1 FROM filesystem_nodes p WHERE p.id=n.parent_id AND p.deletion_id=n.deletion_id) ORDER BY d.deleted_at DESC")?;
        let rows = q.query_map(params![id(self.user_id)], |r| {
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

    /// Restores an owned deletion if its original namespace locations are available.
    ///
    /// # Errors
    /// Returns [`Error::Conflict`] if live entries occupy the restored paths,
    /// or [`Error::Database`] if storage fails. Unknown deletion identifiers are harmless.
    pub fn restore(&mut self, deletion: Uuid) -> Result<()> {
        let tx = self.database.connection().unchecked_transaction()?;
        let conflict:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM filesystem_nodes n WHERE n.deletion_id=?1 AND n.user_id=?2 AND EXISTS(SELECT 1 FROM filesystem_nodes live WHERE live.user_id=?2 AND live.parent_id=n.parent_id AND live.name=n.name AND live.deletion_id IS NULL))",params![id(deletion),id(self.user_id)],|r|r.get(0))?;
        // Restoring must never overwrite a newer live sibling with the same name.
        if conflict {
            return Err(Error::Conflict);
        };
        // Restoring clears the subtree's deletion marker; its revision history remains intact.
        tx.execute(
            "UPDATE filesystem_nodes SET deletion_id=NULL WHERE deletion_id=?1 AND user_id=?2",
            params![id(deletion), id(self.user_id)],
        )?;
        let mut q = tx.prepare(
            "SELECT id,name FROM filesystem_nodes WHERE deletion_id IS NULL AND user_id=?1",
        )?;
        let rows = q.query_map(params![id(self.user_id)], |r| {
            Ok((uuid(r.get(0)?)?, r.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (node, name) = row?;
            update_fts(&tx, node, &name)?;
        }
        drop(q);
        tx.commit()?;
        Ok(())
    }

    /// Searches live entry names, optionally restricting results by MIME type.
    ///
    /// # Errors
    /// Returns [`Error::Database`] if the search query or row projection fails.
    pub fn search(&self, query: &str, mime: Option<&str>) -> Result<Vec<Entry>> {
        let mut q=self.database.connection().prepare("SELECT n.id,n.name,n.kind,n.current_revision_id,n.created_at,n.updated_at FROM entry_search s JOIN filesystem_nodes n ON n.id=s.node_id LEFT JOIN file_revisions r ON r.id=n.current_revision_id WHERE entry_search MATCH ?1 AND n.user_id=?2 AND n.deletion_id IS NULL AND (?3 IS NULL OR r.mime_type=?3) ORDER BY rank")?;
        let rows = q.query_map(params![query, id(self.user_id), mime], |r| {
            self.entry_from_row(r, "/")
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Error::from)
    }
}
