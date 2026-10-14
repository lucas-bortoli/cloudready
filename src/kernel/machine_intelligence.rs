use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use reqwest::blocking::Client;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::database::Database;

const AUTHORIZATION: &str = "https://auth.openai.com/api/accounts/authorize";
const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
const DISCOVERY: &str = "https://auth.openai.com/.well-known/openid-configuration";
const RESOURCE: &str = "https://api.openai.com/v1";
const SCOPES: &str =
    "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const CALLBACK_PATH: &str = "/auth/callback";
const ATTEMPT_LIFETIME: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("No ChatGPT account is connected.")]
    NotConnected,
    #[error("The authorization attempt was not found or has expired.")]
    AttemptMissing,
    #[error("ChatGPT authorization was cancelled.")]
    AuthorizationDenied,
    #[error("ChatGPT authorization could not be validated.")]
    InvalidAuthorization,
    #[error("ChatGPT plan use was not granted.")]
    PermissionMissing,
    #[error("The connected ChatGPT account needs to sign in again.")]
    ReauthorizationRequired,
    #[error("The request input is invalid.")]
    InvalidInput,
    #[error("The selected model is unavailable.")]
    ModelUnavailable,
    #[error("The ChatGPT usage limit was reached.")]
    UsageLimit,
    #[error("The model response did not complete.")]
    IncompleteResponse,
    #[error("The OpenAI service could not complete the request.")]
    Upstream,
    #[error("The credential database failed.")]
    Database(#[from] rusqlite::Error),
    #[error("The credential database could not be protected.")]
    CredentialProtection(#[from] std::io::Error),
}

impl Error {
    /// Returns the stable machine-readable code sent across the kernel API.
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotConnected => "mi-not-connected",
            Self::AttemptMissing => "mi-attempt-missing",
            Self::AuthorizationDenied => "mi-authorization-denied",
            Self::InvalidAuthorization => "mi-invalid-authorization",
            Self::PermissionMissing => "mi-permission-missing",
            Self::ReauthorizationRequired => "mi-reauthorization-required",
            Self::InvalidInput => "mi-invalid-input",
            Self::ModelUnavailable => "mi-model-unavailable",
            Self::UsageLimit => "mi-usage-limit",
            Self::IncompleteResponse => "mi-incomplete-response",
            Self::Upstream | Self::Database(_) | Self::CredentialProtection(_) => "mi-server-error",
        }
    }

    /// Returns the HTTP status used for this error at the kernel boundary.
    pub fn status(&self) -> u16 {
        match self {
            Self::NotConnected | Self::ReauthorizationRequired => 401,
            Self::AttemptMissing => 404,
            Self::AuthorizationDenied | Self::PermissionMissing => 403,
            Self::InvalidAuthorization | Self::InvalidInput => 400,
            Self::ModelUnavailable => 422,
            Self::UsageLimit => 429,
            Self::IncompleteResponse | Self::Upstream => 502,
            Self::Database(_) | Self::CredentialProtection(_) => 500,
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone)]
struct Connection {
    issuer: String,
    subject: String,
    email: Option<String>,
    client_id: String,
    id_token: String,
    access_token: String,
    refresh_token: String,
    scopes: String,
    expires_at: i64,
}

#[derive(Serialize)]
pub struct ConnectionStatus {
    connected: bool,
    email: Option<String>,
}

#[derive(Serialize)]
pub struct AuthorizationStart {
    pub attempt_id: String,
    pub url: String,
}

#[derive(Serialize)]
pub struct AuthorizationStatus {
    pub status: &'static str,
    pub error: Option<&'static str>,
}

#[derive(Serialize)]
pub struct Model {
    pub slug: String,
    pub display_name: String,
}

#[derive(Serialize)]
pub struct GeneratedText {
    pub text: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    expires_in: i64,
    scope: String,
}

#[derive(Deserialize)]
struct Discovery {
    issuer: String,
    jwks_uri: String,
    revocation_endpoint: Option<String>,
}

#[derive(Deserialize)]
struct IdClaims {
    sub: String,
    email: Option<String>,
    nonce: String,
}

