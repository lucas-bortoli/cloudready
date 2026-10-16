//! Filesystem REST routes.

use std::io::Read;

use axum::{http::Method, response::Response};
use serde::Deserialize;
use uuid::Uuid;

use crate::{database, filesystem};

use super::common;

pub(crate) fn response(
    database: &database::Database,
    user_id: Uuid,
    method: &Method,
    path: &str,
    url: &str,
    body: &mut impl Read,
) -> Response {
    let mut fs = filesystem::FileSystem::new(database, user_id);
    let query = common::query(url);
    let result: Result<Response, filesystem::Error> = (|| match (method, path) {
        (&Method::GET, "/api/fs/list") => json(fs.list(required(&query, "path")?)?),
        (&Method::GET, "/api/fs/stat") => json(fs.stat(required(&query, "path")?)?),
        (&Method::GET, "/api/fs/file") => {
            let offset = number(&query, "offset")?.unwrap_or(0);
            let length = number(&query, "length")?;
            let mut bytes = Vec::new();
            fs.read_file(required(&query, "path")?, offset, length, &mut bytes)?;
            Ok(common::response(
                bytes,
                200,
                &[("Content-Type", "application/octet-stream")],
            ))
        }
        (&Method::PUT, "/api/fs/file") => {
            let entry =
                fs.write_file(required(&query, "path")?, number(&query, "offset")?, body)?;
            json(entry)
        }
        (&Method::POST, "/api/fs/files") => {
            let value: PathInput = read_json(body)?;
            json(fs.create_file(&value.path)?)
        }
        (&Method::POST, "/api/fs/directories") => {
            let value: PathInput = read_json(body)?;
            json(fs.create_directory(&value.path)?)
        }
        (&Method::POST, "/api/fs/move") => {
            let value: TransferInput = read_json(body)?;
            json(fs.move_entry(&value.source, &value.destination)?)
        }
        (&Method::POST, "/api/fs/copy") => {
            let value: TransferInput = read_json(body)?;
            json(fs.copy(&value.source, &value.destination)?)
        }
        (&Method::POST, "/api/fs/truncate") => {
            let value: TruncateInput = read_json(body)?;
            json(fs.truncate(&value.path, value.size)?)
        }
        (&Method::DELETE, "/api/fs/entries") => {
            let deletion = fs.remove(
                required(&query, "path")?,
                query.get("recursive").is_some_and(|v| v == "true"),
            )?;
            json(serde_json::json!({"deletionId": deletion}))
        }
        (&Method::GET, "/api/fs/versions") => json(fs.versions(required(&query, "path")?)?),
        (&Method::POST, "/api/fs/versions/restore") => {
            let value: RevisionInput = read_json(body)?;
            let revision =
                Uuid::parse_str(&value.revision_id).map_err(|_| filesystem::Error::Invalid)?;
            json(fs.restore_version(&value.path, revision)?)
        }
        (&Method::GET, "/api/fs/deleted") => json(fs.list_deleted()?),
        (&Method::POST, "/api/fs/deleted/restore") => {
            let value: DeletionInput = read_json(body)?;
            let deletion =
                Uuid::parse_str(&value.deletion_id).map_err(|_| filesystem::Error::Invalid)?;
            fs.restore(deletion)?;
            json(serde_json::json!({"ok": true}))
        }
        (&Method::GET, "/api/fs/search") => json(fs.search(
            required(&query, "query")?,
            query.get("mime").map(String::as_str),
        )?),
        _ => Ok(common::response(
            r#"{"error":"Not found"}"#,
            404,
            &[("Content-Type", "application/json; charset=utf-8")],
        )),
    })();
    match result {
        Ok(response) => response,
        Err(error) => error_response(error),
    }
}

fn json(value: impl serde::Serialize) -> filesystem::Result<Response> {
    Ok(common::response(
        serde_json::to_string(&value).map_err(|_| filesystem::Error::Invalid)?,
        200,
        &[("Content-Type", "application/json; charset=utf-8")],
    ))
}
fn error_response(error: filesystem::Error) -> Response {
    let status = match error {
        filesystem::Error::Invalid => 400,
        filesystem::Error::InvalidRange => 400,
        filesystem::Error::NotFound => 404,
        filesystem::Error::Conflict => 409,
        filesystem::Error::InvalidOperation => 422,
        _ => 500,
    };
    common::response(
        format!(
            r#"{{"error":{{"code":{},"message":{}}}}}"#,
            serde_json::to_string(error_code(&error)).unwrap(),
            serde_json::to_string(&error.to_string()).unwrap(),
        ),
        status,
        &[("Content-Type", "application/json; charset=utf-8")],
    )
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

fn required<'a>(
    query: &'a std::collections::HashMap<String, String>,
    key: &str,
) -> filesystem::Result<&'a str> {
    query
        .get(key)
        .map(String::as_str)
        .ok_or(filesystem::Error::Invalid)
}

fn number(
    query: &std::collections::HashMap<String, String>,
    key: &str,
) -> filesystem::Result<Option<u64>> {
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
