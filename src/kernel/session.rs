use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

use crate::database::Database;

/// The browser cookie contains only an opaque session token, never user data.
pub const COOKIE: &str = "cloudready_session";
const LIFETIME: i64 = 30 * 24 * 60 * 60 * 1000;
const MAX_PROFILE_PICTURE_BYTES: usize = 5 * 1024 * 1024;

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct User {
    pub id: Uuid,
    pub display_name: String,
    pub created_at: i64,
    pub profile_picture: Option<ProfilePictureMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProfilePictureMetadata {
    pub mime_type: String,
    pub size: u64,
}

#[derive(Debug)]
pub struct ProfilePicture {
    pub mime_type: String,
    pub content: Vec<u8>,
}

/// Owns profile selection and durable browser-session records.
pub struct SessionStore<'a> {
    database: &'a Database,
}

impl<'a> SessionStore<'a> {
    pub fn new(database: &'a Database) -> Self {
        Self { database }
    }

    /// Lists profiles selectable by this intentionally unprotected local installation.
    pub fn users(&self) -> Result<Vec<User>> {
        let mut statement = self
            .database
            .connection()
            .prepare("SELECT u.id, u.display_name, u.created_at, p.mime_type, length(p.content) FROM users u LEFT JOIN profile_pictures p ON p.user_id = u.id ORDER BY u.created_at")?;
        statement
            .query_map([], user)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Error::from)
    }

    /// Creates the sole OOBE profile, atomically rejecting a second setup attempt.
    pub fn create_first_user(&self, display_name: &str) -> Result<User> {
        let display_name = valid_name(display_name)?;
        let transaction = self.database.connection().unchecked_transaction()?;

        // Checking and inserting together closes the race between two OOBE tabs.
        let setup_complete =
            transaction.query_row("SELECT EXISTS(SELECT 1 FROM users)", [], |row| {
                row.get::<_, bool>(0)
            })?;
        if setup_complete {
            return Err(Error::SetupComplete);
        }

        let user = User {
            id: Uuid::new_v4(),
            display_name,
            created_at: now(),
            profile_picture: None,
        };
        transaction.execute(
            "INSERT INTO users(id,display_name,created_at) VALUES (?1,?2,?3)",
            params![user.id.as_bytes(), user.display_name, user.created_at],
        )?;
        transaction.commit()?;

        Ok(user)
    }

    /// Starts a browser session and returns the profile plus its cookie token.
    pub fn start(&self, user_id: Uuid) -> Result<(User, String)> {
        let user = self.find_user(user_id)?.ok_or(Error::UserNotFound)?;
        let token = Uuid::new_v4().to_string();
        let created_at = now();

        // Store only a digest so reading the database cannot replay a browser session.
        self.database.connection().execute(
            "INSERT INTO sessions(token_digest,user_id,expires_at,created_at) VALUES (?1,?2,?3,?4)",
            params![
                digest(&token),
                user_id.as_bytes(),
                created_at + LIFETIME,
                created_at
            ],
        )?;

        Ok((user, token))
    }

    /// Resolves a browser token, removing expired records when they are encountered.
    pub fn current(&self, token: Option<&str>) -> Result<User> {
        let token = token.ok_or(Error::Missing)?;
        let row: Option<(Vec<u8>, String, i64, Option<String>, Option<i64>, i64)> = self
            .database
            .connection()
            .query_row(
                "SELECT u.id,u.display_name,u.created_at,p.mime_type,length(p.content),s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN profile_pictures p ON p.user_id=u.id WHERE s.token_digest=?1",
                params![digest(token)],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .optional()?;
        let (id, display_name, created_at, mime_type, size, expires_at) =
            row.ok_or(Error::Missing)?;

        // The kernel enforces expiry instead of trusting the cookie Max-Age alone.
        if expires_at <= now() {
            self.end(token)?;
            return Err(Error::Expired);
        }

        Ok(User {
            id: Uuid::from_slice(&id).map_err(|_| rusqlite::Error::InvalidQuery)?,
            display_name,
            created_at,
            profile_picture: picture_metadata(mime_type, size)?,
        })
    }

    /// Replaces a profile's image after validating that its bytes are a supported raster image.
    pub fn save_profile_picture(
        &self,
        user_id: Uuid,
        content: Vec<u8>,
    ) -> Result<ProfilePictureMetadata> {
        if content.len() > MAX_PROFILE_PICTURE_BYTES {
            return Err(Error::ProfilePictureTooLarge);
        }
        let mime_type = infer::get(&content)
            .map(|kind| kind.mime_type())
            .filter(|mime_type| {
                matches!(
                    *mime_type,
                    "image/jpeg" | "image/png" | "image/gif" | "image/webp"
                )
            })
            .ok_or(Error::InvalidProfilePicture)?;
        self.database.connection().execute(
            "INSERT INTO profile_pictures(user_id,mime_type,content) VALUES (?1,?2,?3) ON CONFLICT(user_id) DO UPDATE SET mime_type=excluded.mime_type,content=excluded.content",
            params![user_id.as_bytes(), mime_type, content],
        )?;
        Ok(ProfilePictureMetadata {
            mime_type: mime_type.into(),
            size: content.len() as u64,
        })
    }

    /// Loads the current image for an authenticated profile.
    pub fn profile_picture(&self, user_id: Uuid) -> Result<ProfilePicture> {
        self.database
            .connection()
            .query_row(
                "SELECT mime_type, content FROM profile_pictures WHERE user_id=?1",
                params![user_id.as_bytes()],
                |row| {
                    Ok(ProfilePicture {
                        mime_type: row.get(0)?,
                        content: row.get(1)?,
                    })
                },
            )
            .optional()?
            .ok_or(Error::ProfilePictureMissing)
    }

    /// Revokes a token immediately; deleting an absent token is harmless.
    pub fn end(&self, token: &str) -> Result<()> {
        self.database.connection().execute(
            "DELETE FROM sessions WHERE token_digest=?1",
            params![digest(token)],
        )?;
        Ok(())
    }

    fn find_user(&self, id: Uuid) -> Result<Option<User>> {
        self.database
            .connection()
            .query_row(
                "SELECT u.id,u.display_name,u.created_at,p.mime_type,length(p.content) FROM users u LEFT JOIN profile_pictures p ON p.user_id=u.id WHERE u.id=?1",
                params![id.as_bytes()],
                user,
            )
            .optional()
            .map_err(Error::from)
    }
}

