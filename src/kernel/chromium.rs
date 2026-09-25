use std::{
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
    process::Command,
};

use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub(crate) enum Error {
    #[error("expected --chromium=<path>, got {0:?}")]
    InvalidArgument(OsString),
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

pub(crate) fn executable_from_args(
    args: impl IntoIterator<Item = OsString>,
) -> Result<Option<PathBuf>, Error> {
    let mut chromium = None;
    for argument in args {
        let argument_text = argument.to_string_lossy();
        let Some(path) = argument_text.strip_prefix("--chromium=") else {
            return Err(Error::InvalidArgument(argument));
        };
        if chromium.replace(PathBuf::from(path)).is_some() {
            return Err(Error::InvalidArgument(OsString::from(
                "--chromium may only be specified once",
            )));
        }
    }
    Ok(chromium)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_chromium_executable() {
        let executable = executable_from_args([OsString::from(
            "--chromium=C:\\Program Files\\Chrome\\chrome.exe",
        )])
        .expect("argument should parse");
        assert_eq!(
            executable,
            Some(PathBuf::from("C:\\Program Files\\Chrome\\chrome.exe"))
        );
    }

    #[test]
    fn rejects_unrelated_arguments() {
        assert!(matches!(
            executable_from_args([OsString::from("--other")]),
            Err(Error::InvalidArgument(_))
        ));
    }
}
