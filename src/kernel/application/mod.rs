//! Async access to the kernel's blocking services.
//!
//! SQLite and the provider client live on one dedicated thread. Borrowed service lifetimes
//! stay on that thread; callers exchange owned inputs and typed results through a bounded queue.
//! This also keeps OAuth attempts alive between requests without blocking Tokio's executor.

use std::path::PathBuf;

use crate::{database::Database, machine_intelligence::MachineIntelligence};
use crate::{machine_intelligence, session};

pub(crate) mod rpc;
mod worker;

/// Failures to start or communicate with the service worker.
#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("Could not start the kernel service worker.")]
    Thread(#[source] std::io::Error),
    #[error("Could not open the kernel database.")]
    Database(#[from] crate::database::Error),
    #[error("The kernel service worker is unavailable.")]
    Unavailable,
    #[error(transparent)]
    Session(#[from] session::Error),
    #[error(transparent)]
    Provider(#[from] machine_intelligence::Error),
}

/// Server-authenticated identity for an RPC connection.
pub(crate) struct AuthenticatedSession {
    pub(crate) profile_id: uuid::Uuid,
}

/// Cloneable handle shared by HTTP and RPC adapters.
#[derive(Clone)]
pub(crate) struct Application {
    worker: worker::Worker,
}

impl Application {
    pub(crate) fn connection_updates(
        &self,
    ) -> tokio::sync::broadcast::Receiver<(uuid::Uuid, bool)> {
        self.worker.connection_updates()
    }

    /// Reads provider availability without a browser token for a profile-owned runtime.
    ///
    /// # Errors
    /// Returns credential-store or worker failures.
    pub(crate) async fn profile_provider_connected(&self, id: uuid::Uuid) -> Result<bool, Error> {
        self.call(move |_, intelligence| intelligence.connection(id).map(|status| status.connected))
            .await?
            .map_err(Error::Provider)
    }

    /// Resolves a browser token on the service thread.
    ///
    /// # Errors
    /// Returns [`Error::Session`] for absent or expired sessions or
    /// [`Error::Unavailable`] if the worker has stopped.
    pub(crate) async fn session(
        &self,
        token: Option<String>,
    ) -> Result<AuthenticatedSession, Error> {
        self.call(move |database, _| {
            let user = session::SessionStore::new(database).current(token.as_deref())?;
            Ok(AuthenticatedSession {
                profile_id: user.id,
            })
        })
        .await?
    }

    /// Resolves an owned provider client without running network generation on the worker.
    ///
    /// # Errors
    /// Returns provider credential errors or worker unavailability.
    pub(crate) async fn generation_client(
        &self,
        profile_id: uuid::Uuid,
    ) -> Result<machine_intelligence::GenerationClient, Error> {
        self.call(move |_, intelligence| intelligence.generation_client(profile_id))
            .await?
            .map_err(Error::Provider)
    }

    /// Starts the application after database initialization succeeds.
    ///
    /// # Errors
    /// Returns [`Error::Thread`], [`Error::Database`], or [`Error::Unavailable`] when startup fails.
    pub(crate) async fn start(path: PathBuf) -> Result<Self, Error> {
        Ok(Self {
            worker: worker::Worker::start(path).await?,
        })
    }

    /// Runs a blocking service operation and returns its owned, typed result.
    ///
    /// # Errors
    /// Returns [`Error::Unavailable`] if the worker has stopped; feature errors remain inside `T`.
    pub(crate) async fn call<T, F>(&self, operation: F) -> Result<T, Error>
    where
        T: Send + 'static,
        F: FnOnce(&Database, &mut MachineIntelligence<'_>) -> T + Send + 'static,
    {
        self.worker.call(operation).await
    }
}
