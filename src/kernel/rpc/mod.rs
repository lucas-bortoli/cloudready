//! Transport-independent session RPC protocol, dispatch, and event routing.
//!
//! Feature adapters register methods with the dispatcher. Socket upgrades and frame handling
//! belong to the WebSocket transport; feature-specific state belongs to the feature services.

pub(crate) mod dispatcher;
pub(crate) mod hub;
