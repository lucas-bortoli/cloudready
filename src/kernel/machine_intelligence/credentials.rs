//! SQLite storage for host identity and profile-scoped provider credentials.
use super::Result;
use crate::database::Database;
use rusqlite::{OptionalExtension, params};
use uuid::Uuid;
/// Sensitive in-memory credentials; this record is never serialized to a browser.
#[derive(Clone)]
pub(super) struct Connection {
    pub(super) issuer: String,
    pub(super) subject: String,
    pub(super) email: Option<String>,
    pub(super) client_id: String,
    pub(super) id_token: String,
    pub(super) access_token: String,
    pub(super) refresh_token: String,
    pub(super) scopes: String,
    pub(super) expires_at: i64,
}

/// Keeps credential persistence and file protection out of OAuth and provider requests.
pub(super) struct Credentials<'a> {
    database: &'a Database,
}
impl<'a> Credentials<'a> {
    pub(super) fn new(database: &'a Database) -> Self {
        Self { database }
    }

    pub(super) fn host_id(&self) -> Result<String> {
        if let Some(id) = self
            .database
            .connection()
            .query_row(
                "SELECT host_id FROM machine_intelligence_host WHERE id=1",
                [],
                |row| row.get(0),
            )
            .optional()?
        {
            return Ok(id);
        }
        let id = format!("urn:uuid:{}", Uuid::new_v4());
        self.database.connection().execute(
            "INSERT INTO machine_intelligence_host(id,host_id) VALUES(1,?1)",
            [&id],
        )?;
        Ok(id)
    }

    pub(super) fn load(&self, user_id: Uuid) -> Result<Option<Connection>> {
        Ok(self.database.connection().query_row(
            "SELECT issuer,subject,email,client_id,id_token,access_token,refresh_token,scopes,expires_at FROM machine_intelligence_connections WHERE user_id=?1",
            [user_id.as_bytes()], |row| Ok(Connection {
                issuer: row.get(0)?, subject: row.get(1)?, email: row.get(2)?,
                client_id: row.get(3)?, id_token: row.get(4)?, access_token: row.get(5)?,
                refresh_token: row.get(6)?, scopes: row.get(7)?, expires_at: row.get(8)?,
            })
        ).optional()?)
    }

    pub(super) fn save(&self, user_id: Uuid, value: &Connection) -> Result<()> {
        self.database.protect_credentials()?;
        self.database.connection().execute(
            "INSERT INTO machine_intelligence_connections(user_id,issuer,subject,email,client_id,id_token,access_token,refresh_token,scopes,expires_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
             ON CONFLICT(user_id) DO UPDATE SET issuer=excluded.issuer,subject=excluded.subject,email=excluded.email,
             client_id=excluded.client_id,id_token=excluded.id_token,access_token=excluded.access_token,
             refresh_token=excluded.refresh_token,scopes=excluded.scopes,expires_at=excluded.expires_at",
            params![user_id.as_bytes(), value.issuer, value.subject, value.email, value.client_id,
                value.id_token, value.access_token, value.refresh_token, value.scopes, value.expires_at],
        )?;
        self.database.protect_credentials()?;
        Ok(())
    }
    pub(super) fn delete(&self, user_id: Uuid) -> Result<()> {
        self.database.connection().execute(
            "DELETE FROM machine_intelligence_connections WHERE user_id=?1",
            [user_id.as_bytes()],
        )?;
        Ok(())
    }
}
