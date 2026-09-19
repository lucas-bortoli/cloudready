use std::io::Cursor;
use tiny_http::{Header, Method, Response, StatusCode};

include!(concat!(env!("OUT_DIR"), "/embedded_assets.rs"));

pub fn response(method: &Method, path: &str) -> Option<Response<Cursor<&'static [u8]>>> {
    let path = if path == "/" { "/index.html" } else { path };
    let (_, bytes) = EMBEDDED_ASSETS.iter().find(|(url, _)| *url == path)?;
    if !matches!(method, Method::Get | Method::Head) {
        return Some(
            from_bytes(b"Method not allowed")
                .with_status_code(StatusCode(405))
                .with_header(header("Allow", "GET, HEAD")),
        );
    }

    Some(from_bytes(bytes).with_header(header("Content-Type", content_type(path))))
}

fn from_bytes(bytes: &'static [u8]) -> Response<Cursor<&'static [u8]>> {
    Response::new(
        StatusCode(200),
        vec![],
        Cursor::new(bytes),
        Some(bytes.len()),
        None,
    )
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name, value).expect("valid static header")
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
        let index = response(&Method::Get, "/").unwrap();
        assert_eq!(index.status_code(), StatusCode(200));
        assert!(
            index
                .headers()
                .iter()
                .any(|h| h.value.as_str() == "text/html; charset=utf-8")
        );
        for (path, bytes) in EMBEDDED_ASSETS {
            let asset = response(&Method::Get, path).unwrap();
            assert_eq!(asset.data_length(), Some(bytes.len()));
        }
    }

    #[test]
    fn rejects_unknown_paths_and_writes() {
        assert!(response(&Method::Get, "/missing").is_none());
        assert!(response(&Method::Get, "/../Cargo.toml").is_none());
        assert_eq!(
            response(&Method::Post, "/").unwrap().status_code(),
            StatusCode(405)
        );
        assert_eq!(
            response(&Method::Head, "/").unwrap().status_code(),
            StatusCode(200)
        );
    }
}
