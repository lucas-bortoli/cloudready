//! Deterministic Fairy transitions. External work is represented as effects.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use super::INSTRUCTIONS;

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Message {
    id: Uuid,
    role: String,
    text: String,
    status: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub(super) enum Phase {
    AwaitingInput,
    GeneratingText {
        turn_id: Uuid,
        attempt_id: Uuid,
        message_id: Uuid,
        prompt: String,
    },
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Conversation {
    pub(super) revision: u64,
    #[serde(skip)]
    pub(super) connected: bool,
    messages: Vec<Message>,
    pub(super) phase: Phase,
}

pub(super) enum Event {
    ConnectionChanged(bool),
    UserInput {
        turn_id: Uuid,
        attempt_id: Uuid,
        message_id: Uuid,
        text: String,
    },
    TextDelta {
        attempt_id: Uuid,
        text: String,
    },
    Finished {
        attempt_id: Uuid,
        success: bool,
    },
    Resume {
        attempt_id: Uuid,
    },
}

pub(super) struct Generate {
    pub(super) attempt_id: Uuid,
    pub(super) prompt: String,
}

pub(super) struct Transition {
    pub(super) changes: Vec<Value>,
    pub(super) generate: Option<Generate>,
    pub(super) durable: bool,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum TransitionError {
    #[error("Navi is already generating a response.")]
    Busy,
    #[error("A message between 1 and 12000 bytes is required.")]
    InvalidInput,
}

impl Conversation {
    pub(super) fn new() -> Self {
        Self {
            revision: 0,
            connected: false,
            messages: vec![],
            phase: Phase::AwaitingInput,
        }
    }

    pub(super) fn snapshot(&self) -> Value {
        json!({ "revision": self.revision, "messages": self.messages,
            "phase": self.phase_name(), "activity": self.activity(), "queued": null,
            "connected": self.connected })
    }

    fn phase_name(&self) -> &'static str {
        match self.phase {
            Phase::AwaitingInput => "awaiting-input",
            Phase::GeneratingText { .. } => "generating-text",
        }
    }

    fn activity(&self) -> Option<&str> {
        match self.phase {
            Phase::AwaitingInput => None,
            Phase::GeneratingText { .. } => Some("Navi is responding?"),
        }
    }

    // Streaming output is disposable. The durable generation retains its exact input instead.
    pub(super) fn checkpoint(&self) -> Self {
        let mut saved = self.clone();
        if let Phase::GeneratingText { message_id, .. } = saved.phase {
            if let Some(message) = saved.messages.iter_mut().find(|m| m.id == message_id) {
                message.text.clear();
            }
        }
        saved
    }

    pub(super) fn transition(&mut self, event: Event) -> Result<Transition, TransitionError> {
        let mut changes = vec![];
        let mut generate = None;
        let mut durable = false;
        match event {
            Event::ConnectionChanged(connected) => {
                if self.connected != connected {
                    self.connected = connected;
                    changes.push(json!({"kind":"connection-changed", "connected":connected}));
                }
            }
            Event::UserInput {
                turn_id,
                attempt_id,
                message_id,
                text,
            } => {
                if !matches!(self.phase, Phase::AwaitingInput) {
                    return Err(TransitionError::Busy);
                }
                let text = text.trim();
                if text.is_empty() || text.len() > 12_000 {
                    return Err(TransitionError::InvalidInput);
                }
                // Keep the provider's bounded prompt valid while including recent completed context.
                let mut history = Vec::new();
                let mut remaining = 15_000usize.saturating_sub(INSTRUCTIONS.len() + text.len());
                for message in self
                    .messages
                    .iter()
                    .rev()
                    .filter(|m| m.status == "complete")
                {
                    let entry = format!("{}: {}", message.role, message.text);
                    if entry.len() + 2 > remaining {
                        break;
                    }
                    remaining -= entry.len() + 2;
                    history.push(entry);
                }
                history.reverse();
                let prompt = format!("{INSTRUCTIONS}\n\n{}\n\nuser: {text}", history.join("\n\n"));
                for message in [
                    Message {
                        id: turn_id,
                        role: "user".into(),
                        text: text.into(),
                        status: "complete".into(),
                    },
                    Message {
                        id: message_id,
                        role: "assistant".into(),
                        text: String::new(),
                        status: "pending".into(),
                    },
                ] {
                    changes.push(json!({"kind":"message-created", "message":message}));
                    self.messages.push(message);
                }
                self.phase = Phase::GeneratingText {
                    turn_id,
                    attempt_id,
                    message_id,
                    prompt: prompt.clone(),
                };
                generate = Some(Generate { attempt_id, prompt });
                durable = true;
            }
            Event::TextDelta { attempt_id, text } => {
                if let Phase::GeneratingText {
                    attempt_id: active,
                    message_id,
                    ..
                } = &self.phase
                {
                    if *active == attempt_id {
                        let message = self
                            .messages
                            .iter_mut()
                            .find(|m| m.id == *message_id)
                            .expect("active assistant");
                        message.text.push_str(&text);
                        changes.push(json!({"kind":"text-appended", "id":message_id, "text":text}));
                    }
                }
            }
            Event::Finished {
                attempt_id,
                success,
            } => {
                if let Phase::GeneratingText {
                    attempt_id: active,
                    message_id,
                    turn_id,
                    ..
                } = self.phase
                {
                    if active == attempt_id {
                        for message in self
                            .messages
                            .iter_mut()
                            .filter(|m| m.id == message_id || (!success && m.id == turn_id))
                        {
                            message.status = if success { "complete" } else { "failed" }.into();
                            changes.push(json!({"kind":"message-updated", "message":message}));
                        }
                        self.phase = Phase::AwaitingInput;
                        durable = true;
                    }
                }
            }
            Event::Resume { attempt_id } => {
                if let Phase::GeneratingText {
                    attempt_id: active,
                    message_id,
                    prompt,
                    ..
                } = &mut self.phase
                {
                    *active = attempt_id;
                    let message = self
                        .messages
                        .iter_mut()
                        .find(|m| m.id == *message_id)
                        .expect("active assistant");
                    message.text.clear();
                    changes.push(json!({"kind":"message-updated", "message":message}));
                    generate = Some(Generate {
                        attempt_id,
                        prompt: prompt.clone(),
                    });
                    durable = true;
                }
            }
        }
        if !changes.is_empty() {
            self.revision += 1;
        }
        if durable {
            changes.push(json!({"kind":"phase-changed", "phase":self.phase_name(), "activity":self.activity()}));
        }
        Ok(Transition {
            changes,
            generate,
            durable,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn start(machine: &mut Conversation) -> Uuid {
        let attempt_id = Uuid::new_v4();
        machine
            .transition(Event::UserInput {
                turn_id: Uuid::new_v4(),
                attempt_id,
                message_id: Uuid::new_v4(),
                text: "Hello".into(),
            })
            .unwrap();
        attempt_id
    }

    #[test]
    fn checkpoint_discards_partial_output_and_resume_rejects_old_attempts() {
        let mut machine = Conversation::new();
        let first = start(&mut machine);
        machine
            .transition(Event::TextDelta {
                attempt_id: first,
                text: "Old".into(),
            })
            .unwrap();
        assert_eq!(machine.snapshot()["messages"][1]["text"], "Old");
        let saved = serde_json::to_string(&machine.checkpoint()).unwrap();
        let mut restored: Conversation = serde_json::from_str(&saved).unwrap();
        let next = Uuid::new_v4();
        assert!(
            restored
                .transition(Event::Resume { attempt_id: next })
                .unwrap()
                .generate
                .is_some()
        );
        assert!(
            restored
                .transition(Event::TextDelta {
                    attempt_id: first,
                    text: "stale".into()
                })
                .unwrap()
                .changes
                .is_empty()
        );
        restored
            .transition(Event::TextDelta {
                attempt_id: next,
                text: "New".into(),
            })
            .unwrap();
        restored
            .transition(Event::Finished {
                attempt_id: next,
                success: true,
            })
            .unwrap();
        assert_eq!(restored.snapshot()["messages"][1]["text"], "New");
        assert_eq!(restored.snapshot()["messages"][1]["status"], "complete");
        assert!(matches!(restored.phase, Phase::AwaitingInput));
    }

    #[test]
    fn rejects_concurrent_input_and_keeps_failed_turn_retryable() {
        let mut machine = Conversation::new();
        let attempt_id = start(&mut machine);
        assert!(matches!(
            machine.transition(Event::UserInput {
                turn_id: Uuid::new_v4(),
                attempt_id: Uuid::new_v4(),
                message_id: Uuid::new_v4(),
                text: "second".into()
            }),
            Err(TransitionError::Busy)
        ));
        machine
            .transition(Event::Finished {
                attempt_id,
                success: false,
            })
            .unwrap();
        assert_eq!(machine.snapshot()["messages"][0]["status"], "failed");
    }
}
