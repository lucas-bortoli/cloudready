//! Profile-scoped virtual filesystem backed by SQLite nodes and immutable revisions.
mod content;
mod error;
mod models;
mod namespace;
mod path;
mod repository;
#[cfg(test)]
mod tests;

use crate::database::Database;
pub use error::{Error, Result};
pub use models::{DeletedEntry, Entry, Version};
use uuid::Uuid;

/// SQLite owns both the logical namespace and file bytes.
/// Revisions are immutable ordered sequences of deduplicated chunks.
pub struct FileSystem<'database> {
    database: &'database Database,
    // Every lookup carries this owner constraint; paths are never globally addressable.
    user_id: Uuid,
}
