//! Profile values and validation, independent of database and HTTP storage.
use super::{Error, Result};
use serde::Serialize;
use uuid::Uuid;

pub(super) const MAX_PROFILE_PICTURE_BYTES: usize = 5 * 1024 * 1024;
/// Profile metadata safe to return to a browser.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct User {
    pub id: Uuid,
    pub display_name: String,
    pub created_at: i64,
    pub profile_picture: Option<ProfilePictureMetadata>,
}

/// Picture metadata returned without loading or exposing the stored image bytes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProfilePictureMetadata {
    pub mime_type: String,
    pub size: u64,
}

/// Stored profile picture and its validated MIME type.
#[derive(Debug)]
pub struct ProfilePicture {
    pub mime_type: String,
    pub content: Vec<u8>,
}

pub(super) fn valid_name(value: &str) -> Result<String> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > 64 {
        return Err(Error::InvalidDisplayName);
    }
    Ok(name.into())
}

/// Checks the upload size and an allowed raster-image signature before persistence.
pub(super) fn picture_mime(content: &[u8]) -> Result<&'static str> {
    if content.len() > MAX_PROFILE_PICTURE_BYTES {
        return Err(Error::ProfilePictureTooLarge);
    }
    infer::get(content)
        .map(|kind| kind.mime_type())
        .filter(|mime| {
            matches!(
                *mime,
                "image/jpeg" | "image/png" | "image/gif" | "image/webp"
            )
        })
        .ok_or(Error::InvalidProfilePicture)
}
