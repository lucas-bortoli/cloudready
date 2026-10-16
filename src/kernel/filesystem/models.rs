//! File, directory, revision, and deletion metadata returned to callers.
use serde::Serialize;
use uuid::Uuid;
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
