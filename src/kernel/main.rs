use tiny_http::{Header, Method, Response, Server, StatusCode};

fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let server = Server::http("127.0.0.1:3000")?;
    println!("API listening on http://127.0.0.1:3000");

    for request in server.incoming_requests() {
        let path = request.url().split('?').next().unwrap_or(request.url());
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

        if status == 405 {
            response.add_header(Header::from_bytes("Allow", "GET").expect("valid allow header"));
        }

        if let Err(error) = request.respond(response) {
            eprintln!("Failed to send response: {error}");
        }
    }

    Ok(())
}
