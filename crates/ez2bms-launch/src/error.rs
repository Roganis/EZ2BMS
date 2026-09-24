use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum LaunchError {
    #[error("{path}: {source}")]
    Io { path: PathBuf, source: std::io::Error },
    #[error("{0} is not EZ2PORT's ez2play (none of its options are in it)")]
    NotEz2play(PathBuf),
    #[error("this ez2play cannot {0}; update EZ2PORT")]
    Unsupported(&'static str),
    /// A folder that is not what the caller inspected (another program, or
    /// another EZ2BMS, changed it in between).
    #[error("{0} changed since it was checked: look again")]
    Changed(PathBuf),
    /// A game file an export replaces or keeps has changed since it was planned.
    #[error("{0} is not what it was when the export was planned: plan it again")]
    Stale(String),
    #[error("{0} is not empty")]
    NotEmpty(PathBuf),
    #[error("{0} is not a folder")]
    NotAFolder(PathBuf),
    #[error("no backup named {0:?}")]
    NoBackup(String),
    #[error("a backup named {0} is already there")]
    BackupExists(String),
    /// What only a bug in the caller can cause: said in English only.
    #[error("{0}")]
    Invalid(String),
}

pub type Result<T> = std::result::Result<T, LaunchError>;

pub(crate) fn io(path: impl Into<PathBuf>) -> impl FnOnce(std::io::Error) -> LaunchError {
    let path = path.into();
    move |source| LaunchError::Io { path, source }
}