fn user(row: &rusqlite::Row<'_>) -> rusqlite::Result<User> {
    Ok(User {
        id: Uuid::from_slice(&row.get::<_, Vec<u8>>(0)?)
            .map_err(|_| rusqlite::Error::InvalidQuery)?,
        display_name: row.get(1)?,
        created_at: row.get(2)?,
        profile_picture: picture_metadata(row.get(3)?, row.get(4)?)?,
    })
}

fn picture_metadata(
    mime_type: Option<String>,
    size: Option<i64>,
) -> rusqlite::Result<Option<ProfilePictureMetadata>> {
    match (mime_type, size) {
        (None, None) => Ok(None),
        (Some(mime_type), Some(size)) if size >= 0 => Ok(Some(ProfilePictureMetadata {
            mime_type,
            size: size as u64,
        })),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

fn digest(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

fn valid_name(value: &str) -> Result<String> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > 64 {
        return Err(Error::InvalidDisplayName);
    }
    Ok(name.into())
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock is after Unix epoch")
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_profile_session_and_sign_out() {
        let path =
            std::env::temp_dir().join(format!("cloudready-session-{}.sqlite", Uuid::new_v4()));
        let database = Database::open(&path).unwrap();
        let store = SessionStore::new(&database);

        let user = store.create_first_user("  Ada  ").unwrap();
        assert_eq!(user.display_name, "Ada");
        assert!(matches!(
            store.create_first_user("Grace"),
            Err(Error::SetupComplete)
        ));

        let (active, token) = store.start(user.id).unwrap();
        assert_eq!(store.current(Some(&token)).unwrap().id, active.id);

        store.end(&token).unwrap();
        assert!(matches!(store.current(Some(&token)), Err(Error::Missing)));
    }

    #[test]
    fn saves_and_returns_an_uploaded_profile_picture() {
        let path =
            std::env::temp_dir().join(format!("cloudready-picture-{}.sqlite", Uuid::new_v4()));
        let database = Database::open(&path).unwrap();
        let store = SessionStore::new(&database);
        let user = store.create_first_user("Ada").unwrap();
        assert!(
            store
                .find_user(user.id)
                .unwrap()
                .unwrap()
                .profile_picture
                .is_none()
        );

        let metadata = store
            .save_profile_picture(user.id, b"GIF89a".to_vec())
            .unwrap();
        assert_eq!(metadata.mime_type, "image/gif");
        assert_eq!(metadata.size, 6);
        let picture = store.profile_picture(user.id).unwrap();
        assert_eq!(picture.mime_type, "image/gif");
        assert_eq!(picture.content, b"GIF89a");
        assert_eq!(
            store.find_user(user.id).unwrap().unwrap().profile_picture,
            Some(metadata)
        );
        assert!(matches!(
            store.save_profile_picture(user.id, vec![0; MAX_PROFILE_PICTURE_BYTES + 1]),
            Err(Error::ProfilePictureTooLarge)
        ));
    }
}
