//! Profile-owned conversations and turn execution, independent of RPC and WebSockets.

use std::{collections::HashMap, future::Future, sync::Arc};

use serde_json::Value;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::application::Application;

use super::{Conversation, MODEL};

/// Recoverable Fairy use-case failures.
#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("A message is required.")]
    InvalidInput,
    #[error("The session belongs to another profile.")]
    ProfileMismatch,
    #[error(transparent)]
    Application(#[from] crate::application::Error),
}

/// State lives for the kernel process, including periods when a profile has no open sockets.
struct Profile {
    conversation: Mutex<Conversation>,
    // Serialize turns without holding the conversation lock during a provider request.
    turn: Mutex<()>,
}

/// Coordinates one shared conversation per profile.
pub(crate) struct Service {
    application: Application,
    profiles: Mutex<HashMap<Uuid, Arc<Profile>>>,
}

impl Service {
    /// Creates the process-scoped Fairy service.
    pub(crate) fn new(application: Application) -> Self {
        Self {
            application,
            profiles: Mutex::new(HashMap::new()),
        }
    }

    /// Publishes current state after verifying the requesting profile's session.
    ///
    /// Holding the state lock through publication orders snapshots with turn events, preventing
    /// a reconnecting socket from receiving an old snapshot after a newer delta.
    ///
    /// # Errors
    /// Returns [`Error::ProfileMismatch`] for another profile's token, or [`Error::Application`]
    /// for session, credential-store, or worker failures.
    pub(crate) async fn snapshot<F, Fut, T>(
        &self,
        profile_id: Uuid,
        token: Option<String>,
        publish: F,
    ) -> Result<T, Error>
    where
        F: FnOnce(Value) -> Fut,
        Fut: Future<Output = T>,
    {
        self.authenticate(profile_id, token.clone()).await?;
        let connected = self.application.provider_connected(token).await?;
        let profile = self.profile(profile_id).await;
        let conversation = profile.conversation.lock().await;
        Ok(publish(conversation.snapshot(connected)).await)
    }

    /// Executes a turn and publishes pending and final state to the caller's event sink.
    ///
    /// Turns are serialized per profile. State remains readable while generation is running;
    /// disconnecting the submitting socket does not cancel the turn or discard its history.
    /// The event sink must deliver promptly and must not call back into this service while
    /// publishing: state stays locked until its corresponding event has been queued.
    ///
    /// # Errors
    /// Returns [`Error::InvalidInput`] for blank text, [`Error::ProfileMismatch`] for the wrong
    /// profile, or [`Error::Application`] for authentication and provider failures.
    pub(crate) async fn submit<F, Fut>(
        &self,
        profile_id: Uuid,
        token: Option<String>,
        text: &str,
        publish: F,
    ) -> Result<(), Error>
    where
        F: Fn(Value) -> Fut,
        Fut: Future<Output = ()>,
    {
        let text = text.trim();
        if text.is_empty() {
            return Err(Error::InvalidInput);
        }
        let profile = self.profile(profile_id).await;
        let _turn = profile.turn.lock().await;
        // A queued turn may outlive the session that submitted it.
        self.authenticate(profile_id, token.clone()).await?;
        let connected = self.application.provider_connected(token.clone()).await?;
        let (turn_id, prompt) = {
            let mut conversation = profile.conversation.lock().await;
            let id = conversation.begin_turn(text);
            let prompt = conversation.prompt(text);
            publish(conversation.snapshot(connected)).await;
            (id, prompt)
        };
        let result = self
            .application
            .generate_text(token, MODEL.to_owned(), prompt)
            .await;
        let mut conversation = profile.conversation.lock().await;
        match result {
            Ok(answer) => {
                conversation.complete_turn(answer);
                publish(conversation.snapshot(connected)).await;
                Ok(())
            }
            Err(error) => {
                conversation.fail_turn(&turn_id);
                publish(conversation.snapshot(connected)).await;
                Err(error.into())
            }
        }
    }

    async fn authenticate(&self, profile_id: Uuid, token: Option<String>) -> Result<(), Error> {
        let session = self.application.session(token).await?;
        if session.profile_id != profile_id {
            return Err(Error::ProfileMismatch);
        }
        Ok(())
    }

    async fn profile(&self, profile_id: Uuid) -> Arc<Profile> {
        self.profiles
            .lock()
            .await
            .entry(profile_id)
            .or_insert_with(|| {
                Arc::new(Profile {
                    conversation: Mutex::new(Conversation::new()),
                    turn: Mutex::new(()),
                })
            })
            .clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::SessionStore;

    #[tokio::test]
    async fn isolates_profile_history_and_rejects_another_profiles_token() {
        let application = Application::start(":memory:".into()).await.unwrap();
        let (first, first_token, second, second_token) = application
            .call(|database, _| {
                let store = SessionStore::new(database);
                let first = store.create_first_user("Ada")?;
                // Production first-run setup creates one user; seed another profile to test isolation.
                let second = Uuid::new_v4();
                database.connection().execute(
                    "INSERT INTO users(id, display_name, created_at) VALUES (?1, 'Grace', 0)",
                    rusqlite::params![second.as_bytes()],
                )?;
                let (_, first_token) = store.start(first.id)?;
                let (_, second_token) = store.start(second)?;
                Ok::<_, crate::session::Error>((first.id, first_token, second, second_token))
            })
            .await
            .unwrap()
            .unwrap();
        let service = Service::new(application);
        let result = service
            .submit(
                first,
                Some(first_token.clone()),
                "Private message",
                |_| async {},
            )
            .await;
        assert!(matches!(
            result,
            Err(Error::Application(crate::application::Error::Provider(_)))
        ));
        let first_state = service
            .snapshot(first, Some(first_token.clone()), |state| async { state })
            .await
            .unwrap();
        assert_eq!(first_state["messages"][0]["text"], "Private message");
        let second_state = service
            .snapshot(second, Some(second_token), |state| async { state })
            .await
            .unwrap();
        assert_eq!(second_state["messages"], serde_json::json!([]));
        assert!(matches!(
            service
                .snapshot(second, Some(first_token), |state| async { state })
                .await,
            Err(Error::ProfileMismatch)
        ));
    }
}
