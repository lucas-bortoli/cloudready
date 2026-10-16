//! Named virtual filesystem failures.
use thiserror::Error;
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