struct Attempt {
    id: String,
    user_id: Uuid,
    state: String,
    nonce: String,
    verifier: String,
    redirect_uri: String,
    expected_client_id: Option<String>,
    started: Instant,
    outcome: Option<std::result::Result<(), &'static str>>,
}

/// Owns ChatGPT credentials and in-flight OAuth attempts for the local kernel.
pub struct MachineIntelligence<'a> {
    database: &'a Database,
    http: Client,
    attempts: HashMap<String, Attempt>,
    token_url: String,
    discovery_url: String,
    api_base: String,
    trusted_auth_origin: String,
}

impl<'a> MachineIntelligence<'a> {
    /// Creates a provider service backed by the shared system database.
    ///
    /// # Arguments
    ///
    /// * `database` - Database used to store the host identity and profile credentials.
    pub fn new(database: &'a Database) -> Self {
        Self {
            database,
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
    /// Returns [`Error::Database`] if the connection record cannot be read.
    pub fn connection(&self, user_id: Uuid) -> Result<ConnectionStatus> {
        let connected = self.load(user_id)?;
        Ok(ConnectionStatus {
            connected: connected.is_some(),
            email: connected.and_then(|value| value.email),
        })
    }

    /// Starts an OAuth attempt and returns the URL the frontend should open.
    ///
    /// # Arguments
    ///
    /// * `user_id` - CloudReady profile that will own the resulting credentials.
    /// * `callback_origin` - Local HTTP origin used for the OAuth loopback redirect.
    ///
    /// # Errors
    ///
    /// Returns [`Error::Database`] if the host identity or existing connection cannot be read
    /// or stored.
    pub fn start(&mut self, user_id: Uuid, callback_origin: &str) -> Result<AuthorizationStart> {
        self.attempts
            .retain(|_, attempt| attempt.started.elapsed() < ATTEMPT_LIFETIME);
        let existing = self.load(user_id)?;
        let host_id = self.host_id()?;
        let id = Uuid::new_v4().to_string();
        let state = random_string();
        let nonce = random_string();
        let verifier = random_string();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let redirect_uri = format!("{callback_origin}{CALLBACK_PATH}");
        let client_id = existing
            .as_ref()
            .map_or("dynamic_agent_client", |value| &value.client_id);
        let mut url = reqwest::Url::parse(AUTHORIZATION).expect("valid authorization URL");
        {
            let mut query = url.query_pairs_mut();
            query
                .append_pair("client_id", client_id)
                .append_pair("ext_agent_host_id", &host_id)
                .append_pair("response_type", "code")
                .append_pair("redirect_uri", &redirect_uri)
                .append_pair("scope", SCOPES)
                .append_pair("resource", RESOURCE)
                .append_pair("state", &state)
                .append_pair("nonce", &nonce)
                .append_pair("code_challenge_method", "S256")
                .append_pair("code_challenge", &challenge);
            if existing.is_none() {
                query.append_pair("agent_name_hint", "CloudReady");
            }
        }
        self.attempts.insert(
            state.clone(),
            Attempt {
                id: id.clone(),
                user_id,
                state,
                nonce,
                verifier,
                redirect_uri,
                expected_client_id: existing.map(|value| value.client_id),
                started: Instant::now(),
                outcome: None,
            },
        );
        Ok(AuthorizationStart {
            attempt_id: id,
            url: url.into(),
        })
    }

    /// Reports whether an OAuth attempt is pending, complete, or failed.
    ///
    /// # Arguments
    ///
    /// * `user_id` - CloudReady profile that started the attempt.
    /// * `id` - Attempt identifier returned by [`Self::start`].
    ///
    /// # Errors
    ///
    /// Returns [`Error::AttemptMissing`] if the attempt is unknown, belongs to another profile,
    /// or has expired.
    pub fn authorization_status(&self, user_id: Uuid, id: &str) -> Result<AuthorizationStatus> {
        let attempt = self
            .attempts
            .values()
            .find(|attempt| attempt.id == id && attempt.user_id == user_id)
            .ok_or(Error::AttemptMissing)?;
        if attempt.started.elapsed() >= ATTEMPT_LIFETIME {
            return Err(Error::AttemptMissing);
        }
        Ok(match attempt.outcome {
            None => AuthorizationStatus {
                status: "pending",
                error: None,
            },
            Some(Ok(())) => AuthorizationStatus {
                status: "succeeded",
                error: None,
            },
            Some(Err(error)) => AuthorizationStatus {
                status: "failed",
                error: Some(error),
            },
        })
    }

    /// Validates an OAuth callback, exchanges its code, and saves verified credentials.
    ///
    /// # Arguments
    ///
    /// * `query` - Decoded query parameters from the loopback callback URL.
    ///
    /// # Errors
    ///
    /// Returns [`Error::AttemptMissing`] for an unknown, expired, or replayed attempt,
    /// [`Error::InvalidAuthorization`] for an invalid callback, [`Error::AuthorizationDenied`]
    /// when the user declined, [`Error::PermissionMissing`] when plan use was not granted, or an
    /// upstream or database error when processing fails.
    pub fn callback(&mut self, query: &HashMap<String, String>) -> Result<()> {
        let state = query.get("state").ok_or(Error::InvalidAuthorization)?;
        let attempt = self.attempts.get(state).ok_or(Error::AttemptMissing)?;
        if attempt.started.elapsed() >= ATTEMPT_LIFETIME
            || attempt.outcome.is_some()
            || attempt.state != *state
        {
            return Err(Error::AttemptMissing);
        }
        let result = self.complete_callback(state, query);
        if let Some(attempt) = self.attempts.get_mut(state) {
            attempt.outcome = Some(result.as_ref().map(|_| ()).map_err(|error| error.code()));
        }
        result
    }

    fn complete_callback(&self, state: &str, query: &HashMap<String, String>) -> Result<()> {
        let attempt = self.attempts.get(state).ok_or(Error::AttemptMissing)?;
        if query.contains_key("error") {
            return Err(Error::AuthorizationDenied);
        }
        let code = query
            .get("code")
            .filter(|value| !value.is_empty())
            .ok_or(Error::InvalidAuthorization)?;
        let client_id = match (&attempt.expected_client_id, query.get("client_id")) {
            (Some(expected), Some(returned)) if expected != returned => {
                return Err(Error::InvalidAuthorization);
            }
            (Some(expected), _) => expected.clone(),
            (None, Some(returned)) if returned.starts_with("oaiapp_") => returned.clone(),
            _ => return Err(Error::InvalidAuthorization),
        };
        let token = self
            .http
            .post(&self.token_url)
            .form(&[
                ("grant_type", "authorization_code"),
                ("client_id", &client_id),
                ("code", code),
                ("code_verifier", &attempt.verifier),
                ("redirect_uri", &attempt.redirect_uri),
                ("resource", RESOURCE),
            ])
            .send()
            .map_err(|_| Error::Upstream)?;
        if !token.status().is_success() {
            return Err(Error::InvalidAuthorization);
        }
        let token: TokenResponse = token.json().map_err(|_| Error::InvalidAuthorization)?;
        if !has_scope(&token.scope, "chatgpt.tokens.use.direct") {
            return Err(Error::PermissionMissing);
        }
        let id_token = token.id_token.ok_or(Error::InvalidAuthorization)?;
        let refresh_token = token.refresh_token.ok_or(Error::InvalidAuthorization)?;
        let (issuer, claims) = self.validate_id_token(&id_token, &client_id, &attempt.nonce)?;
        if let Some(existing) = self.load(attempt.user_id)? {
            if existing.issuer != issuer
                || existing.subject != claims.sub
                || existing.client_id != client_id
            {
                return Err(Error::InvalidAuthorization);
            }
        }
        self.save(
            attempt.user_id,
            &Connection {
                issuer,
                subject: claims.sub,
                email: claims.email,
                client_id,
                id_token,
                access_token: token.access_token,
                refresh_token,
                scopes: token.scope,
                expires_at: now() + token.expires_in * 1000,
            },
        )?;
        Ok(())
    }

    fn validate_id_token(
        &self,
        token: &str,
        client_id: &str,
        nonce: &str,
    ) -> Result<(String, IdClaims)> {
        let discovery: Discovery = self
            .http
            .get(&self.discovery_url)
            .send()
            .map_err(|_| Error::Upstream)?
            .error_for_status()
            .map_err(|_| Error::Upstream)?
            .json()
            .map_err(|_| Error::Upstream)?;
        if discovery.issuer != "https://auth.openai.com"
            || !discovery
                .jwks_uri
                .starts_with(&format!("{}/", self.trusted_auth_origin))
        {
            return Err(Error::InvalidAuthorization);
        }
        let header = decode_header(token).map_err(|_| Error::InvalidAuthorization)?;
        if header.alg != Algorithm::RS256 {
            return Err(Error::InvalidAuthorization);
        }
        let keys: JwkSet = self
            .http
            .get(&discovery.jwks_uri)
            .send()
            .map_err(|_| Error::Upstream)?
            .error_for_status()
            .map_err(|_| Error::Upstream)?
            .json()
            .map_err(|_| Error::Upstream)?;
        let key = keys
            .keys
            .iter()
            .find(|key| key.common.key_id == header.kid)
            .ok_or(Error::InvalidAuthorization)?;
        let decoding_key = DecodingKey::from_jwk(key).map_err(|_| Error::InvalidAuthorization)?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[&discovery.issuer]);
        validation.set_audience(&[client_id]);
        let claims = decode::<IdClaims>(token, &decoding_key, &validation)
            .map_err(|_| Error::InvalidAuthorization)?
            .claims;
        if claims.nonce != nonce || claims.sub.is_empty() {
            return Err(Error::InvalidAuthorization);
        }
        Ok((discovery.issuer, claims))
    }

    /// Lists models visible to the connected ChatGPT account.
    ///
    /// # Arguments
    ///
    /// * `user_id` - CloudReady profile whose ChatGPT account supplies the model list.
    ///
    /// # Errors
    ///
    /// Returns [`Error::NotConnected`] if the profile has no connection,
    /// [`Error::PermissionMissing`] if plan use is unavailable,
    /// [`Error::ReauthorizationRequired`] if its access token is no longer accepted, or an
    /// upstream or database error if the request fails.
    pub fn models(&self, user_id: Uuid) -> Result<Vec<Model>> {
        let connection = self.ready_connection(user_id)?;
        let response = self
            .http
            .get(format!("{}/models", self.api_base))
            .bearer_auth(&connection.access_token)
            .send()
            .map_err(|_| Error::Upstream)?;
        if response.status().as_u16() == 401 {
            return Err(Error::ReauthorizationRequired);
        }
        if response.status().as_u16() == 403 {
            return Err(Error::PermissionMissing);
        }
        let response: Value = response
            .error_for_status()
            .map_err(|_| Error::Upstream)?
            .json()
            .map_err(|_| Error::Upstream)?;
        Ok(response
            .get("models")
            .and_then(Value::as_array)
            .ok_or(Error::Upstream)?
            .iter()
            .filter(|model| model.get("visibility").and_then(Value::as_str) == Some("list"))
            .filter_map(|model| {
                Some(Model {
                    slug: model.get("slug")?.as_str()?.to_owned(),
                    display_name: model.get("display_name")?.as_str()?.to_owned(),
                })
            })
            .collect())
    }

    /// Generates text and returns it only after the Responses stream completes.
    ///
    /// # Arguments
    ///
    /// * `user_id` - CloudReady profile whose ChatGPT plan is used.
    /// * `model` - Model slug available to the connected account.
    /// * `input` - Non-empty prompt text, limited to 16,000 bytes.
    ///
    /// # Errors
    ///
    /// Returns [`Error::NotConnected`] if the profile has no connection,
    /// [`Error::InvalidInput`] for malformed prompt parameters,
    /// [`Error::ModelUnavailable`] when the account cannot use the selected model,
    /// [`Error::UsageLimit`] when ChatGPT reports a usage limit,
    /// [`Error::ReauthorizationRequired`] when the access token is rejected, or
    /// [`Error::IncompleteResponse`] when the stream does not complete.
    pub fn generate_text(&self, user_id: Uuid, model: &str, input: &str) -> Result<GeneratedText> {
        if input.trim().is_empty() || input.len() > 16_000 || model.is_empty() || model.len() > 100
        {
            return Err(Error::InvalidInput);
        }
        if !self
            .models(user_id)?
            .iter()
            .any(|candidate| candidate.slug == model)
        {
            return Err(Error::ModelUnavailable);
        }
        let connection = self.ready_connection(user_id)?;
        let response = self.http.post(format!("{}/responses", self.api_base))
            .bearer_auth(&connection.access_token)
            .json(&json!({"model": model, "input": [{"role": "user", "content": input}], "store": false, "stream": true}))
            .send().map_err(|_| Error::Upstream)?;
        if response.status().as_u16() == 401 {
            return Err(Error::ReauthorizationRequired);
        }
        if response.status().as_u16() == 403 {
            return Err(Error::PermissionMissing);
        }
        if response.status().as_u16() == 429 {
            return Err(Error::UsageLimit);
        }
        let response = response.error_for_status().map_err(|_| Error::Upstream)?;
        let mut text = String::new();
        let mut completed = false;
        let mut event_data = String::new();
        for line in BufReader::new(response).lines() {
            let line = line.map_err(|_| Error::IncompleteResponse)?;
            if let Some(data) = line.strip_prefix("data: ") {
                event_data.push_str(data);
            } else if line.is_empty() && !event_data.is_empty() {
                let event: Value =
                    serde_json::from_str(&event_data).map_err(|_| Error::IncompleteResponse)?;
                event_data.clear();
                match event.get("type").and_then(Value::as_str) {
                    Some("response.output_text.delta") => {
                        text.push_str(
                            event
                                .get("delta")
                                .and_then(Value::as_str)
                                .ok_or(Error::IncompleteResponse)?,
                        );
                    }
                    Some("response.completed") => {
                        completed = true;
                        break;
                    }
                    Some("response.failed") => {
                        let code = event
                            .pointer("/response/error/code")
                            .and_then(Value::as_str);
                        return Err(
                            if matches!(
                                code,
                                Some(
                                    "subscription_sharing_usage_limit_exceeded"
                                        | "subscription_sharing_usage_unavailable"
                                )
                            ) {
                                Error::UsageLimit
                            } else {
                                Error::Upstream
                            },
                        );
                    }
                    Some("response.incomplete" | "error") => return Err(Error::IncompleteResponse),
                    _ => {}
                }
            }
        }
        if !completed {
            return Err(Error::IncompleteResponse);
        }
        Ok(GeneratedText { text })
    }

    /// Revokes and removes the profile's ChatGPT credentials.
    ///
    /// # Arguments
    ///
    /// * `user_id` - CloudReady profile whose ChatGPT connection should be removed.
    ///
    /// # Returns
    ///
    /// `true` when remote revocation was confirmed or no connection existed; `false` when local
    /// credentials were removed but remote revocation could not be confirmed.
    ///
    /// # Errors
    ///
    /// Returns [`Error::Database`] if the local connection record cannot be read or deleted.
    pub fn disconnect(&self, user_id: Uuid) -> Result<bool> {
        let Some(connection) = self.load(user_id)? else {
            return Ok(true);
        };
        let discovery: std::result::Result<Discovery, _> = self
            .http
            .get(&self.discovery_url)
            .send()
            .and_then(|response| response.error_for_status())
            .and_then(|response| response.json());
        let revoked = discovery
            .ok()
            .and_then(|value| value.revocation_endpoint)
            .filter(|url| url.starts_with(&format!("{}/", self.trusted_auth_origin)))
            .and_then(|url| {
                self.http
                    .post(url)
                    .form(&[
                        ("token", connection.refresh_token.as_str()),
                        ("token_type_hint", "refresh_token"),
                        ("client_id", connection.client_id.as_str()),
                    ])
                    .send()
                    .ok()
            })
            .is_some_and(|response| response.status().is_success());
        self.database.connection().execute(
            "DELETE FROM machine_intelligence_connections WHERE user_id=?1",
            [user_id.as_bytes()],
        )?;
        Ok(revoked)
    }

    fn ready_connection(&self, user_id: Uuid) -> Result<Connection> {
        let mut connection = self.load(user_id)?.ok_or(Error::NotConnected)?;
        if !has_scope(&connection.scopes, "chatgpt.tokens.use.direct") {
            return Err(Error::PermissionMissing);
        }
        if connection.expires_at > now() + 60_000 {
            return Ok(connection);
        }
        let response = self
            .http
            .post(&self.token_url)
            .form(&[
                ("grant_type", "refresh_token"),
                ("client_id", &connection.client_id),
                ("refresh_token", &connection.refresh_token),
                ("resource", RESOURCE),
            ])
            .send()
            .map_err(|_| Error::Upstream)?;
        if response.status().as_u16() == 400 || response.status().as_u16() == 401 {
            return Err(Error::ReauthorizationRequired);
        }
        let token: TokenResponse = response
            .error_for_status()
            .map_err(|_| Error::Upstream)?
            .json()
            .map_err(|_| Error::Upstream)?;
        if !has_scope(&token.scope, "chatgpt.tokens.use.direct") {
            return Err(Error::PermissionMissing);
        }
        connection.access_token = token.access_token;
        connection.refresh_token = token.refresh_token.ok_or(Error::Upstream)?;
        connection.expires_at = now() + token.expires_in * 1000;
        connection.scopes = token.scope;
        self.save(user_id, &connection)?;
        Ok(connection)
    }

    fn host_id(&self) -> Result<String> {
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

    fn load(&self, user_id: Uuid) -> Result<Option<Connection>> {
        Ok(self.database.connection().query_row(
            "SELECT issuer,subject,email,client_id,id_token,access_token,refresh_token,scopes,expires_at FROM machine_intelligence_connections WHERE user_id=?1",
            [user_id.as_bytes()], |row| Ok(Connection {
                issuer: row.get(0)?, subject: row.get(1)?, email: row.get(2)?,
                client_id: row.get(3)?, id_token: row.get(4)?, access_token: row.get(5)?,
                refresh_token: row.get(6)?, scopes: row.get(7)?, expires_at: row.get(8)?,
            })
        ).optional()?)
    }

    fn save(&self, user_id: Uuid, value: &Connection) -> Result<()> {
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
}

fn has_scope(scopes: &str, scope: &str) -> bool {
    scopes.split_whitespace().any(|item| item == scope)
}

fn random_string() -> String {
    format!(
        "{}{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    )
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after epoch")
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header as JwtHeader, encode};
    use rsa::{RsaPrivateKey, pkcs1::EncodeRsaPrivateKey, traits::PublicKeyParts};
    use std::thread;
    use tiny_http::{Header, Response, Server, StatusCode};

    fn fixture() -> (Database, Uuid) {
        let path = std::env::temp_dir().join(format!("cloudready-mi-{}.sqlite", Uuid::new_v4()));
        let database = Database::open(&path).unwrap();
        let user = crate::session::SessionStore::new(&database)
            .create_first_user("Ada")
            .unwrap();
        (database, user.id)
    }

    fn connection(expires_at: i64) -> Connection {
        Connection {
            issuer: "https://auth.openai.com".into(),
            subject: "subject".into(),
            email: Some("ada@example.com".into()),
            client_id: "oaiapp_test".into(),
            id_token: "id".into(),
            access_token: "access".into(),
            refresh_token: "refresh".into(),
            scopes: SCOPES.into(),
            expires_at,
        }
    }

    fn server(
        responses: Vec<(&'static str, String)>,
    ) -> (String, thread::JoinHandle<Vec<(String, String)>>) {
        let server = Server::http("127.0.0.1:0").unwrap();
        let base = format!("http://{}", server.server_addr());
        let handle = thread::spawn(move || {
            let mut requests = Vec::new();
            for (expected_path, response) in responses {
                let mut request = server.recv().unwrap();
                assert_eq!(request.url(), expected_path);
                let mut body = String::new();
                request.as_reader().read_to_string(&mut body).unwrap();
                requests.push((request.url().into(), body));
                request
                    .respond(
                        Response::from_string(
                            response.replace("{base}", &format!("http://{}", server.server_addr())),
                        )
                        .with_status_code(StatusCode(200))
                        .with_header(
                            Header::from_bytes("Content-Type", "application/json").unwrap(),
                        ),
                    )
                    .unwrap();
            }
            requests
        });
        (base, handle)
    }

    #[test]
    fn credentials_are_scoped_to_a_profile() {
        let (database, first) = fixture();
        let second = Uuid::new_v4();
        database
            .connection()
            .execute(
                "INSERT INTO users(id,display_name,created_at) VALUES(?1,'Grace',0)",
                [second.as_bytes()],
            )
            .unwrap();
        let intelligence = MachineIntelligence::new(&database);
        intelligence
            .save(first, &connection(now() + 300_000))
            .unwrap();
        assert!(intelligence.connection(first).unwrap().connected);
        assert!(!intelligence.connection(second).unwrap().connected);
        assert!(matches!(
            intelligence.models(second),
            Err(Error::NotConnected)
        ));
    }

    #[test]
    fn callback_checks_state_and_cannot_be_replayed() {
        let (database, user) = fixture();
        let mut intelligence = MachineIntelligence::new(&database);
        let started = intelligence.start(user, "http://127.0.0.1:3000").unwrap();
        let state = reqwest::Url::parse(&started.url)
            .unwrap()
            .query_pairs()
            .find(|(key, _)| key == "state")
            .unwrap()
            .1
            .into_owned();
        assert!(matches!(
            intelligence.callback(&HashMap::from([("state".into(), "wrong".into())])),
            Err(Error::AttemptMissing)
        ));
        assert_eq!(
            intelligence
                .authorization_status(user, &started.attempt_id)
                .unwrap()
                .status,
            "pending"
        );
        assert!(matches!(
            intelligence.callback(&HashMap::from([
                ("state".into(), state.clone()),
                ("error".into(), "access_denied".into())
            ])),
            Err(Error::AuthorizationDenied)
        ));
        assert_eq!(
            intelligence
                .authorization_status(user, &started.attempt_id)
                .unwrap()
                .status,
            "failed"
        );
        assert!(matches!(
            intelligence.callback(&HashMap::from([("state".into(), state)])),
            Err(Error::AttemptMissing)
        ));
    }

    #[test]
    fn callback_validates_signed_identity_and_saves_connection() {
        let (database, user) = fixture();
        let mut intelligence = MachineIntelligence::new(&database);
        let started = intelligence.start(user, "http://127.0.0.1:3000").unwrap();
        let authorization = reqwest::Url::parse(&started.url).unwrap();
        let parameters: HashMap<String, String> = authorization
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect();
        let state = parameters.get("state").unwrap().clone();
        let nonce = parameters.get("nonce").unwrap().clone();
        let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
        let public = private.to_public_key();
        let mut header = JwtHeader::new(Algorithm::RS256);
        header.kid = Some("test-key".into());
        let id_token = encode(
            &header,
            &json!({
                "iss":"https://auth.openai.com", "aud":"oaiapp_test", "sub":"verified-subject",
                "nonce":nonce, "email":"ada@example.com", "exp":now() / 1000 + 3600
            }),
            &EncodingKey::from_rsa_der(private.to_pkcs1_der().unwrap().as_bytes()),
        )
        .unwrap();
        let jwks = json!({"keys":[{
            "kty":"RSA", "kid":"test-key", "alg":"RS256", "use":"sig",
            "n":URL_SAFE_NO_PAD.encode(public.n().to_bytes_be()),
            "e":URL_SAFE_NO_PAD.encode(public.e().to_bytes_be())
        }]})
        .to_string();
        let (base, handle) = server(vec![
            ("/token", json!({"access_token":"access","refresh_token":"refresh","id_token":id_token,"expires_in":3600,"scope":SCOPES}).to_string()),
            ("/discovery", json!({"issuer":"https://auth.openai.com","jwks_uri":"{base}/jwks"}).to_string()),
            ("/jwks", jwks),
        ]);
        intelligence.token_url = format!("{base}/token");
        intelligence.discovery_url = format!("{base}/discovery");
        intelligence.trusted_auth_origin = base;
        intelligence
            .callback(&HashMap::from([
                ("state".into(), state),
                ("code".into(), "auth-code".into()),
                ("client_id".into(), "oaiapp_test".into()),
            ]))
            .unwrap();
        assert_eq!(
            intelligence
                .authorization_status(user, &started.attempt_id)
                .unwrap()
                .status,
            "succeeded"
        );
        assert_eq!(
            intelligence.load(user).unwrap().unwrap().subject,
            "verified-subject"
        );
        assert_eq!(handle.join().unwrap().len(), 3);
    }

    #[test]
    fn refresh_replaces_rotating_token_before_model_request() {
        let (database, user) = fixture();
        let (base, handle) = server(vec![
            ("/token", json!({"access_token":"new-access","refresh_token":"new-refresh","expires_in":3600,"scope":SCOPES}).to_string()),
            ("/models", json!({"models":[{"slug":"test-model","display_name":"Test model","visibility":"list"}]}).to_string()),
        ]);
        let mut intelligence = MachineIntelligence::new(&database);
        intelligence.token_url = format!("{base}/token");
        intelligence.api_base = base;
        intelligence.save(user, &connection(now() - 1)).unwrap();
        assert_eq!(intelligence.models(user).unwrap()[0].slug, "test-model");
        assert_eq!(
            intelligence.load(user).unwrap().unwrap().refresh_token,
            "new-refresh"
        );
        let requests = handle.join().unwrap();
        assert!(requests[0].1.contains("refresh_token=refresh"));
        assert!(!requests[0].1.contains("scope="));
    }

    #[test]
    fn disconnect_revokes_and_clears_credentials() {
        let (database, user) = fixture();
        let (base, handle) = server(vec![
            ("/discovery", json!({"issuer":"https://auth.openai.com","jwks_uri":"https://auth.openai.com/jwks","revocation_endpoint":"{base}/revoke"}).to_string()),
            ("/revoke", String::new()),
        ]);
        let mut intelligence = MachineIntelligence::new(&database);
        intelligence.discovery_url = format!("{base}/discovery");
        intelligence.trusted_auth_origin = base;
        intelligence
            .save(user, &connection(now() + 300_000))
            .unwrap();
        assert!(intelligence.disconnect(user).unwrap());
        assert!(!intelligence.connection(user).unwrap().connected);
        let requests = handle.join().unwrap();
        assert!(requests[1].1.contains("refresh_token"));
    }

    #[test]
    fn response_stream_requires_completed_event() {
        let (database, user) = fixture();
        let model_json = json!({"models":[{"slug":"test-model","display_name":"Test model","visibility":"list"}]}).to_string();
        let (base, handle) = server(vec![
            ("/models", model_json.clone()),
            ("/responses", "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}\n\ndata: {\"type\":\"response.completed\"}\n\n".into()),
            ("/models", model_json.clone()),
            ("/responses", "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n".into()),
            ("/models", model_json),
            ("/responses", "data: {\"type\":\"response.failed\",\"response\":{\"error\":{\"code\":\"subscription_sharing_usage_limit_exceeded\"}}}\n\n".into()),
        ]);
        let mut intelligence = MachineIntelligence::new(&database);
        intelligence.api_base = base;
        intelligence
            .save(user, &connection(now() + 300_000))
            .unwrap();
        assert_eq!(
            intelligence
                .generate_text(user, "test-model", "Hi")
                .unwrap()
                .text,
            "Hello"
        );
        assert!(matches!(
            intelligence.generate_text(user, "test-model", "Hi"),
            Err(Error::IncompleteResponse)
        ));
        assert!(matches!(
            intelligence.generate_text(user, "test-model", "Hi"),
            Err(Error::UsageLimit)
        ));
        handle.join().unwrap();
    }
}
