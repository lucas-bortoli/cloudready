//! Provider service construction and connection status queries.
use super::{
    ConnectionStatus, Result,
    credentials::Credentials,
    oauth::{Attempt, DISCOVERY, TOKEN},
    provider::RESOURCE,
};
use crate::database::Database;
use reqwest::blocking::Client;
use std::{
    collections::HashMap,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;
/// Owns ChatGPT credentials and in-flight OAuth attempts for the local kernel.
pub struct MachineIntelligence<'a> {
    pub(super) credentials: Credentials<'a>,
    pub(super) http: Client,
    pub(super) attempts: HashMap<String, Attempt>,
    pub(super) token_url: String,
    pub(super) discovery_url: String,
    pub(super) api_base: String,
    pub(super) trusted_auth_origin: String,
}

impl<'a> MachineIntelligence<'a> {
    /// Creates a provider service backed by the shared system database.
    ///
    /// # Arguments
    ///
    /// * `database` - Database used to store the host identity and profile credentials.
    pub fn new(database: &'a Database) -> Self {
        Self {
            credentials: Credentials::new(database),
            http: Client::builder()
                .timeout(Duration::from_secs(60))
                .build()
                .expect("HTTP client"),
            attempts: HashMap::new(),
            token_url: TOKEN.into(),
            discovery_url: DISCOVERY.into(),
            api_base: RESOURCE.into(),
            trusted_auth_origin: "https://auth.openai.com".into(),
        }
    }

    /// Returns whether a profile has a connected ChatGPT account and its display email.
    ///
    /// # Arguments
    ///
    /// * `user_id` - CloudReady profile whose connection should be inspected.
    ///
    /// # Errors
    ///
    /// Returns [`super::Error::Database`] if the connection record cannot be read.
    pub fn connection(&self, user_id: Uuid) -> Result<ConnectionStatus> {
        let connected = self.credentials.load(user_id)?;
        Ok(ConnectionStatus {
            connected: connected.is_some(),
            email: connected.and_then(|value| value.email),
        })
    }
}
pub(super) fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after epoch")
        .as_millis() as i64
}
