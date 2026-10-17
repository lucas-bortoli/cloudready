//! Single-thread ownership and bounded dispatch for blocking kernel services.

use super::Error;
use crate::{database::Database, machine_intelligence::MachineIntelligence};
use std::path::PathBuf;
use tokio::sync::{broadcast, mpsc, oneshot};

type Job = Box<dyn FnOnce(&Database, &mut MachineIntelligence<'_>) + Send>;

/// Cloneable queue handle; dropping every handle lets the worker release its services.
#[derive(Clone)]
pub(super) struct Worker {
    sender: mpsc::Sender<Job>,
    updates: broadcast::Sender<(uuid::Uuid, bool)>,
}

impl Worker {
    /// Starts the worker and waits until database initialization has completed.
    ///
    /// # Errors
    /// Returns [`Error::Thread`] if the OS cannot create the thread, [`Error::Database`] if
    /// initialization fails, or [`Error::Unavailable`] if the worker exits before reporting ready.
    pub(super) async fn start(path: PathBuf) -> Result<Self, Error> {
        let (sender, mut receiver) = mpsc::channel::<Job>(16);
        let (updates, _) = broadcast::channel(64);
        let connection_updates = updates.clone();
        let (ready, initialized) = oneshot::channel();
        std::thread::Builder::new()
            .name("kernel-services".into())
            .spawn(move || {
                let database = match Database::open(&path) {
                    Ok(database) => database,
                    Err(error) => {
                        let _ = ready.send(Err(error));
                        return;
                    }
                };
                let mut intelligence = MachineIntelligence::new(&database);
                intelligence.observe_connections(connection_updates);
                if ready.send(Ok(())).is_err() {
                    return;
                }
                // Dropping all application handles closes the queue and releases the services.
                while let Some(job) = receiver.blocking_recv() {
                    job(&database, &mut intelligence);
                }
            })
            .map_err(Error::Thread)?;
        initialized.await.map_err(|_| Error::Unavailable)??;
        Ok(Self { sender, updates })
    }

    pub(super) fn connection_updates(&self) -> broadcast::Receiver<(uuid::Uuid, bool)> {
        self.updates.subscribe()
    }

    /// Runs a blocking service operation with owned inputs and an owned result.
    ///
    /// The queue provides backpressure. Operations canceled before execution are skipped;
    /// operations already running finish normally, including their database transactions.
    ///
    /// # Errors
    /// Returns [`Error::Unavailable`] if the worker has stopped. Feature failures are returned
    /// inside `T`, preserving their concrete error types for the calling adapter.
    pub(super) async fn call<T, F>(&self, operation: F) -> Result<T, Error>
    where
        T: Send + 'static,
        F: FnOnce(&Database, &mut MachineIntelligence<'_>) -> T + Send + 'static,
    {
        let (reply, result) = oneshot::channel();
        self.sender
            .send(Box::new(move |database, intelligence| {
                if !reply.is_closed() {
                    let _ = reply.send(operation(database, intelligence));
                }
            }))
            .await
            .map_err(|_| Error::Unavailable)?;
        result.await.map_err(|_| Error::Unavailable)
    }
}
