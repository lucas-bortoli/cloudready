//! Machine Intelligence REST routes.

use std::io::Read;

use axum::{http::Method, response::Response};
use serde::Deserialize;

use crate::{database, machine_intelligence, session};

use super::{common, session_routes};

pub(crate) fn response(
    intelligence: &mut machine_intelligence::MachineIntelligence<'_>,
    database: &database::Database,
    method: &Method,
    path: &str,
    url: &str,
    body: &mut impl Read,
    token: Option<&str>,
    address: &str,
) -> Response {
    if path == "/auth/callback" {
        // Do not expose token exchange or validation details on the browser callback page.
        let result = if *method == Method::GET {
            intelligence.callback(&common::query(url))
        } else {
            Err(machine_intelligence::Error::InvalidInput)
        };
        let (status, message) = match result {
            Ok(()) => (
                200,
                "Connected to ChatGPT. You can return to CloudReady and close this window.",
            ),
            Err(_) => (
                400,
                "ChatGPT connection could not be completed. Return to CloudReady for details.",
            ),
        };
        return common::response(
            format!(
                "<!doctype html><title>CloudReady</title><main><h1>CloudReady</h1><p>{message}</p></main>"
            ),
            status,
            &[
                ("Content-Type", "text/html; charset=utf-8"),
                ("Cache-Control", "no-store"),
            ],
        );
    }

    // Never accept a profile ID from the request body for provider operations.
    let user = match session::SessionStore::new(database).current(token) {
        Ok(user) => user,
        Err(error) => return session_routes::error_response(error),
    };
    let query = common::query(url);
    let result: machine_intelligence::Result<serde_json::Value> = (|| match (method, path) {
        (&Method::GET, "/api/mi/connection") => {
            serde_json::to_value(intelligence.connection(user.id)?)
                .map_err(|_| machine_intelligence::Error::Upstream)
        }
        (&Method::POST, "/api/mi/authorization") => {
            // Sign in with ChatGPT requires a loopback redirect on 127.0.0.1.
            if !address.starts_with("http://127.0.0.1:") {
                return Err(machine_intelligence::Error::InvalidAuthorization);
            }
            serde_json::to_value(intelligence.start(user.id, address)?)
                .map_err(|_| machine_intelligence::Error::Upstream)
        }
        (&Method::GET, "/api/mi/authorization") => serde_json::to_value(
            intelligence.authorization_status(
                user.id,
                query
                    .get("attempt_id")
                    .ok_or(machine_intelligence::Error::InvalidInput)?,
            )?,
        )
        .map_err(|_| machine_intelligence::Error::Upstream),
        (&Method::DELETE, "/api/mi/connection") => {
            Ok(serde_json::json!({"revoked": intelligence.disconnect(user.id)?}))
        }
        (&Method::GET, "/api/mi/models") => serde_json::to_value(intelligence.models(user.id)?)
            .map_err(|_| machine_intelligence::Error::Upstream),
        (&Method::POST, "/api/mi/responses") => {
            #[derive(Deserialize)]
            struct Input {
                model: String,
                input: String,
            }
            // Bound prompt payload size before deserializing it into memory.
            let input: Input = serde_json::from_reader(body.take(16_384))
                .map_err(|_| machine_intelligence::Error::InvalidInput)?;
            serde_json::to_value(intelligence.generate_text(user.id, &input.model, &input.input)?)
                .map_err(|_| machine_intelligence::Error::Upstream)
        }
        _ => Err(machine_intelligence::Error::InvalidInput),
    })();
    match result {
        Ok(value) => common::response(
            value.to_string(),
            200,
            &[
                ("Content-Type", "application/json; charset=utf-8"),
                ("Cache-Control", "no-store"),
            ],
        ),
        Err(error) => common::response(
            serde_json::json!({"error": {"code": error.code(), "message": error.to_string()}})
                .to_string(),
            error_status(&error),
            &[
                ("Content-Type", "application/json; charset=utf-8"),
                ("Cache-Control", "no-store"),
            ],
        ),
    }
}
/// Maps feature failures to HTTP status codes at the transport boundary.
fn error_status(error: &machine_intelligence::Error) -> u16 {
    match error {
        machine_intelligence::Error::NotConnected
        | machine_intelligence::Error::ReauthorizationRequired => 401,
        machine_intelligence::Error::AttemptMissing => 404,
        machine_intelligence::Error::AuthorizationDenied
        | machine_intelligence::Error::PermissionMissing => 403,
        machine_intelligence::Error::InvalidAuthorization
        | machine_intelligence::Error::InvalidInput => 400,
        machine_intelligence::Error::ModelUnavailable => 422,
        machine_intelligence::Error::UsageLimit => 429,
        machine_intelligence::Error::IncompleteResponse | machine_intelligence::Error::Upstream => {
            502
        }
        machine_intelligence::Error::Database(_)
        | machine_intelligence::Error::CredentialProtection(_) => 500,
    }
}
