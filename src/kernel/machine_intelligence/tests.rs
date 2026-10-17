//! Provider contract tests using a local mock upstream.
use super::{credentials::Connection, oauth::SCOPES, service::now};
use crate::database::Database;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use jsonwebtoken::Algorithm;
use serde_json::json;
use std::collections::HashMap;
use uuid::Uuid;

use super::*;
use jsonwebtoken::{EncodingKey, Header as JwtHeader, encode};
use rsa::{RsaPrivateKey, pkcs1::EncodeRsaPrivateKey, traits::PublicKeyParts};
use std::thread;
use tiny_http::{Header, Response, Server, StatusCode};

fn fixture() -> (Database, Uuid) {
    let path = std::env::temp_dir().join(format!("cloudready-mi-{}.sqlite", Uuid::new_v4()));
    let database = Database::open(&path).unwrap();
    let user = crate::session::SessionStore::new(&database)
        .create_first_user("Ada")
        .unwrap();
    (database, user.id)
}

fn connection(expires_at: i64) -> Connection {
    Connection {
        issuer: "https://auth.openai.com".into(),
        subject: "subject".into(),
        email: Some("ada@example.com".into()),
        client_id: "oaiapp_test".into(),
        id_token: "id".into(),
        access_token: "access".into(),
        refresh_token: "refresh".into(),
        scopes: SCOPES.into(),
        expires_at,
    }
}

