//! Network-facing adapters for the kernel.
//!
//! Transport modules translate HTTP and WebSocket concerns into feature calls. They must not
//! contain persistence or business-policy decisions.

pub(crate) mod http;
pub(crate) mod websocket;

use std::sync::Arc;

use crate::{application::Application, rpc::dispatcher::Dispatcher};
use axum::{
    Router,
    routing::{any, get},
};

#[cfg(test)]
mod tests;

/// Dependencies shared by the HTTP and WebSocket adapters.
pub(crate) struct TransportState {
    application: Application,
    origin: String,
    rpc: Arc<Dispatcher>,
}

/// Builds the kernel's sole public router with shared application services.
pub(crate) fn router(application: Application, origin: String, rpc: Arc<Dispatcher>) -> Router {
    let state = Arc::new(TransportState {
        application,
        origin,
        rpc,
    });
    Router::new()
        .route("/api/session/rpc", get(websocket::upgrade))
        .fallback(any(http::handle))
        .with_state(state)
}
