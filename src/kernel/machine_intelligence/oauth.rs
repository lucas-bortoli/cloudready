//! OAuth attempts, callback validation, token refresh, and remote revocation.
use super::{
    AuthorizationStart, AuthorizationStatus, Error, MachineIntelligence, Result,
    credentials::Connection, identity::Discovery, provider::RESOURCE, service::now,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
use uuid::Uuid;
const AUTHORIZATION: &str = "https://auth.openai.com/api/accounts/authorize";
pub(super) const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
pub(super) const DISCOVERY: &str = "https://auth.openai.com/.well-known/openid-configuration";
pub(super) const SCOPES: &str =
    "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const CALLBACK_PATH: &str = "/auth/callback";
const ATTEMPT_LIFETIME: Duration = Duration::from_secs(5 * 60);

#[derive(Deserialize)]
pub(super) struct TokenResponse {
    pub(super) access_token: String,
    pub(super) refresh_token: Option<String>,
    pub(super) id_token: Option<String>,
    pub(super) expires_in: i64,
    pub(super) scope: String,
}

pub(super) struct Attempt {
    pub(super) id: String,
    pub(super) user_id: Uuid,
    pub(super) state: String,
    pub(super) nonce: String,
    pub(super) verifier: String,
    pub(super) redirect_uri: String,
    pub(super) expected_client_id: Option<String>,
    pub(super) started: Instant,
    pub(super) outcome: Option<std::result::Result<(), &'static str>>,
}

impl MachineIntelligence<'_> {
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
        let existing = self.credentials.load(user_id)?;
        let host_id = self.credentials.host_id()?;
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
        if let Some(existing) = self.credentials.load(attempt.user_id)? {
            if existing.issuer != issuer
                || existing.subject != claims.sub
                || existing.client_id != client_id
            {
                return Err(Error::InvalidAuthorization);
            }
        }
        self.credentials.save(
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
        let Some(connection) = self.credentials.load(user_id)? else {
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
        self.credentials.delete(user_id)?;
        Ok(revoked)
    }

    pub(super) fn ready_connection(&self, user_id: Uuid) -> Result<Connection> {
        let mut connection = self.credentials.load(user_id)?.ok_or(Error::NotConnected)?;
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
        self.credentials.save(user_id, &connection)?;
        Ok(connection)
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
