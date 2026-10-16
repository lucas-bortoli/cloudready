use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

use super::INSTRUCTIONS;

/// A browser-visible message in a single Fairy conversation.
#[derive(Serialize)]
pub(super) struct Message {
    id: String,
    role: &'static str,
    text: String,
    status: &'static str,
}

/// The browser-safe state sent to subscribed sessions.
#[derive(Serialize)]
struct Snapshot<'a> {
    messages: &'a [Message],
    queued: Option<&'a str>,
    activity: Option<&'a str>,
    connected: bool,
}

/// Owns one profile's in-memory conversation and turn lifecycle.
pub struct Conversation {
    messages: Vec<Message>,
    queued: Option<String>,
    activity: Option<&'static str>,
}

impl Conversation {
    /// Creates an empty conversation.
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
            queued: None,
            activity: None,
        }
    }
    /// Records a user turn and returns its stable turn identifier.
    pub fn begin_turn(&mut self, text: &str) -> String {
        let id = Uuid::new_v4().to_string();
        self.messages.push(Message {
            id: id.clone(),
            role: "user",
            text: text.to_owned(),
            status: "complete",
        });
        self.activity = Some("Navi is thinking…");
        id
    }
    /// Builds the provider input for a submitted user turn.
    pub fn prompt(&self, text: &str) -> String {
        format!("{INSTRUCTIONS}\n\nUser: {text}")
    }
    /// Appends a completed assistant response.
    pub fn complete_turn(&mut self, text: String) {
        self.messages.push(Message {
            id: Uuid::new_v4().to_string(),
            role: "assistant",
            text,
            status: "complete",
        });
        self.activity = None;
    }
    /// Marks a submitted user turn as retryable.
    pub fn fail_turn(&mut self, id: &str) {
        if let Some(message) = self.messages.iter_mut().find(|message| message.id == id) {
            message.status = "failed";
        }
        self.activity = None;
    }
    /// Serializes the authoritative state consumed by Fairy sessions.
    pub fn snapshot(&self, connected: bool) -> Value {
        json!(Snapshot {
            messages: &self.messages,
            queued: self.queued.as_deref(),
            activity: self.activity,
            connected
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_turn_is_visible_and_retryable() {
        let mut conversation = Conversation::new();
        let turn = conversation.begin_turn("Can you help?");
        conversation.fail_turn(&turn);

        let snapshot = conversation.snapshot(false);
        assert_eq!(snapshot["connected"], false);
        assert_eq!(snapshot["activity"], Value::Null);
        assert_eq!(snapshot["messages"][0]["role"], "user");
        assert_eq!(snapshot["messages"][0]["status"], "failed");
    }

    #[test]
    fn completed_turn_appends_an_assistant_message() {
        let mut conversation = Conversation::new();
        conversation.begin_turn("Hello");
        conversation.complete_turn("Hi!".into());

        let snapshot = conversation.snapshot(true);
        assert_eq!(snapshot["messages"].as_array().unwrap().len(), 2);
        assert_eq!(snapshot["messages"][1]["role"], "assistant");
        assert_eq!(snapshot["messages"][1]["text"], "Hi!");
    }
}