fn server(
    responses: Vec<(&'static str, String)>,
) -> (String, thread::JoinHandle<Vec<(String, String)>>) {
    let server = Server::http("127.0.0.1:0").unwrap();
    let base = format!("http://{}", server.server_addr());
    let handle = thread::spawn(move || {
        let mut requests = Vec::new();
        for (expected_path, response) in responses {
            let mut request = server.recv().unwrap();
            assert_eq!(request.url(), expected_path);
            let mut body = String::new();
            request.as_reader().read_to_string(&mut body).unwrap();
            requests.push((request.url().into(), body));
            request
                .respond(
                    Response::from_string(
                        response.replace("{base}", &format!("http://{}", server.server_addr())),
                    )
                    .with_status_code(StatusCode(200))
                    .with_header(Header::from_bytes("Content-Type", "application/json").unwrap()),
                )
                .unwrap();
        }
        requests
    });
    (base, handle)
}

#[test]
fn credentials_are_scoped_to_a_profile() {
    let (database, first) = fixture();
    let second = Uuid::new_v4();
    database
        .connection()
        .execute(
            "INSERT INTO users(id,display_name,created_at) VALUES(?1,'Grace',0)",
            [second.as_bytes()],
        )
        .unwrap();
    let intelligence = MachineIntelligence::new(&database);
    intelligence
        .credentials
        .save(first, &connection(now() + 300_000))
        .unwrap();
    assert!(intelligence.connection(first).unwrap().connected);
    assert!(!intelligence.connection(second).unwrap().connected);
    assert!(matches!(
        intelligence.models(second),
        Err(Error::NotConnected)
    ));
}

#[test]
fn callback_checks_state_and_cannot_be_replayed() {
    let (database, user) = fixture();
    let mut intelligence = MachineIntelligence::new(&database);
    let started = intelligence.start(user, "http://127.0.0.1:3000").unwrap();
    let state = reqwest::Url::parse(&started.url)
        .unwrap()
        .query_pairs()
        .find(|(key, _)| key == "state")
        .unwrap()
        .1
        .into_owned();
    assert!(matches!(
        intelligence.callback(&HashMap::from([("state".into(), "wrong".into())])),
        Err(Error::AttemptMissing)
    ));
    assert_eq!(
        intelligence
            .authorization_status(user, &started.attempt_id)
            .unwrap()
            .status,
        "pending"
    );
    assert!(matches!(
        intelligence.callback(&HashMap::from([
            ("state".into(), state.clone()),
            ("error".into(), "access_denied".into())
        ])),
        Err(Error::AuthorizationDenied)
    ));
    assert_eq!(
        intelligence
            .authorization_status(user, &started.attempt_id)
            .unwrap()
            .status,
        "failed"
    );
    assert!(matches!(
        intelligence.callback(&HashMap::from([("state".into(), state)])),
        Err(Error::AttemptMissing)
    ));
}

#[test]
fn callback_validates_signed_identity_and_saves_connection() {
    let (database, user) = fixture();
    let mut intelligence = MachineIntelligence::new(&database);
    let started = intelligence.start(user, "http://127.0.0.1:3000").unwrap();
    let authorization = reqwest::Url::parse(&started.url).unwrap();
    let parameters: HashMap<String, String> = authorization
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    let state = parameters.get("state").unwrap().clone();
    let nonce = parameters.get("nonce").unwrap().clone();
    let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
    let public = private.to_public_key();
    let mut header = JwtHeader::new(Algorithm::RS256);
    header.kid = Some("test-key".into());
    let id_token = encode(
        &header,
        &json!({
            "iss":"https://auth.openai.com", "aud":"oaiapp_test", "sub":"verified-subject",
            "nonce":nonce, "email":"ada@example.com", "exp":now() / 1000 + 3600
        }),
        &EncodingKey::from_rsa_der(private.to_pkcs1_der().unwrap().as_bytes()),
    )
    .unwrap();
    let jwks = json!({"keys":[{
        "kty":"RSA", "kid":"test-key", "alg":"RS256", "use":"sig",
        "n":URL_SAFE_NO_PAD.encode(public.n().to_bytes_be()),
        "e":URL_SAFE_NO_PAD.encode(public.e().to_bytes_be())
    }]})
    .to_string();
    let (base, handle) = server(vec![
            ("/token", json!({"access_token":"access","refresh_token":"refresh","id_token":id_token,"expires_in":3600,"scope":SCOPES}).to_string()),
            ("/discovery", json!({"issuer":"https://auth.openai.com","jwks_uri":"{base}/jwks"}).to_string()),
            ("/jwks", jwks),
        ]);
    intelligence.token_url = format!("{base}/token");
    intelligence.discovery_url = format!("{base}/discovery");
    intelligence.trusted_auth_origin = base;
    intelligence
        .callback(&HashMap::from([
            ("state".into(), state),
            ("code".into(), "auth-code".into()),
            ("client_id".into(), "oaiapp_test".into()),
        ]))
        .unwrap();
    assert_eq!(
        intelligence
            .authorization_status(user, &started.attempt_id)
            .unwrap()
            .status,
        "succeeded"
    );
    assert_eq!(
        intelligence
            .credentials
            .load(user)
            .unwrap()
            .unwrap()
            .subject,
        "verified-subject"
    );
    assert_eq!(handle.join().unwrap().len(), 3);
}

#[test]
fn refresh_replaces_rotating_token_before_model_request() {
    let (database, user) = fixture();
    let (base, handle) = server(vec![
            ("/token", json!({"access_token":"new-access","refresh_token":"new-refresh","expires_in":3600,"scope":SCOPES}).to_string()),
            ("/models", json!({"models":[{"slug":"test-model","display_name":"Test model","visibility":"list"}]}).to_string()),
        ]);
    let mut intelligence = MachineIntelligence::new(&database);
    intelligence.token_url = format!("{base}/token");
    intelligence.api_base = base;
    intelligence
        .credentials
        .save(user, &connection(now() - 1))
        .unwrap();
    assert_eq!(intelligence.models(user).unwrap()[0].slug, "test-model");
    assert_eq!(
        intelligence
            .credentials
            .load(user)
            .unwrap()
            .unwrap()
            .refresh_token,
        "new-refresh"
    );
    let requests = handle.join().unwrap();
    assert!(requests[0].1.contains("refresh_token=refresh"));
    assert!(!requests[0].1.contains("scope="));
}

#[test]
fn disconnect_revokes_and_clears_credentials() {
    let (database, user) = fixture();
    let (base, handle) = server(vec![
            ("/discovery", json!({"issuer":"https://auth.openai.com","jwks_uri":"https://auth.openai.com/jwks","revocation_endpoint":"{base}/revoke"}).to_string()),
            ("/revoke", String::new()),
        ]);
    let mut intelligence = MachineIntelligence::new(&database);
    intelligence.discovery_url = format!("{base}/discovery");
    intelligence.trusted_auth_origin = base;
    intelligence
        .credentials
        .save(user, &connection(now() + 300_000))
        .unwrap();
    assert!(intelligence.disconnect(user).unwrap());
    assert!(!intelligence.connection(user).unwrap().connected);
    let requests = handle.join().unwrap();
    assert!(requests[1].1.contains("refresh_token"));
}

#[test]
fn response_stream_requires_completed_event() {
    let (database, user) = fixture();
    let model_json =
        json!({"models":[{"slug":"test-model","display_name":"Test model","visibility":"list"}]})
            .to_string();
    let (base, handle) = server(vec![
            ("/models", model_json.clone()),
            ("/responses", "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}\n\ndata: {\"type\":\"response.completed\"}\n\n".into()),
            ("/models", model_json.clone()),
            ("/responses", "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n".into()),
            ("/models", model_json),
            ("/responses", "data: {\"type\":\"response.failed\",\"response\":{\"error\":{\"code\":\"subscription_sharing_usage_limit_exceeded\"}}}\n\n".into()),
        ]);
    let mut intelligence = MachineIntelligence::new(&database);
    intelligence.api_base = base;
    intelligence
        .credentials
        .save(user, &connection(now() + 300_000))
        .unwrap();
    let mut chunks = Vec::new();
    assert_eq!(
        intelligence
            .generation_client(user)
            .unwrap()
            .generate_text("test-model", "Hi", |chunk| chunks.push(chunk))
            .unwrap()
            .text,
        "Hello"
    );
    assert_eq!(chunks, vec!["Hello"]);
    assert!(matches!(
        intelligence.generate_text(user, "test-model", "Hi"),
        Err(Error::IncompleteResponse)
    ));
    assert!(matches!(
        intelligence.generate_text(user, "test-model", "Hi"),
        Err(Error::UsageLimit)
    ));
    handle.join().unwrap();
}

#[tokio::test]
async fn fairy_streams_before_completion_and_keeps_worker_and_reconnecting_sessions_available() {
    use crate::{
        application::Application, fairy::service::Service, rpc::hub::RpcHub, session::SessionStore,
    };
    use std::io::{BufRead, BufReader, Read, Write};
    use std::sync::Arc;
    use tokio::sync::Mutex;

    fn request(socket: &mut std::net::TcpStream) {
        let mut reader = BufReader::new(socket);
        let mut length = 0;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            if line == "\r\n" {
                break;
            }
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse().unwrap();
            }
        }
        reader.read_exact(&mut vec![0; length]).unwrap();
    }
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (release, wait) = std::sync::mpsc::channel();
    let server = thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        request(&mut socket);
        let models = json!({"models":[{"slug":crate::fairy::MODEL,"display_name":"Test","visibility":"list"}]}).to_string();
        write!(
            socket,
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            models.len(),
            models
        )
        .unwrap();
        drop(socket);
        let (mut socket, _) = listener.accept().unwrap();
        request(&mut socket);
        let first = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}\n\n";
        let last = "data: {\"type\":\"response.output_text.delta\",\"delta\":\" again\"}\n\ndata: {\"type\":\"response.completed\"}\n\n";
        write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", first.len() + last.len(), first).unwrap();
        socket.flush().unwrap();
        if wait
            .recv_timeout(std::time::Duration::from_secs(10))
            .is_ok()
        {
            socket.write_all(last.as_bytes()).unwrap();
        }
    });
    let application = Application::start(":memory:".into()).await.unwrap();
    let (id, token) = application
        .call(move |database, intelligence| {
            let store = SessionStore::new(database);
            let user = store.create_first_user("Ada").unwrap();
            let (_, token) = store.start(user.id).unwrap();
            intelligence.api_base = base;
            intelligence
                .credentials
                .save(user.id, &connection(now() + 300_000))
                .unwrap();
            (user.id, token)
        })
        .await
        .unwrap();
    let hub = Arc::new(Mutex::new(RpcHub::new()));
    let events = hub.clone();
    let service = Service::new(
        application.clone(),
        Arc::new(move |id, value| {
            let events = events.clone();
            Box::pin(async move {
                events.lock().await.broadcast(id, value);
            })
        }),
    );
    let (first_id, mut first) = hub.lock().await.connect(id);
    service.submit(id, Some(token.clone()), "Hi").await.unwrap();
    let created = first.recv().await.unwrap();
    assert_eq!(created["revision"], 1);
    let delta = tokio::time::timeout(std::time::Duration::from_secs(3), first.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(delta["changes"][0]["text"], "Hello");
    // The provider is paused. A database operation and a joining session still work.
    let (second_id, mut second) = hub.lock().await.connect(id);
    let snapshots = hub.clone();
    tokio::time::timeout(
        std::time::Duration::from_secs(3),
        service.snapshot(id, Some(token), move |value| async move {
            snapshots.lock().await.send(second_id, value);
        }),
    )
    .await
    .unwrap()
    .unwrap();
    let snapshot = second.recv().await.unwrap();
    assert_eq!(snapshot["revision"], delta["revision"]);
    assert_eq!(snapshot["messages"][1]["text"], "Hello");
    hub.lock().await.disconnect(first_id);
    release.send(()).unwrap();
    let remaining = second.recv().await.unwrap();
    assert_eq!(remaining["changes"][0]["text"], " again");
    let finished = second.recv().await.unwrap();
    assert_eq!(finished["changes"][0]["message"]["status"], "complete");
    let saved = application
        .call(move |database, _| {
            database.connection().query_row(
                "SELECT state FROM fairy_states WHERE user_id=?1",
                [id.as_bytes()],
                |row| row.get::<_, String>(0),
            )
        })
        .await
        .unwrap()
        .unwrap();
    let saved: serde_json::Value = serde_json::from_str(&saved).unwrap();
    assert_eq!(saved["machine"]["messages"][1]["text"], "Hello again");
    server.join().unwrap();
}

