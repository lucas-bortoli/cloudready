use std::{collections::HashMap, io::Read, path::PathBuf};

use serde::Deserialize;
use tiny_http::{Header, Method, Response, Server, StatusCode};
use uuid::Uuid;

mod filesystem;

// The build script enables this module only for release builds.
#[cfg(embedded_frontend)]
mod frontend;

fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Listen locally by default; allow deployments to override the address and port.
    let address = std::env::var("KERNEL_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let server = Server::http(&address)?;
    let database_path = database_path()?;
    let mut filesystem = filesystem::FileSystem::open(&database_path)?;
    println!("Listening on http://{}", server.server_addr());

    for mut request in server.incoming_requests() {
        // Route by path so query parameters do not affect endpoint matching.
        let url = request.url().to_owned();
        let path = url.split('?').next().unwrap_or(&url).to_owned();
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
            let response = filesystem_response(
                &mut filesystem,
                &method,
                &path,
                &url,
                &mut request.as_reader(),
            );
            if let Err(error) = request.respond(response) {
                eprintln!("Failed to send response: {error}");
            }
            continue;
        }
        // Distinguish unsupported methods on known endpoints from unknown routes.
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
    fs: &mut filesystem::FileSystem,
    method: &Method,
    path: &str,
    url: &str,
    body: &mut impl Read,
) -> Response<std::io::Cursor<Vec<u8>>> {
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
        filesystem::Error::Invalid => "invalid_path",
        filesystem::Error::InvalidRange => "invalid_range",
        filesystem::Error::NotFound => "entry_not_found",
        filesystem::Error::Conflict => "entry_conflict",
        filesystem::Error::InvalidOperation => "invalid_operation",
        filesystem::Error::Database(_) | filesystem::Error::Io(_) => "server_error",
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
