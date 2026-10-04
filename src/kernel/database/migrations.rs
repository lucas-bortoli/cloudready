use rusqlite::Transaction;

pub(super) struct Migration {
    pub(super) version: i64,
    pub(super) name: &'static str,
    pub(super) apply: fn(&Transaction<'_>) -> rusqlite::Result<()>,
}

pub(super) const ALL: &[Migration] = &[
    Migration {
        version: 1,
        name: "filesystem initial schema",
        apply: initial_filesystem_schema,
    },
    Migration {
        version: 2,
        name: "guard filesystem schema from older kernels",
        apply: guard_against_older_kernels,
    },
];

fn initial_filesystem_schema(transaction: &Transaction<'_>) -> rusqlite::Result<()> {
    transaction.execute_batch("CREATE TABLE deletions (id BLOB PRIMARY KEY, deleted_at INTEGER NOT NULL); CREATE TABLE nodes (id BLOB PRIMARY KEY,parent_id BLOB NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('file','directory')),current_revision_id BLOB,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deletion_id BLOB REFERENCES deletions(id)); CREATE TABLE file_revisions (id BLOB PRIMARY KEY,file_id BLOB NOT NULL REFERENCES nodes(id),sequence INTEGER NOT NULL,size INTEGER NOT NULL,mime_type TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(file_id,sequence)); CREATE TABLE chunks (id BLOB PRIMARY KEY,sha256 BLOB NOT NULL UNIQUE,byte_length INTEGER NOT NULL,content BLOB NOT NULL); CREATE TABLE revision_chunks (revision_id BLOB NOT NULL REFERENCES file_revisions(id),chunk_index INTEGER NOT NULL,chunk_id BLOB NOT NULL REFERENCES chunks(id),byte_length INTEGER NOT NULL,PRIMARY KEY(revision_id,chunk_index)); CREATE UNIQUE INDEX live_children ON nodes(parent_id,name) WHERE deletion_id IS NULL; CREATE INDEX live_children_by_parent ON nodes(parent_id) WHERE deletion_id IS NULL; CREATE INDEX revisions_by_file ON file_revisions(file_id,sequence DESC); CREATE INDEX revisions_by_mime ON file_revisions(mime_type); CREATE INDEX nodes_by_updated ON nodes(updated_at); CREATE VIRTUAL TABLE entry_search USING fts5(node_id UNINDEXED,name);")
}

fn guard_against_older_kernels(transaction: &Transaction<'_>) -> rusqlite::Result<()> {
    transaction.execute_batch(
        "
        ALTER TABLE nodes RENAME TO filesystem_nodes;
        CREATE VIEW nodes AS SELECT NULL AS id WHERE 0;
        ",
    )
}
