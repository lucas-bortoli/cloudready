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

    /// Reads provider availability for the current session.
    ///
    /// # Errors
    /// Returns [`Error::Session`] for an invalid token, [`Error::Provider`] for credential-store
    /// failures, or [`Error::Unavailable`] if the worker has stopped.
    pub(crate) async fn provider_connected(&self, token: Option<String>) -> Result<bool, Error> {
        self.call(move |database, intelligence| {
            let user = session::SessionStore::new(database).current(token.as_deref())?;
            Ok(intelligence.connection(user.id)?.connected)
        })
        .await?
    }

    /// Generates text for the current session, rechecking revocation on every request.
    ///
    /// # Errors
    /// Returns [`Error::Session`] if the token is invalid, [`Error::Provider`] for generation
    /// failures, or [`Error::Unavailable`] if the service worker has stopped.
    pub(crate) async fn generate_text(
        &self,
        token: Option<String>,
        model: String,
        input: String,
    ) -> Result<String, Error> {
        self.call(move |database, intelligence| {
            let user = session::SessionStore::new(database).current(token.as_deref())?;
            Ok(intelligence.generate_text(user.id, &model, &input)?.text)
        })
        .await?
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
