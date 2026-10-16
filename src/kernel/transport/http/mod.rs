//! REST routing on the kernel's sole Axum listener.
//!
//! The network adapter bounds incoming bodies before handing owned data to the blocking
//! service worker. Route-family modules own request decoding and feature error mapping.

use std::sync::Arc;

use axum::{
    body::to_bytes,
    extract::{Request, State},
    http::Method,
    response::Response,
};

use super::TransportState;
use crate::{application::Application, session};

pub(crate) mod common;
mod filesystem_routes;
mod machine_intelligence_routes;
mod session_routes;

// The build script enables embedded asset serving only for release builds.
#[cfg(embedded_frontend)]
mod frontend;

/// Receives REST requests without making an internal HTTP round trip.
pub(super) async fn handle(State(state): State<Arc<TransportState>>, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let url = parts.uri.to_string();
    let path = parts.uri.path().to_owned();
    // Static assets never need the database worker or request-body buffering.
    #[cfg(embedded_frontend)]
    if path != "/api"
        && !path.starts_with("/api/")
        && path != "/auth/callback"
        && let Some(response) = frontend::response(&parts.method, &path)
    {
        return response;
    }
    let body = match to_bytes(body, 16 * 1024 * 1024).await {
        Ok(body) => body,
        Err(_) => {
            return common::response(
                r#"{"error":{"code":"request-body-too-large","message":"Request body exceeds the limit or could not be read."}}"#,
                413,
                &[("Content-Type", "application/json")],
            );
        }
    };
    let token = common::cookie(&parts.headers, common::SESSION_COOKIE);
    dispatch(
        &state.application,
        parts.method,
        path,
        url,
        body.to_vec(),
        token,
        state.origin.clone(),
    )
    .await
}

async fn dispatch(
    application: &Application,
    method: Method,
    path: String,
    url: String,
    body: Vec<u8>,
    token: Option<String>,
    origin: String,
) -> Response {
    let result = application
        .call(move |database, intelligence| {
            let mut body = body.as_slice();
            if path == "/auth/callback" || path.starts_with("/api/mi/") {
                return machine_intelligence_routes::response(
                    intelligence,
                    database,
                    &method,
                    &path,
                    &url,
                    &mut body,
                    token.as_deref(),
                    &origin,
                );
            }
            if path.starts_with("/api/fs/") {
                // Ownership is always derived from the authenticated token, never a body field.
                return match session::SessionStore::new(database).current(token.as_deref()) {
                    Ok(user) => filesystem_routes::response(
                        database, user.id, &method, &path, &url, &mut body,
                    ),
                    Err(error) => session_routes::error_response(error),
                };
            }
            if path.starts_with("/api/session")
                || path == "/api/users"
                || path == "/api/profile-picture"
            {
                return session_routes::response(
                    database,
                    &method,
                    &path,
                    &mut body,
                    token.as_deref(),
                );
            }
            let (status, body) = match (&method, path.as_str()) {
                (&Method::GET, "/api/health") => (200, r#"{"status":"ok"}"#),
                (&Method::GET, "/api/hello") => (200, r#"{"message":"Hello from Rust!"}"#),
                (_, "/api/health" | "/api/hello") => (405, r#"{"error":"Method not allowed"}"#),
                _ => (404, r#"{"error":"Not found"}"#),
            };
            if status == 405 {
                common::response(
                    body,
                    status,
                    &[("Content-Type", "application/json"), ("Allow", "GET")],
                )
            } else {
                common::response(body, status, &[("Content-Type", "application/json")])
            }
        })
        .await;
    result.unwrap_or_else(|_| unavailable_response())
}

/// Maps worker failure to a stable transport error instead of a proxy gateway failure.
pub(super) fn unavailable_response() -> Response {
    common::response(
        r#"{"error":{"code":"kernel-unavailable","message":"Kernel services are unavailable."}}"#,
        503,
        &[("Content-Type", "application/json")],
    )
}
