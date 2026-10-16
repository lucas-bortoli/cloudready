//! Values returned by Machine Intelligence use cases.
use serde::Serialize;
/// Browser-safe connection state that excludes provider credentials.
#[derive(Serialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub(super) email: Option<String>,
}

/// An authorization URL and the identifier used to poll its outcome.
#[derive(Serialize)]
pub struct AuthorizationStart {
    pub attempt_id: String,
    pub url: String,
}

/// Progress or final outcome of a retained authorization attempt.
#[derive(Serialize)]
pub struct AuthorizationStatus {
    pub status: &'static str,
    pub error: Option<&'static str>,
}

/// A model available to the connected provider account.
#[derive(Serialize)]
pub struct Model {
    pub slug: String,
    pub display_name: String,
}

/// Text accepted only after the provider reports a completed response.
#[derive(Serialize)]
pub struct GeneratedText {
    pub text: String,
}
