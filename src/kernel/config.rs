//! Process configuration resolved before starting the server.

use std::path::PathBuf;

/// Resolves the durable database path, creating an explicitly configured data directory.
///
/// # Errors
/// Returns an I/O error when the directory cannot be created or the executable cannot be found.
pub(crate) fn database_path() -> std::io::Result<PathBuf> {
    if let Some(path) = std::env::var_os("KERNEL_DATA_DIR") {
        std::fs::create_dir_all(&path)?;
        return Ok(PathBuf::from(path).join("cloudready.sqlite"));
    }
    Ok(std::env::current_exe()?
        .parent()
        .ok_or_else(|| std::io::Error::other("executable has no parent directory"))?
        .join("cloudready.sqlite"))
}
