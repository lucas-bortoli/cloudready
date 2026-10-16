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
}

pub type Result<T> = std::result::Result<T, Error>;
