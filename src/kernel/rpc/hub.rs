use std::collections::HashMap;

use serde_json::Value;
use tokio::sync::mpsc;
use uuid::Uuid;

/// Kernel-owned registry for generic, profile-scoped session RPC connections.
pub(crate) struct RpcHub {
    connections: HashMap<Uuid, Connection>,
}

struct Connection {
    profile_id: Uuid,
    sender: mpsc::UnboundedSender<Value>,
}

impl RpcHub {
    /// Creates an empty connection registry.
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
        }
    }

    /// Registers an authenticated connection and returns its kernel-issued ID and message receiver.
    pub fn connect(&mut self, profile_id: Uuid) -> (Uuid, mpsc::UnboundedReceiver<Value>) {
        let id = Uuid::new_v4();
        let (sender, receiver) = mpsc::unbounded_channel();
        self.connections
            .insert(id, Connection { profile_id, sender });
        (id, receiver)
    }

    /// Removes an ended connection.
    pub fn disconnect(&mut self, id: Uuid) {
        self.connections.remove(&id);
    }

    /// Delivers an RPC envelope to one connection.
    pub fn send(&mut self, id: Uuid, message: Value) -> bool {
        let Some(connection) = self.connections.get(&id) else {
            return false;
        };
        if connection.sender.send(message).is_ok() {
            return true;
        }
        self.connections.remove(&id);
        false
    }

    /// Delivers an RPC event to all live connections belonging to one profile.
    pub fn broadcast(&mut self, profile_id: Uuid, message: Value) {
        self.connections.retain(|_, connection| {
            connection.profile_id != profile_id || connection.sender.send(message.clone()).is_ok()
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn sends_only_to_the_target_profile() {
        let profile = Uuid::new_v4();
        let other = Uuid::new_v4();
        let mut hub = RpcHub::new();
        let (_, mut first) = hub.connect(profile);
        let (_, mut second) = hub.connect(profile);
        let (_, mut outsider) = hub.connect(other);
        hub.broadcast(profile, json!({"type":"event"}));
        assert_eq!(first.recv().await, Some(json!({"type":"event"})));
        assert_eq!(second.recv().await, Some(json!({"type":"event"})));
        assert!(outsider.try_recv().is_err());
    }
}
