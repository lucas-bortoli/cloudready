use tiny_http::{Header, Method, Response, Server, StatusCode};

// The build script enables this module only for release builds.
#[cfg(embedded_frontend)]
mod frontend;

fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Listen locally by default; allow deployments to override the address and port.
    let address = std::env::var("KERNEL_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let server = Server::http(&address)?;
    println!("Listening on http://{}", server.server_addr());

    for request in server.incoming_requests() {
        // Route by path so query parameters do not affect endpoint matching.
        let path = request.url().split('?').next().unwrap_or(request.url());
        // Release builds serve embedded assets, reserving /api and /api/* for the API.
        // Debug builds omit this branch entirely. Missing assets fall through to 404.
        #[cfg(embedded_frontend)]
        if path != "/api"
            && !path.starts_with("/api/")
            && let Some(response) = frontend::response(request.method(), path)
        {
            if let Err(error) = request.respond(response) {
                eprintln!("Failed to send response: {error}");
            }
            continue;
        }
        // Distinguish unsupported methods on known endpoints from unknown routes.
        let (status, body) = match (request.method(), path) {
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
