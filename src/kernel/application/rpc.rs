//! Composition of application features onto the generic session RPC runtime.
//!
//! New features register here; neither the dispatcher nor the socket adapter needs to know
//! their method names, service types, or state ownership rules.

use std::sync::Arc;

use tokio::sync::Mutex;

use super::Application;
use crate::{
    fairy::{
        rpc::{FairyRpc, METHODS},
        service::Service as FairyService,
    },
    rpc::{dispatcher::Dispatcher, hub::RpcHub},
};

/// Creates the process-scoped feature services and their RPC registrations.
pub(crate) fn dispatcher(application: Application) -> Arc<Dispatcher> {
    let hub = Arc::new(Mutex::new(RpcHub::new()));
    let events = hub.clone();
    let fairy = Arc::new(FairyService::new(
        application,
        Arc::new(move |profile_id, params| {
            let events = events.clone();
            Box::pin(async move {
                events.lock().await.broadcast(
                    profile_id,
                    serde_json::json!({
                        "type":"event", "method":"fairy.state.delta", "params":params
                    }),
                );
            })
        }),
    ));
    let restoring = fairy.clone();
    tokio::spawn(async move {
        if let Err(error) = restoring.restore().await {
            eprintln!("Could not restore Fairy state: {error}");
        }
    });
    let mut dispatcher = Dispatcher::new(hub.clone());
    dispatcher.register(METHODS, Arc::new(FairyRpc::new(fairy, hub)));
    Arc::new(dispatcher)
}
