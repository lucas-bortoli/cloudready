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
    assert_eq!(
        intelligence
            .generate_text(user, "test-model", "Hi")
            .unwrap()
            .text,
        "Hello"
    );
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
