use std::{collections::HashMap, io::Read, path::PathBuf};

use serde::Deserialize;
use tiny_http::{Header, Method, Response, Server, StatusCode};
use uuid::Uuid;

mod chromium;
mod database;
mod filesystem;
mod machine_intelligence;
mod session;

// The build script enables this module only for release builds.
#[cfg(embedded_frontend)]
mod frontend;

fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let chromium = chromium::executable_from_args(std::env::args_os().skip(1))?;
    // Listen locally by default; allow deployments to override the address and port.
    let address = std::env::var("KERNEL_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let server = Server::http(&address)?;
    let database_path = database_path()?;
    let database = database::Database::open(&database_path)?;
    // Keep OAuth attempts alive across requests so the loopback callback can finish them.
    let mut intelligence = machine_intelligence::MachineIntelligence::new(&database);
    println!("Listening on http://{}", server.server_addr());
    // Debug kernels are paired with Vite; release kernels serve the embedded frontend.
    #[cfg(not(embedded_frontend))]
    let chromium_address = "localhost:5173";
    #[cfg(embedded_frontend)]
    let chromium_address = &address;
    let _chromium_profile = chromium
        .as_deref()
        .map(|executable| chromium::launch(executable, chromium_address))
        .transpose()?;

    for mut request in server.incoming_requests() {
        // Route by path so query parameters do not affect endpoint matching.
        let url = request.url().to_owned();
        let path = url.split('?').next().unwrap_or(&url).to_owned();
        if path == "/auth/callback" || path.starts_with("/api/mi/") {
            // OAuth returns without the CloudReady cookie; the callback is checked against
            // its pending state, while provider API calls must resolve the current profile.
            let method = request.method().clone();
            let session_token = cookie(&request, session::COOKIE);
            let response = machine_intelligence_response(
                &mut intelligence,
                &database,
                &method,
                &path,
                &url,
                &mut request.as_reader(),
                session_token.as_deref(),
                &address,
            );
            if let Err(error) = request.respond(response) {
                eprintln!("Failed to send response: {error}");
            }
            continue;
        }
        // Release builds serve embedded assets, reserving /api and /api/* for the API.
        // Debug builds omit this branch entirely. Missing assets fall through to 404.
        #[cfg(embedded_frontend)]
        if path != "/api"
            && !path.starts_with("/api/")
            && let Some(response) = frontend::response(request.method(), &path)
        {
            if let Err(error) = request.respond(response) {
                eprintln!("Failed to send response: {error}");
            }
            continue;
        }
        if path.starts_with("/api/fs/") {
            let method = request.method().clone();
            // Filesystem instances receive the server-authenticated owner ID, never a client ID.
            // This keeps path traversal, revisions, and deleted entries inside one profile namespace.
            let response = match session::SessionStore::new(&database)
                .current(cookie(&request, session::COOKIE).as_deref())
            {
                Ok(user) => filesystem_response(
                    &database,
                    user.id,
                    &method,
                    &path,
                    &url,
                    &mut request.as_reader(),
                ),
                Err(error) => session_error_response(error),
            };
            if let Err(error) = request.respond(response) {
                eprintln!("Failed to send response: {error}");
            }
            continue;
        }
        // Session endpoints establish the cookie required by every filesystem endpoint.
        if path.starts_with("/api/session")
            || path == "/api/users"
            || path == "/api/profile-picture"
        {
            let method = request.method().clone();
            let session_token = cookie(&request, session::COOKIE);
            let response = session_response(
                &database,
                &method,
                &path,
                &mut request.as_reader(),
                session_token.as_deref(),
            );
            if let Err(error) = request.respond(response) {
                eprintln!("Failed to send response: {error}");
            }
            continue;
        }
        let (status, body) = match (request.method(), path.as_str()) {
            (&Method::Get, "/api/health") => (200, r#"{"status":"ok"}"#),
            (&Method::Get, "/api/hello") => (200, r#"{"message":"Hello from Rust!"}"#),
            (_, "/api/health" | "/api/hello") => (405, r#"{"error":"Method not allowed"}"#),
            _ => (404, r#"{"error":"Not found"}"#),
        };

        let mut response = Response::from_string(body)
            .with_status_code(StatusCode(status))
            .with_header(
                Header::from_bytes("Content-Type", "application/json; charset=utf-8")
                    .expect("valid content type header"),
            );

        // A 405 response advertises the methods supported by the endpoint.
        if status == 405 {
            response.add_header(Header::from_bytes("Allow", "GET").expect("valid allow header"));
        }

        // A disconnected client should not stop the server from handling later requests.
        if let Err(error) = request.respond(response) {
            eprintln!("Failed to send response: {error}");
        }
    }

    Ok(())
}

fn machine_intelligence_response(
    intelligence: &mut machine_intelligence::MachineIntelligence<'_>,
    database: &database::Database,
    method: &Method,
    path: &str,
    url: &str,
    body: &mut impl Read,
    token: Option<&str>,
    address: &str,
) -> Response<std::io::Cursor<Vec<u8>>> {
    if path == "/auth/callback" {
        // Do not expose token exchange or validation details on the browser callback page.
        let result = if *method == Method::Get {
            intelligence.callback(&query(url))
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
        return Response::from_string(format!(
            "<!doctype html><title>CloudReady</title><main><h1>CloudReady</h1><p>{message}</p></main>"
        ))
        .with_status_code(StatusCode(status))
        .with_header(header("Content-Type", "text/html; charset=utf-8"))
        .with_header(header("Cache-Control", "no-store"));
    }

    // Never accept a profile ID from the request body for provider operations.
    let user = match session::SessionStore::new(database).current(token) {
        Ok(user) => user,
        Err(error) => return session_error_response(error),
    };
    let query = query(url);
    let result: machine_intelligence::Result<serde_json::Value> = (|| match (method, path) {
        (&Method::Get, "/api/mi/connection") => {
            serde_json::to_value(intelligence.connection(user.id)?)
                .map_err(|_| machine_intelligence::Error::Upstream)
        }
        (&Method::Post, "/api/mi/authorization") => {
            // Sign in with ChatGPT requires a loopback redirect on 127.0.0.1.
            if !address.starts_with("127.0.0.1:") {
                return Err(machine_intelligence::Error::InvalidAuthorization);
            }
            serde_json::to_value(intelligence.start(user.id, &format!("http://{address}"))?)
                .map_err(|_| machine_intelligence::Error::Upstream)
        }
        (&Method::Get, "/api/mi/authorization") => serde_json::to_value(
            intelligence.authorization_status(
                user.id,
                query
                    .get("attempt_id")
                    .ok_or(machine_intelligence::Error::InvalidInput)?,
            )?,
        )
        .map_err(|_| machine_intelligence::Error::Upstream),
        (&Method::Delete, "/api/mi/connection") => {
            Ok(serde_json::json!({"revoked": intelligence.disconnect(user.id)?}))
        }
        (&Method::Get, "/api/mi/models") => serde_json::to_value(intelligence.models(user.id)?)
            .map_err(|_| machine_intelligence::Error::Upstream),
        (&Method::Post, "/api/mi/responses") => {
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
        Ok(value) => Response::from_string(value.to_string())
            .with_header(header("Content-Type", "application/json; charset=utf-8"))
            // Connection and authorization responses should never be cached by a browser.
            .with_header(header("Cache-Control", "no-store")),
        Err(error) => Response::from_string(
            serde_json::json!({"error": {"code": error.code(), "message": error.to_string()}})
                .to_string(),
        )
        .with_status_code(StatusCode(error.status()))
        .with_header(header("Content-Type", "application/json; charset=utf-8"))
        .with_header(header("Cache-Control", "no-store")),
    }
}

fn database_path() -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(path) = std::env::var_os("KERNEL_DATA_DIR") {
        std::fs::create_dir_all(&path)?;
        return Ok(PathBuf::from(path).join("cloudready.sqlite"));
    }
    Ok(std::env::current_exe()?
        .parent()
        .ok_or("executable has no parent directory")?
        .join("cloudready.sqlite"))
}

fn filesystem_response(
    database: &database::Database,
    user_id: Uuid,
    method: &Method,
    path: &str,
    url: &str,
    body: &mut impl Read,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut fs = filesystem::FileSystem::new(database, user_id);
    let query = query(url);
    let result: Result<Response<std::io::Cursor<Vec<u8>>>, filesystem::Error> =
        (|| match (method, path) {
            (&Method::Get, "/api/fs/list") => json(fs.list(required(&query, "path")?)?),
            (&Method::Get, "/api/fs/stat") => json(fs.stat(required(&query, "path")?)?),
            (&Method::Get, "/api/fs/file") => {
                let offset = number(&query, "offset")?.unwrap_or(0);
                let length = number(&query, "length")?;
                let mut bytes = Vec::new();
                fs.read_file(required(&query, "path")?, offset, length, &mut bytes)?;
                Ok(Response::from_data(bytes)
                    .with_header(header("Content-Type", "application/octet-stream")))
            }
            (&Method::Put, "/api/fs/file") => {
                let entry =
                    fs.write_file(required(&query, "path")?, number(&query, "offset")?, body)?;
                json(entry)
            }
            (&Method::Post, "/api/fs/files") => {
                let value: PathInput = read_json(body)?;
                json(fs.create_file(&value.path)?)
            }
            (&Method::Post, "/api/fs/directories") => {
                let value: PathInput = read_json(body)?;
                json(fs.create_directory(&value.path)?)
            }
            (&Method::Post, "/api/fs/move") => {
                let value: TransferInput = read_json(body)?;
                json(fs.move_entry(&value.source, &value.destination)?)
            }
            (&Method::Post, "/api/fs/copy") => {
                let value: TransferInput = read_json(body)?;
                json(fs.copy(&value.source, &value.destination)?)
            }
            (&Method::Post, "/api/fs/truncate") => {
                let value: TruncateInput = read_json(body)?;
                json(fs.truncate(&value.path, value.size)?)
            }
            (&Method::Delete, "/api/fs/entries") => {
                let deletion = fs.remove(
                    required(&query, "path")?,
                    query.get("recursive").is_some_and(|v| v == "true"),
                )?;
                json(serde_json::json!({"deletionId": deletion}))
            }
            (&Method::Get, "/api/fs/versions") => json(fs.versions(required(&query, "path")?)?),
            (&Method::Post, "/api/fs/versions/restore") => {
                let value: RevisionInput = read_json(body)?;
                let revision =
                    Uuid::parse_str(&value.revision_id).map_err(|_| filesystem::Error::Invalid)?;
                json(fs.restore_version(&value.path, revision)?)
            }
            (&Method::Get, "/api/fs/deleted") => json(fs.list_deleted()?),
            (&Method::Post, "/api/fs/deleted/restore") => {
                let value: DeletionInput = read_json(body)?;
                let deletion =
                    Uuid::parse_str(&value.deletion_id).map_err(|_| filesystem::Error::Invalid)?;
                fs.restore(deletion)?;
                json(serde_json::json!({"ok": true}))
            }
            (&Method::Get, "/api/fs/search") => json(fs.search(
                required(&query, "query")?,
                query.get("mime").map(String::as_str),
            )?),
            _ => Ok(Response::from_string(r#"{"error":"Not found"}"#)
                .with_status_code(StatusCode(404))
                .with_header(header("Content-Type", "application/json; charset=utf-8"))),
        })();
    match result {
        Ok(response) => response,
        Err(error) => error_response(error),
    }
}

fn session_response(
    database: &database::Database,
    method: &Method,
    path: &str,
    body: &mut impl Read,
    token: Option<&str>,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let store = session::SessionStore::new(database);

    // Keep session transport in one match so success and error responses share one wire format.
    let result = match (method, path) {
        (&Method::Get, "/api/session") => store
            .current(token)
            .and_then(|user| session_json(user).map(|response| (response, None))),
        (&Method::Get, "/api/users") => store
            .users()
            .and_then(|users| session_json(users).map(|response| (response, None))),
        (&Method::Post, "/api/users") => (|| {
            // The store enforces that this can succeed only during first-run setup.
            let input: CreateUserInput = read_session_json(body)?;
            let user = store.create_first_user(&input.display_name)?;
            let (user, token) = store.start(user.id)?;
            Ok((session_json(user)?, Some(session_cookie(&token))))
        })(),
        (&Method::Post, "/api/session") => (|| {
            let input: StartSessionInput = read_session_json(body)?;
            let user_id =
                Uuid::parse_str(&input.user_id).map_err(|_| session::Error::UserNotFound)?;
            let (user, token) = store.start(user_id)?;
            Ok((session_json(user)?, Some(session_cookie(&token))))
        })(),
        (&Method::Delete, "/api/session") => {
            // Sign-out should still clear the browser cookie if its server record is already gone.
            if let Some(token) = token {
                let _ = store.end(token);
            }
            Ok((
                Response::from_string(r#"{"ok":true}"#)
                    .with_header(header("Content-Type", "application/json; charset=utf-8")),
                Some(clear_session_cookie()),
            ))
        }
        (&Method::Get, "/api/profile-picture") => (|| {
            let user = store.current(token)?;
            let picture = store.profile_picture(user.id)?;
            Ok((
                Response::from_data(picture.content)
                    .with_header(header("Content-Type", &picture.mime_type))
                    // A browser can change profiles without changing this endpoint URL.
                    .with_header(header("Cache-Control", "no-store"))
                    .with_header(header("X-Content-Type-Options", "nosniff")),
                None,
            ))
        })(),
        (&Method::Put, "/api/profile-picture") => (|| {
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
            Response::from_string(r#"{"error":"Not found"}"#)
                .with_status_code(StatusCode(404))
                .with_header(header("Content-Type", "application/json; charset=utf-8")),
            None,
        )),
    };
    match result {
        Ok((mut response, cookie)) => {
            if let Some(cookie) = cookie {
                response.add_header(header("Set-Cookie", &cookie));
            }
            response
        }
        Err(error) => session_error_response(error),
    }
}

fn session_json(
    value: impl serde::Serialize,
) -> session::Result<Response<std::io::Cursor<Vec<u8>>>> {
    Ok(Response::from_string(
        serde_json::to_string(&value).map_err(|_| session::Error::InvalidDisplayName)?,
    )
    .with_header(header("Content-Type", "application/json; charset=utf-8")))
}

fn read_session_json<T: for<'de> Deserialize<'de>>(body: &mut impl Read) -> session::Result<T> {
    serde_json::from_reader(body).map_err(|_| session::Error::InvalidDisplayName)
}

fn session_error_response(error: session::Error) -> Response<std::io::Cursor<Vec<u8>>> {
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
    Response::from_string(format!(
        r#"{{"error":{{"code":{},"message":{}}}}}"#,
        serde_json::to_string(code).unwrap(),
        serde_json::to_string(&error.to_string()).unwrap()
    ))
    .with_status_code(StatusCode(status))
    .with_header(header("Content-Type", "application/json; charset=utf-8"))
}

fn session_cookie(token: &str) -> String {
    // JavaScript cannot read this HttpOnly cookie; the browser attaches it only to same-site calls.
    format!(
        "{}={}; Path=/; Max-Age={}; HttpOnly; SameSite=Strict",
        session::COOKIE,
        token,
        30 * 24 * 60 * 60
    )
}
fn clear_session_cookie() -> String {
    format!(
        "{}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict",
        session::COOKIE
    )
}
fn cookie(request: &tiny_http::Request, name: &str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Cookie"))
        .and_then(|header| {
            header.value.as_str().split(';').find_map(|part| {
                part.trim()
                    .split_once('=')
                    .filter(|(key, _)| *key == name)
                    .map(|(_, value)| value.to_owned())
            })
        })
}

fn json(value: impl serde::Serialize) -> filesystem::Result<Response<std::io::Cursor<Vec<u8>>>> {
    Ok(Response::from_string(
        serde_json::to_string(&value).map_err(|_| filesystem::Error::Invalid)?,
    )
    .with_header(header("Content-Type", "application/json; charset=utf-8")))
}
fn error_response(error: filesystem::Error) -> Response<std::io::Cursor<Vec<u8>>> {
    let status = match error {
        filesystem::Error::Invalid => 400,
        filesystem::Error::InvalidRange => 400,
        filesystem::Error::NotFound => 404,
        filesystem::Error::Conflict => 409,
        filesystem::Error::InvalidOperation => 422,
        _ => 500,
    };
    Response::from_string(format!(
        r#"{{"error":{{"code":{},"message":{}}}}}"#,
        serde_json::to_string(error_code(&error)).unwrap(),
        serde_json::to_string(&error.to_string()).unwrap(),
    ))
    .with_status_code(StatusCode(status))
    .with_header(header("Content-Type", "application/json; charset=utf-8"))
}
fn error_code(error: &filesystem::Error) -> &'static str {
    match error {
        filesystem::Error::Invalid => "invalid-path",
        filesystem::Error::InvalidRange => "invalid-range",
        filesystem::Error::NotFound => "entry-not-found",
        filesystem::Error::Conflict => "entry-conflict",
        filesystem::Error::InvalidOperation => "invalid-operation",
        filesystem::Error::Database(_) | filesystem::Error::Io(_) => "server-error",
    }
}
fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name, value).expect("valid HTTP header")
}
fn query(url: &str) -> HashMap<String, String> {
    url.split_once('?')
        .map(|(_, value)| {
            value
                .split('&')
                .filter_map(|part| {
                    part.split_once('=')
                        .map(|(key, value)| (percent_decode(key), percent_decode(value)))
                })
                .collect()
        })
        .unwrap_or_default()
}
fn percent_decode(value: &str) -> String {
    let mut decoded = Vec::with_capacity(value.len());
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2])) {
                decoded.push(high << 4 | low);
                index += 3;
                continue;
            }
        }
        decoded.push(if bytes[index] == b'+' {
            b' '
        } else {
            bytes[index]
        });
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}
fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}
fn required<'a>(query: &'a HashMap<String, String>, key: &str) -> filesystem::Result<&'a str> {
    query
        .get(key)
        .map(String::as_str)
        .ok_or(filesystem::Error::Invalid)
}
fn number(query: &HashMap<String, String>, key: &str) -> filesystem::Result<Option<u64>> {
    query
        .get(key)
        .map(|value| value.parse().map_err(|_| filesystem::Error::InvalidRange))
        .transpose()
}
fn read_json<T: for<'de> Deserialize<'de>>(body: &mut impl Read) -> filesystem::Result<T> {
    serde_json::from_reader(body).map_err(|_| filesystem::Error::Invalid)
}

#[derive(Deserialize)]
struct PathInput {
    path: String,
}
#[derive(Deserialize)]
struct TransferInput {
    source: String,
    destination: String,
}
#[derive(Deserialize)]
struct TruncateInput {
    path: String,
    size: u64,
}
#[derive(Deserialize)]
struct RevisionInput {
    path: String,
    revision_id: String,
}
#[derive(Deserialize)]
struct DeletionInput {
    deletion_id: String,
}
#[derive(Deserialize)]
struct CreateUserInput {
    display_name: String,
}
#[derive(Deserialize)]
struct StartSessionInput {
    user_id: String,
}
