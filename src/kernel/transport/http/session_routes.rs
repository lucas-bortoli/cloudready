//! Profile and browser-session REST routes.

use std::io::Read;

use axum::{http::Method, response::Response};
use serde::Deserialize;
use uuid::Uuid;

use crate::{database, session};

use super::common;

pub(crate) fn response(
    database: &database::Database,
    method: &Method,
    path: &str,
    body: &mut impl Read,
    token: Option<&str>,
) -> Response {
    let store = session::SessionStore::new(database);

    // Keep session transport in one match so success and error responses share one wire format.
    let result = match (method, path) {
        (&Method::GET, "/api/session") => store
            .current(token)
            .and_then(|user| session_json(user).map(|response| (response, None))),
        (&Method::GET, "/api/users") => store
            .users()
            .and_then(|users| session_json(users).map(|response| (response, None))),
        (&Method::POST, "/api/users") => (|| {
            // The store enforces that this can succeed only during first-run setup.
            let input: CreateUserInput = read_session_json(body)?;
            let user = store.create_first_user(&input.display_name)?;
            let (user, token) = store.start(user.id)?;
            Ok((session_json(user)?, Some(session_cookie(&token))))
        })(),
        (&Method::POST, "/api/session") => (|| {
            let input: StartSessionInput = read_session_json(body)?;
            let user_id =
                Uuid::parse_str(&input.user_id).map_err(|_| session::Error::UserNotFound)?;
            let (user, token) = store.start(user_id)?;
            Ok((session_json(user)?, Some(session_cookie(&token))))
        })(),
        (&Method::DELETE, "/api/session") => {
            // Sign-out should still clear the browser cookie if its server record is already gone.
            if let Some(token) = token {
                let _ = store.end(token);
            }
            Ok((
                common::response(
                    r#"{"ok":true}"#,
                    200,
                    &[("Content-Type", "application/json; charset=utf-8")],
                ),
                Some(clear_session_cookie()),
            ))
        }
        (&Method::GET, "/api/profile-picture") => (|| {
            let user = store.current(token)?;
            let picture = store.profile_picture(user.id)?;
            Ok((
                common::response(
                    picture.content,
                    200,
                    &[
                        ("Content-Type", &picture.mime_type),
                        ("Cache-Control", "no-store"),
                        ("X-Content-Type-Options", "nosniff"),
                    ],
                ),
                None,
            ))
        })(),
        (&Method::PUT, "/api/profile-picture") => (|| {
            let user = store.current(token)?;
            let mut content = Vec::new();
            // Read one extra byte so an oversized upload cannot be written to SQLite.
            body.take(5 * 1024 * 1024 + 1)
                .read_to_end(&mut content)
                .map_err(|_| session::Error::InvalidProfilePicture)?;
            let metadata = store.save_profile_picture(user.id, content)?;
            session_json(metadata).map(|response| (response, None))
        })(),
        _ => Ok((
            common::response(
                r#"{"error":"Not found"}"#,
                404,
                &[("Content-Type", "application/json; charset=utf-8")],
            ),
            None,
        )),
    };
    match result {
        Ok((mut response, cookie)) => {
            if let Some(cookie) = cookie {
                response.headers_mut().insert(
                    axum::http::header::SET_COOKIE,
                    cookie.parse().expect("valid session cookie"),
                );
            }
            response
        }
        Err(error) => error_response(error),
    }
}

fn session_json(value: impl serde::Serialize) -> session::Result<Response> {
    Ok(common::response(
        serde_json::to_string(&value).map_err(|_| session::Error::InvalidDisplayName)?,
        200,
        &[("Content-Type", "application/json; charset=utf-8")],
    ))
}

fn read_session_json<T: for<'de> Deserialize<'de>>(body: &mut impl Read) -> session::Result<T> {
    serde_json::from_reader(body).map_err(|_| session::Error::InvalidDisplayName)
}

pub(crate) fn error_response(error: session::Error) -> Response {
    // These codes are the stable boundary consumed by SessionClient's named error classes.
    let (status, code) = match error {
        session::Error::Missing => (401, "session-missing"),
        session::Error::Expired => (401, "session-expired"),
        session::Error::UserNotFound => (404, "profile-not-found"),
        session::Error::SetupComplete => (409, "setup-complete"),
        session::Error::InvalidDisplayName => (400, "invalid-display-name"),
        session::Error::InvalidProfilePicture => (400, "invalid-profile-picture"),
        session::Error::ProfilePictureTooLarge => (413, "profile-picture-too-large"),
        session::Error::ProfilePictureMissing => (404, "profile-picture-missing"),
        session::Error::Database(_) => (500, "server-error"),
    };
    common::response(
        format!(
            r#"{{"error":{{"code":{},"message":{}}}}}"#,
            serde_json::to_string(code).unwrap(),
            serde_json::to_string(&error.to_string()).unwrap()
        ),
        status,
        &[("Content-Type", "application/json; charset=utf-8")],
    )
}

fn session_cookie(token: &str) -> String {
    // JavaScript cannot read this HttpOnly cookie; the browser attaches it only to same-site calls.
    format!(
        "{}={}; Path=/; Max-Age={}; HttpOnly; SameSite=Strict",
        common::SESSION_COOKIE,
        token,
        30 * 24 * 60 * 60
    )
}
fn clear_session_cookie() -> String {
    format!(
        "{}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict",
        common::SESSION_COOKIE
    )
}

#[derive(Deserialize)]
struct CreateUserInput {
    display_name: String,
}
#[derive(Deserialize)]
struct StartSessionInput {
    user_id: String,
}
