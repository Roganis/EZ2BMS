use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum LaunchError {
    #[error("{path}: {source}")]
    Io { path: PathBuf, source: std::io::Error },
    #[error("{0} is not EZ2PORT's ez2play (none of its options are in it)")]
    NotEz2play(PathBuf),
    #[error("this ez2play cannot {0}; update EZ2PORT")]
    Unsupported(&'static str),
    #[error("{0}")]
    Invalid(String),
}

pub type Result<T> = std::result::Result<T, LaunchError>;

pub(crate) fn io(path: impl Into<PathBuf>) -> impl FnOnce(std::io::Error) -> LaunchError {
    let path = path.into();
    move |source| LaunchError::Io { path, source }
}
