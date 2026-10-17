//! Machine Intelligence use cases and their OAuth, provider, and credential adapters.
mod credentials;
mod error;
mod identity;
mod models;
mod oauth;
mod provider;
mod service;
#[cfg(test)]
mod tests;
pub use error::{Error, Result};
pub use models::{AuthorizationStart, AuthorizationStatus, ConnectionStatus, GeneratedText, Model};
pub use service::MachineIntelligence;

pub(crate) use provider::GenerationClient;
