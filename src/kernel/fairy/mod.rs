//! Fairy's profile-owned conversation service and its feature-specific RPC adapter.

mod conversation;
pub(crate) mod rpc;
pub(crate) mod service;

use conversation::Conversation;

/// The fixed model is application behavior, not a user preference.
pub const MODEL: &str = "gpt-6-luna";

pub(super) const INSTRUCTIONS: &str = "You are Navi, a concise and friendly CloudReady helper. You cannot take OS actions yet. Reply briefly.";
