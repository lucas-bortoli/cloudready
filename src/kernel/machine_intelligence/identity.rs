//! OpenID discovery and signed identity validation for OAuth callbacks.
use super::{Error, MachineIntelligence, Result};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use serde::Deserialize;
#[derive(Deserialize)]
pub(super) struct Discovery {
    pub(super) issuer: String,
    pub(super) jwks_uri: String,
    pub(super) revocation_endpoint: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct IdClaims {
    pub(super) sub: String,
    pub(super) email: Option<String>,
    pub(super) nonce: String,
}

impl MachineIntelligence<'_> {
    pub(super) fn validate_id_token(
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
}
