//! SQLite persistence for profiles, pictures, and hashed session records.

use super::{Error, ProfilePicture, ProfilePictureMetadata, Result, User};
use crate::database::Database;
use rusqlite::{OptionalExtension, params};
use uuid::Uuid;

/// All SQL for the session feature, borrowing the worker-owned connection.
pub(super) struct Repository<'a> {
    database: &'a Database,
}
impl<'a> Repository<'a> {
    pub(super) fn new(database: &'a Database) -> Self {
        Self { database }
    }
    /// Lists profiles selectable by this intentionally unprotected local installation.
    pub(super) fn users(&self) -> Result<Vec<User>> {
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
    pub(super) fn create_first_user(&self, display_name: String, created_at: i64) -> Result<User> {
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
            created_at,
            profile_picture: None,
        };
        transaction.execute(
            "INSERT INTO users(id,display_name,created_at) VALUES (?1,?2,?3)",
            params![user.id.as_bytes(), user.display_name, user.created_at],
        )?;
        transaction.commit()?;

        Ok(user)
    }

    /// Loads stored image bytes for a profile selected by the calling service.
    pub(super) fn profile_picture(&self, user_id: Uuid) -> Result<ProfilePicture> {
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

    pub(super) fn find_user(&self, id: Uuid) -> Result<Option<User>> {
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

    pub(super) fn insert_session(
        &self,
        user_id: Uuid,
        digest: &[u8],
        expires_at: i64,
        created_at: i64,
    ) -> Result<()> {
        self.database.connection().execute(
            "INSERT INTO sessions(token_digest,user_id,expires_at,created_at) VALUES (?1,?2,?3,?4)",
            params![digest, user_id.as_bytes(), expires_at, created_at],
        )?;
        Ok(())
    }

    pub(super) fn session(&self, digest: &[u8]) -> Result<Option<(User, i64)>> {
        self.database.connection().query_row(
            "SELECT u.id,u.display_name,u.created_at,p.mime_type,length(p.content),s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN profile_pictures p ON p.user_id=u.id WHERE s.token_digest=?1",
            params![digest], |row| Ok((user(row)?, row.get(5)?)),
        ).optional().map_err(Error::from)
    }

    pub(super) fn end(&self, digest: &[u8]) -> Result<()> {
        self.database.connection().execute(
            "DELETE FROM sessions WHERE token_digest=?1",
            params![digest],
        )?;
        Ok(())
    }

    pub(super) fn save_picture(
        &self,
        user_id: Uuid,
        mime_type: &str,
        content: &[u8],
    ) -> Result<()> {
        self.database.connection().execute(
            "INSERT INTO profile_pictures(user_id,mime_type,content) VALUES (?1,?2,?3) ON CONFLICT(user_id) DO UPDATE SET mime_type=excluded.mime_type,content=excluded.content",
            params![user_id.as_bytes(), mime_type, content],
        )?;
        Ok(())
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
