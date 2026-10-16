//! Fairy's RPC methods and projection of service state onto profile-scoped events.

use std::sync::Arc;

use futures_util::future::BoxFuture;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::Mutex;

use crate::rpc::{
    dispatcher::{Context, Error, Feature},
    hub::RpcHub,
};

use super::service::{self, Service};

/// Feature-owned method registration, consumed only by application wiring.
pub(crate) const METHODS: &[&str] = &["fairy.subscribe", "fairy.turn.submit"];

/// Adapts Fairy use cases to the generic RPC dispatcher.
#[derive(Clone)]
pub(crate) struct FairyRpc {
    service: Arc<Service>,
    hub: Arc<Mutex<RpcHub>>,
}

#[derive(Deserialize)]
struct SubmitTurn {
    text: String,
}

impl FairyRpc {
    /// Connects the profile-owned service to the shared event sink.
    pub(crate) fn new(service: Arc<Service>, hub: Arc<Mutex<RpcHub>>) -> Self {
        Self { service, hub }
    }

    async fn snapshot(&self, context: Context) -> Result<(), Error> {
        let hub = self.hub.clone();
        self.service
            .snapshot(
                context.profile_id,
                context.token,
                move |snapshot| async move {
                    hub.lock().await.send(
                        context.connection_id,
                        event("fairy.state.snapshot", snapshot),
                    );
                },
            )
            .await
            .map_err(|error| Error::new("fairy-state-failed", error.to_string()))?;
        Ok(())
    }
}

impl Feature for FairyRpc {
    fn connected(&self, context: Context) -> BoxFuture<'static, Result<(), Error>> {
        let this = self.clone();
        Box::pin(async move { this.snapshot(context).await })
    }

    fn handle(
        &self,
        context: Context,
        method: String,
        params: Value,
    ) -> BoxFuture<'static, Result<Value, Error>> {
        let this = self.clone();
        Box::pin(async move {
            match method.as_str() {
                "fairy.subscribe" => this.snapshot(context).await?,
                "fairy.turn.submit" => {
                    let input: SubmitTurn = serde_json::from_value(params)
                        .map_err(|_| Error::new("fairy-invalid-input", "A message is required."))?;
                    let hub = this.hub.clone();
                    let profile_id = context.profile_id;
                    this.service
                        .submit(profile_id, context.token, &input.text, move |snapshot| {
                            let hub = hub.clone();
                            async move {
                                hub.lock()
                                    .await
                                    .broadcast(profile_id, event("fairy.state.delta", snapshot));
                            }
                        })
                        .await
                        .map_err(map_error)?;
                }
                _ => unreachable!("only registered Fairy methods reach this adapter"),
            }
            Ok(json!({}))
        })
    }
}

fn event(method: &str, snapshot: Value) -> Value {
    json!({"type":"event","method":method,"params":snapshot})
}

fn map_error(error: service::Error) -> Error {
    let code = match error {
        service::Error::InvalidInput => "fairy-invalid-input",
        _ => "fairy-generation-failed",
    };
    Error::new(code, error.to_string())
}
