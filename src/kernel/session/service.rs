//! Session policy and profile use cases backed by the feature's SQLite repository.

use super::{
    Error, ProfilePicture, ProfilePictureMetadata, Result, User, profile, repository::Repository,
};
use crate::database::Database;
use sha2::{Digest, Sha256};
use uuid::Uuid;

const LIFETIME: i64 = 30 * 24 * 60 * 60 * 1000;

/// Coordinates profile validation, opaque token issuance, and server-enforced expiry.
pub struct SessionStore<'a> {
    repository: Repository<'a>,
}
impl<'a> SessionStore<'a> {
    /// Creates a session service over the worker-owned database.
    pub fn new(database: &'a Database) -> Self {
        Self {
            repository: Repository::new(database),
        }
    }

    /// Lists profiles selectable by this intentionally unprotected local installation.
    ///
    /// # Errors
    /// Returns [`Error::Database`] if stored profiles cannot be read.
    pub fn users(&self) -> Result<Vec<User>> {
        self.repository.users()
    }

    /// Creates the first profile, atomically rejecting a second setup attempt.
    ///
    /// # Errors
    /// Returns [`Error::InvalidDisplayName`], [`Error::SetupComplete`], or [`Error::Database`].
    pub fn create_first_user(&self, display_name: &str) -> Result<User> {
        self.repository
            .create_first_user(profile::valid_name(display_name)?, now())
    }

    /// Issues an opaque token, storing only its digest so database reads cannot replay it.
    ///
    /// # Errors
    /// Returns [`Error::UserNotFound`] or [`Error::Database`].
    pub fn start(&self, user_id: Uuid) -> Result<(User, String)> {
        let user = self
            .repository
            .find_user(user_id)?
            .ok_or(Error::UserNotFound)?;
        let token = Uuid::new_v4().to_string();
        let created_at = now();
        self.repository.insert_session(
            user_id,
            &digest(&token),
            created_at + LIFETIME,
            created_at,
        )?;
        Ok((user, token))
    }

    /// Resolves a token and removes expired records without trusting a browser cookie's lifetime.
    ///
    /// # Errors
    /// Returns [`Error::Missing`], [`Error::Expired`], or [`Error::Database`].
    pub fn current(&self, token: Option<&str>) -> Result<User> {
        let token = token.ok_or(Error::Missing)?;
        let (user, expires_at) = self
            .repository
            .session(&digest(token))?
            .ok_or(Error::Missing)?;
        if expires_at <= now() {
            self.end(token)?;
            return Err(Error::Expired);
        }
        Ok(user)
    }

    /// Replaces a profile picture after validating its size and raster-image signature.
    ///
    /// # Errors
    /// Returns [`Error::ProfilePictureTooLarge`], [`Error::InvalidProfilePicture`], or [`Error::Database`].
    pub fn save_profile_picture(
        &self,
        user_id: Uuid,
        content: Vec<u8>,
    ) -> Result<ProfilePictureMetadata> {
        let mime_type = profile::picture_mime(&content)?;
        self.repository.save_picture(user_id, mime_type, &content)?;
        Ok(ProfilePictureMetadata {
            mime_type: mime_type.into(),
            size: content.len() as u64,
        })
    }

    /// Loads a stored profile picture.
    ///
    /// # Errors
    /// Returns [`Error::ProfilePictureMissing`] or [`Error::Database`].
    pub fn profile_picture(&self, user_id: Uuid) -> Result<ProfilePicture> {
        self.repository.profile_picture(user_id)
    }

    /// Revokes a token; revoking an absent record is harmless.
    ///
    /// # Errors
    /// Returns [`Error::Database`] if revocation cannot be persisted.
    pub fn end(&self, token: &str) -> Result<()> {
        self.repository.end(&digest(token))
    }
}
fn digest(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock is after Unix epoch")
        .as_millis() as i64
}
