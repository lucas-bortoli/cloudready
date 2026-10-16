//! HTTP boundary helpers shared by the REST and WebSocket adapters.

use std::collections::HashMap;

/// Browser transport name for the opaque kernel session token.
pub(crate) const SESSION_COOKIE: &str = "cloudready_session";

use axum::{
    body::Body,
    http::{HeaderMap, StatusCode},
    response::Response,
};

/// Reads an opaque session token from the browser's cookie header.
pub(crate) fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all("cookie")
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|part| part.trim().split_once('='))
        .find(|(key, _)| *key == name)
        .map(|(_, value)| value.to_owned())
}

/// Builds a native Axum response. Invalid status or header values indicate a kernel bug.
pub(crate) fn response(body: impl Into<Body>, status: u16, headers: &[(&str, &str)]) -> Response {
    let mut builder =
        Response::builder().status(StatusCode::from_u16(status).expect("valid HTTP status"));
    for (name, value) in headers {
        builder = builder.header(*name, *value);
    }
    builder
        .body(body.into())
        .expect("valid HTTP response headers")
}

pub(crate) fn query(url: &str) -> HashMap<String, String> {
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
