use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("{path}: {source}")]
    Io { path: PathBuf, source: std::io::Error },
    #[error("cannot decode: {0}")]
    Decode(String),
    #[error("resampler: {0}")]
    Resample(String),
    #[error(".ssf: {0}")]
    Ssf(&'static str),
    #[error("schedule: {0}")]
    Schedule(String),
    #[error("audio device: {0}")]
    Device(String),
}

pub type Result<T> = std::result::Result<T, AudioError>;
