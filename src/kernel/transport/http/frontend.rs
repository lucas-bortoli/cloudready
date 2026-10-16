//! Embedded frontend assets served by the public Axum listener in release builds.

use axum::{http::Method, response::Response};

use super::common::response as asset_response;

include!(concat!(env!("OUT_DIR"), "/embedded_assets.rs"));

pub(super) fn response(method: &Method, path: &str) -> Option<Response> {
    let path = if path == "/" { "/index.html" } else { path };
    let (_, bytes) = EMBEDDED_ASSETS.iter().find(|(url, _)| *url == path)?;
    if !matches!(method, &Method::GET | &Method::HEAD) {
        return Some(asset_response(
            "Method not allowed",
            405,
            &[("Allow", "GET, HEAD")],
        ));
    }

    // HEAD advertises the asset length without copying or sending its body.
    let length = bytes.len().to_string();
    Some(asset_response(
        if method == Method::HEAD {
            &[][..]
        } else {
            *bytes
        },
        200,
        &[
            ("Content-Type", content_type(path)),
            ("Content-Length", &length),
        ],
    ))
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_index_and_every_embedded_asset() {
        let index = response(&Method::GET, "/").unwrap();
        assert_eq!(index.status(), 200);
        assert_eq!(index.headers()["content-type"], "text/html; charset=utf-8");
        for (path, bytes) in EMBEDDED_ASSETS {
            let asset = response(&Method::GET, path).unwrap();
            assert_eq!(asset.headers()["content-length"], bytes.len().to_string());
        }
    }

    #[test]
    fn rejects_unknown_paths_and_writes() {
        assert!(response(&Method::GET, "/missing").is_none());
        assert!(response(&Method::GET, "/../Cargo.toml").is_none());
        assert_eq!(response(&Method::POST, "/").unwrap().status(), 405);
        assert_eq!(response(&Method::HEAD, "/").unwrap().status(), 200);
    }
}
