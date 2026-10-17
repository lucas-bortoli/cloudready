use std::{
    fs, io,
    path::{Path, PathBuf},
    process::Command,
};

use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub(crate) enum Error {
    #[error("failed to create Chromium profile directory")]
    CreateProfile(#[source] io::Error),
    #[error("failed to launch Chromium")]
    Launch(#[source] io::Error),
}

pub(crate) struct ProfileDirectory(PathBuf);

impl Drop for ProfileDirectory {
    fn drop(&mut self) {
        // The directory is only for this invocation. Ignore cleanup failures, such as a
        // Chromium process that was intentionally left open after the kernel exits.
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub(crate) fn launch(executable: &Path, address: &str) -> Result<ProfileDirectory, Error> {
    let profile = ProfileDirectory(
        std::env::temp_dir().join(format!("cloudready-chromium-{}", Uuid::new_v4())),
    );
    fs::create_dir(&profile.0).map_err(Error::CreateProfile)?;

    Command::new(executable)
        .arg(format!("--app=http://{address}"))
        .arg(format!("--user-data-dir={}", profile.0.display()))
        .args([
            "--incognito",
            "--new-window",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-session-crashed-bubble",
            "--disable-features=Translate,MediaRouter",
        ])
        .spawn()
        .map_err(Error::Launch)?;

    Ok(profile)
}
