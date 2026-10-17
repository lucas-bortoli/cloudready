//! End-to-end checks for the shared REST and RPC listener.
//!
//! Each test starts an isolated in-memory kernel. No external provider calls are needed:
//! OAuth denial and disconnected generation exercise the complete internal dispatch path.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde_json::{Value, json};
use tokio::{net::TcpStream, task::JoinHandle, time::timeout};
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async,
    tungstenite::{Message, client::IntoClientRequest},
};

use crate::application::Application;

const PROTOCOL: &str = "cloudready-session-rpc.v1";
type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

struct TestKernel {
    origin: String,
    client: Client,
    task: JoinHandle<()>,
}

impl TestKernel {
    async fn start() -> Self {
        let application = Application::start(":memory:".into()).await.unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let rpc = crate::application::rpc::dispatcher(application.clone());
        let router = super::router(application, origin.clone(), rpc);
        let task = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        Self {
            origin,
            client: Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap(),
            task,
        }
    }

    async fn create_session(&self) -> String {
        let response = self
            .client
            .post(format!("{}/api/users", self.origin))
            .json(&json!({"display_name":"Ada"}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let cookie = response.headers()["set-cookie"]
            .to_str()
            .unwrap()
            .to_owned();
        assert!(cookie.contains("HttpOnly"));
        cookie.split(';').next().unwrap().to_owned()
    }

    fn websocket_request(
        &self,
        cookie: Option<&str>,
        protocol: Option<&str>,
    ) -> axum::http::Request<()> {
        let mut request = format!(
            "{}/api/session/rpc",
            self.origin.replace("http://", "ws://")
        )
        .into_client_request()
        .unwrap();
        if let Some(cookie) = cookie {
            request
                .headers_mut()
                .insert("cookie", cookie.parse().unwrap());
        }
        if let Some(protocol) = protocol {
            request
                .headers_mut()
                .insert("sec-websocket-protocol", protocol.parse().unwrap());
        }
        request
    }
}

impl Drop for TestKernel {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn next_json(socket: &mut Socket) -> Value {
    let message = timeout(Duration::from_secs(5), socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    serde_json::from_str(message.to_text().unwrap()).unwrap()
}

#[tokio::test]
async fn rest_files_and_oauth_state_use_the_public_listener() {
    let kernel = TestKernel::start().await;
    let unauthenticated = kernel
        .client
        .get(format!("{}/api/fs/list?path=/", kernel.origin))
        .send()
        .await
        .unwrap();
    assert_eq!(unauthenticated.status(), 401);
    let cookie = kernel.create_session().await;
    let create = kernel
        .client
        .post(format!("{}/api/fs/files", kernel.origin))
        .header("cookie", &cookie)
        .json(&json!({"path":"/hello.txt"}))
        .send()
        .await
        .unwrap();
    assert_eq!(create.status(), 200);
    let write = kernel
        .client
        .put(format!("{}/api/fs/file?path=/hello.txt", kernel.origin))
        .header("cookie", &cookie)
        .body("hello")
        .send()
        .await
        .unwrap();
    assert_eq!(write.status(), 200);
    let read = kernel
        .client
        .get(format!("{}/api/fs/file?path=/hello.txt", kernel.origin))
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(read.status(), 200);
    assert_eq!(read.text().await.unwrap(), "hello");

    let authorization: Value = kernel
        .client
        .post(format!("{}/api/mi/authorization", kernel.origin))
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let url = reqwest::Url::parse(authorization["url"].as_str().unwrap()).unwrap();
    let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    assert_eq!(
        query["redirect_uri"],
        format!("{}/auth/callback", kernel.origin)
    );
    let attempt_id = authorization["attempt_id"].as_str().unwrap();
    let status_url = format!(
        "{}/api/mi/authorization?attempt_id={attempt_id}",
        kernel.origin
    );
    let pending: Value = kernel
        .client
        .get(&status_url)
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(pending["status"], "pending");
    // OAuth callbacks have no CloudReady cookie; the retained attempt state authenticates them.
    let denied = kernel
        .client
        .get(format!("{}/auth/callback", kernel.origin))
        .query(&[
            ("state", query["state"].as_str()),
            ("error", "access_denied"),
        ])
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), 400);
    let failed: Value = kernel
        .client
        .get(status_url)
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(failed["status"], "failed");
    assert_eq!(failed["error"], "mi-authorization-denied");
}

#[tokio::test]
async fn rpc_uses_shared_sessions_and_rechecks_revocation() {
    let kernel = TestKernel::start().await;
    let cookie = kernel.create_session().await;
    let (mut socket, response) =
        connect_async(kernel.websocket_request(Some(&cookie), Some(PROTOCOL)))
            .await
            .unwrap();
    assert_eq!(response.headers()["sec-websocket-protocol"], PROTOCOL);
    assert_eq!(next_json(&mut socket).await["method"], "session.ready");
    let snapshot = next_json(&mut socket).await;
    assert_eq!(snapshot["method"], "fairy.state.snapshot");
    assert_eq!(snapshot["params"]["connected"], false);

    socket
        .send(Message::Text(
            json!({"type":"request","id":1,"method":"fairy.turn.submit","params":{"text":"Hello"}})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    let pending = next_json(&mut socket).await;
    assert_eq!(pending["method"], "fairy.state.delta");
    assert_eq!(pending["params"]["changes"][0]["message"]["text"], "Hello");
    let mut accepted = false;
    let mut failed = false;
    while !accepted || !failed {
        let message = next_json(&mut socket).await;
        if message["type"] == "result" {
            assert_eq!(message["id"], 1);
            accepted = true;
        } else {
            assert_eq!(
                message["params"]["changes"][0]["message"]["status"],
                "failed"
            );
            failed = true;
        }
    }

    let signout = kernel
        .client
        .delete(format!("{}/api/session", kernel.origin))
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(signout.status(), 200);
    socket
        .send(Message::Text(
            json!({"type":"request","id":2,"method":"fairy.turn.submit","params":{"text":"Again"}})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    let revoked = next_json(&mut socket).await;
    assert_eq!(revoked["id"], 2);
    assert_eq!(revoked["error"]["message"], "No active session");
    socket.close(None).await.unwrap();
}

#[tokio::test]
async fn fairy_history_is_shared_across_tabs_and_survives_reconnect() {
    let kernel = TestKernel::start().await;
    let cookie = kernel.create_session().await;
    let (mut first, _) = connect_async(kernel.websocket_request(Some(&cookie), Some(PROTOCOL)))
        .await
        .unwrap();
    let (mut second, _) = connect_async(kernel.websocket_request(Some(&cookie), Some(PROTOCOL)))
        .await
        .unwrap();
    for socket in [&mut first, &mut second] {
        assert_eq!(next_json(socket).await["method"], "session.ready");
        assert_eq!(next_json(socket).await["params"]["messages"], json!([]));
    }
    first.send(Message::Text(json!({
        "type":"request","id":"turn","method":"fairy.turn.submit","params":{"text":"Shared history"}
    }).to_string().into())).await.unwrap();
    let first_pending = next_json(&mut first).await;
    assert_eq!(first_pending, next_json(&mut second).await);
    assert_eq!(
        first_pending["params"]["changes"][0]["message"]["text"],
        "Shared history"
    );
    let mut accepted = false;
    let mut final_event = None;
    while !accepted || final_event.is_none() {
        let message = next_json(&mut first).await;
        if message["type"] == "result" {
            assert_eq!(message["id"], "turn");
            accepted = true;
        } else {
            assert_eq!(message, next_json(&mut second).await);
            assert_eq!(
                message["params"]["changes"][0]["message"]["status"],
                "failed"
            );
            final_event = Some(message);
        }
    }
    let first_final = final_event.unwrap();
    first.close(None).await.unwrap();

    let (mut reconnected, _) =
        connect_async(kernel.websocket_request(Some(&cookie), Some(PROTOCOL)))
            .await
            .unwrap();
    assert_eq!(next_json(&mut reconnected).await["method"], "session.ready");
    let snapshot = next_json(&mut reconnected).await;
    assert_eq!(
        snapshot["params"]["revision"],
        first_final["params"]["revision"]
    );
    assert_eq!(snapshot["params"]["messages"][0]["text"], "Shared history");
    assert_eq!(snapshot["params"]["messages"][0]["status"], "failed");

    // Subscription belongs to Fairy, and now actually supplies the current profile snapshot.
    second
        .send(Message::Text(
            json!({
                "type":"request","id":"subscribe","method":"fairy.subscribe"
            })
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    assert_eq!(next_json(&mut second).await["params"], snapshot["params"]);
    assert_eq!(next_json(&mut second).await["id"], "subscribe");

    // Generic dispatch errors must not generate unrelated Fairy state events.
    second
        .send(Message::Text(
            json!({
                "type":"request","id":"missing","method":"another-feature.missing"
            })
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    assert_eq!(
        next_json(&mut second).await["error"]["code"],
        "session-rpc-method-not-found"
    );
    second
        .send(Message::Text("invalid json".into()))
        .await
        .unwrap();
    assert_eq!(
        next_json(&mut second).await["error"]["code"],
        "session-rpc-invalid-message"
    );
    second.close(None).await.unwrap();
    reconnected.close(None).await.unwrap();
}

#[tokio::test]
async fn rpc_rejects_missing_protocol_and_session() {
    let kernel = TestKernel::start().await;
    for (protocol, expected) in [(None, 426), (Some(PROTOCOL), 401)] {
        let result = connect_async(kernel.websocket_request(None, protocol)).await;
        let Err(tokio_tungstenite::tungstenite::Error::Http(response)) = result else {
            panic!("Expected an HTTP upgrade rejection");
        };
        assert_eq!(response.status(), expected);
    }
}
