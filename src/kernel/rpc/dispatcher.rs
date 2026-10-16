//! Feature-neutral RPC dispatch and connection lifecycle.

use std::{collections::HashMap, sync::Arc};

use futures_util::future::BoxFuture;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::{Mutex, mpsc};
use uuid::Uuid;

use super::hub::RpcHub;

/// Identity fixed by the authenticated WebSocket handshake.
#[derive(Clone)]
pub(crate) struct Context {
    pub(crate) connection_id: Uuid,
    pub(crate) profile_id: Uuid,
    pub(crate) token: Option<String>,
}

/// A feature failure that can cross the RPC boundary without losing its stable code.
#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub(crate) struct Error {
    pub(crate) code: &'static str,
    pub(crate) message: String,
}

impl Error {
    /// Creates a client-visible error from a stable feature code and safe message.
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

/// Feature adapter registered by application wiring, independent of WebSocket transport.
pub(crate) trait Feature: Send + Sync {
    /// Publishes any initial feature state for a newly authenticated connection.
    ///
    /// # Errors
    /// Returns a typed RPC [`Error`] if the feature cannot initialize this connection.
    fn connected(&self, context: Context) -> BoxFuture<'static, Result<(), Error>>;

    /// Executes a registered method.
    ///
    /// # Errors
    /// Returns a typed RPC [`Error`] for recoverable feature failures.
    fn handle(
        &self,
        context: Context,
        method: String,
        params: Value,
    ) -> BoxFuture<'static, Result<Value, Error>>;
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Envelope {
    Request {
        #[serde(default)]
        id: Value,
        method: String,
        #[serde(default)]
        params: Value,
    },
}

/// Routes requests to registered features and owns the profile-scoped event hub.
pub(crate) struct Dispatcher {
    hub: Arc<Mutex<RpcHub>>,
    methods: HashMap<&'static str, Arc<dyn Feature>>,
    features: Vec<Arc<dyn Feature>>,
}

impl Dispatcher {
    /// Creates an empty registry using the shared event hub.
    pub(crate) fn new(hub: Arc<Mutex<RpcHub>>) -> Self {
        Self {
            hub,
            methods: HashMap::new(),
            features: Vec::new(),
        }
    }

    /// Registers a feature's methods and its connection hook.
    ///
    /// Duplicate registrations are programming errors and panic during startup.
    pub(crate) fn register(&mut self, methods: &[&'static str], feature: Arc<dyn Feature>) {
        for method in methods {
            assert!(
                self.methods.insert(method, feature.clone()).is_none(),
                "duplicate RPC method"
            );
        }
        self.features.push(feature);
    }

    /// Registers a connection and queues its generic ready event.
    pub(crate) async fn connect(
        &self,
        profile_id: Uuid,
        token: Option<String>,
    ) -> (Context, mpsc::UnboundedReceiver<Value>) {
        let mut hub = self.hub.lock().await;
        let (connection_id, outbound) = hub.connect(profile_id);
        hub.send(connection_id, json!({"type":"event","method":"session.ready","params":{"connectionId":connection_id}}));
        (
            Context {
                connection_id,
                profile_id,
                token,
            },
            outbound,
        )
    }

    /// Runs feature hooks in registration order before processing this connection's requests.
    pub(crate) async fn initialize(&self, context: &Context) {
        for feature in &self.features {
            if let Err(error) = feature.connected(context.clone()).await {
                self.reply(context, failure(Value::Null, error)).await;
            }
        }
    }

    /// Decodes one envelope, invokes its registered handler, and queues the reply.
    pub(crate) async fn dispatch(&self, context: &Context, text: &str) {
        let reply = match serde_json::from_str::<Envelope>(text) {
            Ok(Envelope::Request { id, method, params }) => {
                match self.methods.get(method.as_str()) {
                    Some(feature) => match feature.handle(context.clone(), method, params).await {
                        Ok(result) => json!({"type":"result","id":id,"result":result}),
                        Err(error) => failure(id, error),
                    },
                    None => failure(
                        id,
                        Error::new(
                            "session-rpc-method-not-found",
                            "No kernel handler is registered for this method.",
                        ),
                    ),
                }
            }
            Err(_) => failure(
                Value::Null,
                Error::new("session-rpc-invalid-message", "Invalid RPC envelope."),
            ),
        };
        self.reply(context, reply).await;
    }

    /// Removes a disconnected socket; in-flight feature work may still finish for its profile.
    pub(crate) async fn disconnect(&self, connection_id: Uuid) {
        self.hub.lock().await.disconnect(connection_id);
    }

    /// Rejects a request when the per-connection queue is full.
    pub(crate) async fn overloaded(&self, context: &Context, text: &str) {
        let id = serde_json::from_str::<Envelope>(text)
            .ok()
            .map(|Envelope::Request { id, .. }| id)
            .unwrap_or(Value::Null);
        self.reply(
            context,
            failure(
                id,
                Error::new("session-rpc-overloaded", "Too many pending requests."),
            ),
        )
        .await;
    }

    async fn reply(&self, context: &Context, reply: Value) {
        self.hub.lock().await.send(context.connection_id, reply);
    }
}

fn failure(id: Value, error: Error) -> Value {
    json!({"type":"error","id":id,"error":{"code":error.code,"message":error.message}})
}
