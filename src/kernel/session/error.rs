//! Named session and profile failures.
use thiserror::Error;
#[derive(Debug, Error)]
pub enum Error {
    #[error("No active session")]
    Missing,
    #[error("Session has expired")]
    Expired,
    #[error("Profile was not found")]
    UserNotFound,
    #[error("Initial setup has already completed")]
    SetupComplete,
    #[error("Display name is invalid")]
    InvalidDisplayName,
    #[error("Profile picture is not a supported image")]
    InvalidProfilePicture,
    #[error("Profile picture exceeds the 5 MiB limit")]
    ProfilePictureTooLarge,
    #[error("Profile picture was not found")]
    ProfilePictureMissing,
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
