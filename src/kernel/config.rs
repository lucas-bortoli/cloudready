//! Process configuration resolved before starting the server.

use std::{ffi::OsString, path::PathBuf};

use thiserror::Error;

#[derive(Debug, Error)]
pub(crate) enum Error {
    #[error("expected --chromium=<path> or --no-chromium, got {0:?}")]
    InvalidChromiumArgument(OsString),
    #[error("--chromium and --no-chromium may only be specified once")]
    RepeatedChromiumOption,
}

/// Resolves the durable database path, creating an explicitly configured data directory.
///
/// # Errors
/// Returns an I/O error when the directory cannot be created or the executable cannot be found.
pub(crate) fn database_path() -> std::io::Result<PathBuf> {
    if let Some(path) = std::env::var_os("CR_KERNEL_DATA_DIR") {
        std::fs::create_dir_all(&path)?;
        return Ok(PathBuf::from(path).join("storage.sqlite"));
    }
    Ok(std::env::current_exe()?
        .parent()
        .ok_or_else(|| std::io::Error::other("executable has no parent directory"))?
        .join("storage.sqlite"))
}

/// Resolves the Chromium executable from command-line arguments or the environment.
pub(crate) fn chromium_binary(
    args: impl IntoIterator<Item = OsString>,
) -> Result<Option<PathBuf>, Error> {
    chromium_binary_from(args, std::env::var_os("CR_CHROMIUM_BINARY"))
}

fn chromium_binary_from(
    args: impl IntoIterator<Item = OsString>,
    chromium_env: Option<OsString>,
) -> Result<Option<PathBuf>, Error> {
    let mut chromium: Option<Option<PathBuf>> = None;
    for argument in args {
        let argument_text = argument.to_string_lossy();
        let option = if argument_text == "--no-chromium" {
            None
        } else if let Some(path) = argument_text.strip_prefix("--chromium=") {
            Some(PathBuf::from(path))
        } else {
            return Err(Error::InvalidChromiumArgument(argument));
        };
        if chromium.replace(option).is_some() {
            return Err(Error::RepeatedChromiumOption);
        }
    }
    Ok(chromium.unwrap_or_else(|| chromium_env.map(PathBuf::from)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_chromium_executable_from_argument() {
        let executable = chromium_binary_from(
            [OsString::from(
                "--chromium=C:\\Program Files\\Chrome\\chrome.exe",
            )],
            None,
        )
        .expect("argument should parse");
        assert_eq!(
            executable,
            Some(PathBuf::from("C:\\Program Files\\Chrome\\chrome.exe"))
        );
    }

    #[test]
    fn reads_chromium_executable_from_environment() {
        let executable = chromium_binary_from([], Some(OsString::from("chromium")))
            .expect("environment value should be used");
        assert_eq!(executable, Some(PathBuf::from("chromium")));
    }

    #[test]
    fn command_line_path_overrides_environment() {
        let executable = chromium_binary_from(
            [OsString::from("--chromium=explicit-chromium")],
            Some(OsString::from("environment-chromium")),
        )
        .expect("argument should override the environment");
        assert_eq!(executable, Some(PathBuf::from("explicit-chromium")));
    }

    #[test]
    fn no_chromium_disables_environment_setting() {
        let executable = chromium_binary_from(
            [OsString::from("--no-chromium")],
            Some(OsString::from("environment-chromium")),
        )
        .expect("disable flag should override the environment");
        assert_eq!(executable, None);
    }

    #[test]
    fn rejects_unrelated_arguments() {
        assert!(matches!(
            chromium_binary_from([OsString::from("--other")], None),
            Err(Error::InvalidChromiumArgument(_))
        ));
    }

    #[test]
    fn rejects_repeated_chromium_options() {
        assert!(matches!(
            chromium_binary_from(
                [
                    OsString::from("--no-chromium"),
                    OsString::from("--chromium=browser")
                ],
                None,
            ),
            Err(Error::RepeatedChromiumOption)
        ));
    }
}
