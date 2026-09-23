//! Errors a command returns: the front end gets the message as a string.

#[derive(Debug, thiserror::Error)]
pub enum CmdError {
    #[error("{0}")]
    Io(String),
    #[error(transparent)]
    Audio(#[from] ez2bms_audio::AudioError),
    #[error(transparent)]
    Launch(#[from] ez2bms_launch::LaunchError),
    #[error(transparent)]
    Media(#[from] ez2bms_media::MediaError),
    #[error("{0}")]
    Invalid(String),
}

impl CmdError {
    pub fn io(path: &std::path::Path, e: std::io::Error) -> Self {
        CmdError::Io(format!("{}: {e}", path.display()))
    }
}

impl serde::Serialize for CmdError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type CmdResult<T> = Result<T, CmdError>;