#[tokio::test]
async fn fairy_connection_changes_reach_all_sessions_without_resubscribing() {
    use crate::{
        application::Application, fairy::service::Service, rpc::hub::RpcHub, session::SessionStore,
    };
    use std::sync::Arc;
    use tokio::sync::Mutex;
    let application = Application::start(":memory:".into()).await.unwrap();
    let (id, token) = application
        .call(|database, _| {
            let store = SessionStore::new(database);
            let user = store.create_first_user("Ada").unwrap();
            let (_, token) = store.start(user.id).unwrap();
            (user.id, token)
        })
        .await
        .unwrap();
    let hub = Arc::new(Mutex::new(RpcHub::new()));
    let events = hub.clone();
    let service = Service::new(
        application.clone(),
        Arc::new(move |id, value| {
            let events = events.clone();
            Box::pin(async move {
                events.lock().await.broadcast(id, value);
            })
        }),
    );
    let (_, mut first) = hub.lock().await.connect(id);
    let (_, mut second) = hub.lock().await.connect(id);
    service
        .snapshot(id, Some(token.clone()), |snapshot| async move {
            assert_eq!(snapshot["connected"], false);
        })
        .await
        .unwrap();
    application
        .call(move |_, intelligence| {
            intelligence
                .credentials
                .save(id, &connection(now() + 300_000))
        })
        .await
        .unwrap()
        .unwrap();
    let connected = tokio::time::timeout(std::time::Duration::from_secs(3), first.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        connected["changes"][0],
        json!({"kind":"connection-changed", "connected":true})
    );
    assert_eq!(second.recv().await.unwrap(), connected);
    service
        .snapshot(id, Some(token), |snapshot| async move {
            assert_eq!(snapshot["connected"], true);
        })
        .await
        .unwrap();
    application
        .call(move |_, intelligence| intelligence.credentials.delete(id))
        .await
        .unwrap()
        .unwrap();
    let disconnected = tokio::time::timeout(std::time::Duration::from_secs(3), first.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        disconnected["changes"][0],
        json!({"kind":"connection-changed", "connected":false})
    );
    assert_eq!(second.recv().await.unwrap(), disconnected);
}
