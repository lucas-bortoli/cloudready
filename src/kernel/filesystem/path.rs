//! Validation for logical filesystem paths, independent of host path semantics.
use super::{Error, Result};
pub(super) fn parts(path: &str) -> Result<Vec<&str>> {
    if !path.starts_with('/') || path.contains("//") {
        return Err(Error::Invalid);
    }
    // Logical paths are never host paths: reject traversal and ambiguous separators.
    let values: Vec<_> = path.split('/').filter(|s| !s.is_empty()).collect();
    if values
        .iter()
        .any(|v| v.is_empty() || *v == "." || *v == ".." || v.contains('\\') || v.contains('\0'))
    {
        return Err(Error::Invalid);
    }
    Ok(values)
}
