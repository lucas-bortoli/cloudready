//! One serialized Fairy runtime per profile. Sockets observe it but never own its lifetime.
use super::{
    Conversation, MODEL,
    conversation::{Event, Generate, Phase, TransitionError},
};
use crate::application::Application;
use futures_util::future::BoxFuture;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{Mutex, mpsc, oneshot};
use uuid::Uuid;

pub(crate) type Publisher = Arc<dyn Fn(Uuid, Value) -> BoxFuture<'static, ()> + Send + Sync>;
type SnapshotSink = Box<dyn FnOnce(Value) -> BoxFuture<'static, ()> + Send>;

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error(transparent)]
    Transition(#[from] TransitionError),
    #[error("The session belongs to another profile.")]
    ProfileMismatch,
    #[error(transparent)]
    Application(#[from] crate::application::Error),
    #[error("Could not store Fairy state.")]
    Storage(#[from] rusqlite::Error),
    #[error("The saved Fairy state is invalid or unsupported.")]
    InvalidState,
    #[error("The Fairy runtime is unavailable.")]
    Unavailable,
}

#[derive(Serialize, Deserialize)]
struct Saved {
    version: u32,
    machine: Conversation,
}

enum Command {
    Snapshot {
        publish: SnapshotSink,
        reply: oneshot::Sender<()>,
    },
    Input {
        text: String,
        reply: oneshot::Sender<Result<(), Error>>,
    },
    Generated(Event),
    RefreshConnection,
}

pub(crate) struct Service {
    application: Application,
    publish: Publisher,
    connection_task: tokio::task::JoinHandle<()>,
    profiles: Arc<Mutex<HashMap<Uuid, mpsc::Sender<Command>>>>,
}

impl Service {
    pub(crate) fn new(application: Application, publish: Publisher) -> Self {
        let profiles = Arc::new(Mutex::new(HashMap::<Uuid, mpsc::Sender<Command>>::new()));
        let watching = Arc::downgrade(&profiles);
        let mut updates = application.connection_updates();
        let connection_task = tokio::spawn(async move {
            loop {
                let changed = updates.recv().await;
                let Some(profiles) = watching.upgrade() else {
                    break;
                };
                let targets: Vec<_> = profiles
                    .lock()
                    .await
                    .iter()
                    .map(|(id, sender)| (*id, sender.clone()))
                    .collect();
                match changed {
                    Ok((id, _)) => {
                        if let Some((_, sender)) =
                            targets.into_iter().find(|(profile, _)| *profile == id)
                        {
                            let _ = sender.send(Command::RefreshConnection).await;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        for (_, sender) in targets {
                            let _ = sender.send(Command::RefreshConnection).await;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        });
        Self {
            application,
            publish,
            connection_task,
            profiles,
        }
    }

    /// Restores existing profiles and restarts interrupted generations without a browser session.
    ///
    /// # Errors
    /// Returns storage, invalid-state, or worker errors if restoration fails.
    pub(crate) async fn restore(&self) -> Result<(), Error> {
        let ids = self
            .application
            .call(|database, _| {
                let mut statement = database
                    .connection()
                    .prepare("SELECT user_id FROM fairy_states")?;
                let rows = statement.query_map([], |row| row.get::<_, Vec<u8>>(0))?;
                rows.collect::<Result<Vec<_>, rusqlite::Error>>()
            })
            .await??;
        for bytes in ids {
            let id = Uuid::from_slice(&bytes).map_err(|_| Error::InvalidState)?;
            self.profile(id).await?;
        }
        Ok(())
    }

    /// Authenticates a session and orders its snapshot with all profile events.
    ///
    /// # Errors
    /// Returns authentication, storage, or runtime failures.
    pub(crate) async fn snapshot<F, Fut>(
        &self,
        profile_id: Uuid,
        token: Option<String>,
        publish: F,
    ) -> Result<(), Error>
    where
        F: FnOnce(Value) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = ()> + Send + 'static,
    {
        self.authenticate(profile_id, token.clone()).await?;
        let sender = self.profile(profile_id).await?;
        let (reply, result) = oneshot::channel();
        sender
            .send(Command::Snapshot {
                publish: Box::new(move |state| Box::pin(publish(state))),
                reply,
            })
            .await
            .map_err(|_| Error::Unavailable)?;
        result.await.map_err(|_| Error::Unavailable)
    }

    /// Accepts durable input; generation continues independently of the submitting socket.
    ///
    /// # Errors
    /// Returns invalid-input, busy, authentication, storage, or runtime failures.
    pub(crate) async fn submit(
        &self,
        profile_id: Uuid,
        token: Option<String>,
        text: &str,
    ) -> Result<(), Error> {
        self.authenticate(profile_id, token).await?;
        let sender = self.profile(profile_id).await?;
        let (reply, result) = oneshot::channel();
        sender
            .send(Command::Input {
                text: text.to_owned(),
                reply,
            })
            .await
            .map_err(|_| Error::Unavailable)?;
        result.await.map_err(|_| Error::Unavailable)?
    }

    async fn authenticate(&self, profile_id: Uuid, token: Option<String>) -> Result<(), Error> {
        if self.application.session(token).await?.profile_id != profile_id {
            return Err(Error::ProfileMismatch);
        }
        Ok(())
    }

    async fn profile(&self, profile_id: Uuid) -> Result<mpsc::Sender<Command>, Error> {
        let mut profiles = self.profiles.lock().await;
        if let Some(sender) = profiles.get(&profile_id) {
            return Ok(sender.clone());
        }
        let saved = self
            .application
            .call(move |database, _| {
                database
                    .connection()
                    .query_row(
                        "SELECT state FROM fairy_states WHERE user_id=?1",
                        [profile_id.as_bytes()],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
            })
            .await??;
        let mut machine = match saved {
            Some(saved) => {
                let saved: Saved = serde_json::from_str(&saved).map_err(|_| Error::InvalidState)?;
                if saved.version != 1 {
                    return Err(Error::InvalidState);
                }
                saved.machine
            }
            None => Conversation::new(),
        };
        machine.connected = self
            .application
            .profile_provider_connected(profile_id)
            .await?;
        let (sender, inbox) = mpsc::channel(64);
        tokio::spawn(run(
            profile_id,
            machine,
            inbox,
            sender.downgrade(),
            self.application.clone(),
            self.publish.clone(),
        ));
        profiles.insert(profile_id, sender.clone());
        Ok(sender)
    }
}

impl Drop for Service {
    fn drop(&mut self) {
        self.connection_task.abort();
    }
}

async fn save(application: &Application, id: Uuid, machine: &Conversation) -> Result<(), Error> {
    let state = serde_json::to_string(&Saved {
        version: 1,
        machine: machine.checkpoint(),
    })
    .map_err(|_| Error::InvalidState)?;
    application.call(move |database, _| {
        database.connection().execute("INSERT INTO fairy_states(user_id,state) VALUES(?1,?2) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state",
            rusqlite::params![id.as_bytes(), state])
    }).await??;
    Ok(())
}

// Apply on a candidate so a failed durable write cannot expose an uncommitted transition.
async fn apply(
    id: Uuid,
    machine: &mut Conversation,
    event: Event,
    application: &Application,
    publish: &Publisher,
    sender: &mpsc::WeakSender<Command>,
) -> Result<(), Error> {
    let transition = if matches!(
        &event,
        Event::TextDelta { .. } | Event::ConnectionChanged(_)
    ) {
        machine.transition(event)?
    } else {
        let mut next = machine.clone();
        let transition = next.transition(event)?;
        if transition.durable {
            save(application, id, &next).await?;
        }
        *machine = next;
        transition
    };
    if !transition.changes.is_empty() {
        publish(
            id,
            json!({"revision":machine.revision,"changes":transition.changes}),
        )
        .await;
    }
    if let Some(effect) = transition.generate {
        if let Some(sender) = sender.upgrade() {
            start_generation(id, effect, application.clone(), sender);
        }
    }
    Ok(())
}

async fn run(
    id: Uuid,
    mut machine: Conversation,
    mut inbox: mpsc::Receiver<Command>,
    sender: mpsc::WeakSender<Command>,
    application: Application,
    publish: Publisher,
) {
    if matches!(machine.phase, Phase::GeneratingText { .. }) {
        if let Err(error) = apply(
            id,
            &mut machine,
            Event::Resume {
                attempt_id: Uuid::new_v4(),
            },
            &application,
            &publish,
            &sender,
        )
        .await
        {
            eprintln!("Could not resume Fairy for {id}: {error}");
            return;
        }
    }
    while let Some(command) = inbox.recv().await {
        match command {
            Command::Snapshot {
                publish: snapshot_sink,
                reply,
            } => {
                // Refresh inside the inbox to order the status read with connection events.
                if let Ok(connected) = application.profile_provider_connected(id).await {
                    let _ = apply(
                        id,
                        &mut machine,
                        Event::ConnectionChanged(connected),
                        &application,
                        &publish,
                        &sender,
                    )
                    .await;
                }
                snapshot_sink(machine.snapshot()).await;
                let _ = reply.send(());
            }
            Command::Input { text, reply } => {
                let event = Event::UserInput {
                    turn_id: Uuid::new_v4(),
                    attempt_id: Uuid::new_v4(),
                    message_id: Uuid::new_v4(),
                    text,
                };
                let result = apply(id, &mut machine, event, &application, &publish, &sender).await;
                let _ = reply.send(result);
            }
            Command::RefreshConnection => {
                if let Ok(connected) = application.profile_provider_connected(id).await {
                    let _ = apply(
                        id,
                        &mut machine,
                        Event::ConnectionChanged(connected),
                        &application,
                        &publish,
                        &sender,
                    )
                    .await;
                }
            }
            Command::Generated(event) => {
                if let Err(error) =
                    apply(id, &mut machine, event, &application, &publish, &sender).await
                {
                    // Fail closed: the durable generation will be regenerated after restart.
                    eprintln!("Could not commit Fairy state for {id}: {error}");
                    break;
                }
            }
        }
    }
}

fn start_generation(
    id: Uuid,
    effect: Generate,
    application: Application,
    sender: mpsc::Sender<Command>,
) {
    tokio::spawn(async move {
        let attempt_id = effect.attempt_id;
        let (chunks, mut incoming) = mpsc::channel::<String>(32);
        let task = tokio::spawn(async move {
            let client = application.generation_client(id).await?;
            tokio::task::spawn_blocking(move || {
                client.generate_text(MODEL, &effect.prompt, |text| {
                    let _ = chunks.blocking_send(text);
                })
            })
            .await
            .map_err(|_| crate::application::Error::Unavailable)?
            .map_err(crate::application::Error::Provider)
        });
        while let Some(mut text) = incoming.recv().await {
            // Combine chunks already available without delaying the first visible output.
            while let Ok(chunk) = incoming.try_recv() {
                text.push_str(&chunk);
            }
            if sender
                .send(Command::Generated(Event::TextDelta { attempt_id, text }))
                .await
                .is_err()
            {
                return;
            }
        }
        let success = matches!(task.await, Ok(Ok(_)));
        let _ = sender
            .send(Command::Generated(Event::Finished {
                attempt_id,
                success,
            }))
            .await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::SessionStore;

    async fn fixture() -> (Application, Uuid, String) {
        let application = Application::start(":memory:".into()).await.unwrap();
        let (id, token) = application
            .call(|database, _| {
                let store = SessionStore::new(database);
                let user = store.create_first_user("Ada")?;
                let (_, token) = store.start(user.id)?;
                Ok::<_, crate::session::Error>((user.id, token))
            })
            .await
            .unwrap()
            .unwrap();
        (application, id, token)
    }

    async fn state(service: &Service, id: Uuid, token: String) -> Value {
        let (send, receive) = oneshot::channel();
        service
            .snapshot(id, Some(token), move |snapshot| async move {
                let _ = send.send(snapshot);
            })
            .await
            .unwrap();
        receive.await.unwrap()
    }

    #[tokio::test]
    async fn restores_interrupted_turn_with_new_attempt_and_without_partial_text() {
        let (application, id, token) = fixture().await;
        let mut machine = Conversation::new();
        let old = Uuid::new_v4();
        machine
            .transition(Event::UserInput {
                turn_id: Uuid::new_v4(),
                attempt_id: old,
                message_id: Uuid::new_v4(),
                text: "Regenerate me".into(),
            })
            .unwrap();
        machine
            .transition(Event::TextDelta {
                attempt_id: old,
                text: "disposable".into(),
            })
            .unwrap();
        save(&application, id, &machine).await.unwrap();
        let (events, mut received) = mpsc::unbounded_channel();
        let service = Service::new(
            application.clone(),
            Arc::new(move |_, event| {
                let events = events.clone();
                Box::pin(async move {
                    let _ = events.send(event);
                })
            }),
        );
        service.restore().await.unwrap();
        let resumed = tokio::time::timeout(std::time::Duration::from_secs(3), received.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(resumed["changes"][0]["message"]["text"], "");
        // No credentials are configured, so the recovered request terminates as failed.
        let finished = tokio::time::timeout(std::time::Duration::from_secs(3), received.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(finished["changes"][0]["message"]["status"], "failed");
        let snapshot = state(&service, id, token.clone()).await;
        assert_eq!(snapshot["messages"][0]["text"], "Regenerate me");
        assert_eq!(snapshot["messages"][1]["text"], "");
        assert_eq!(snapshot["phase"], "awaiting-input");
        drop(service);
        let restored = Service::new(application, Arc::new(|_, _| Box::pin(async {})));
        assert_eq!(state(&restored, id, token).await, snapshot);
    }

    #[tokio::test]
    async fn rejects_another_profiles_session_before_creating_state() {
        let (application, _, token) = fixture().await;
        let service = Service::new(application, Arc::new(|_, _| Box::pin(async {})));
        assert!(matches!(
            service.submit(Uuid::new_v4(), Some(token), "private").await,
            Err(Error::ProfileMismatch)
        ));
        assert!(service.profiles.lock().await.is_empty());
    }
}
