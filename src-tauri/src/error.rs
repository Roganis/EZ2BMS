//! Errors a command returns. The editor gets `{kind, message, params}`:
//! `message` is the English (what the log keeps), and `kind` names the
//! sentence in the editor's catalog (`host.<kind>`, i18n/en/host.ts) with
//! `params` as its values, so the editor says it in the language chosen.
//! Kind `other` has no sentence of its own: the English is shown. That is
//! kept for what only a bug can cause, and for the OS's own error text (an
//! I/O error is its path and the OS's words, already in the OS's language).

use std::collections::BTreeMap;

use ez2bms_audio::AudioError;
use ez2bms_launch::LaunchError;
use ez2bms_media::MediaError;
use serde::ser::SerializeStruct;

#[derive(Debug, thiserror::Error)]
pub enum CmdError {
    #[error("{0}")]
    Io(String),
    #[error(transparent)]
    Audio(#[from] AudioError),
    #[error(transparent)]
    Launch(#[from] LaunchError),
    #[error(transparent)]
    Media(#[from] MediaError),
    #[error("{0}")]
    Invalid(String),
    /// A refusal the editor words itself (see `Coded`).
    #[error("{}", .0.message)]
    Coded(Coded),
}

/// An error with its kind and values, made where the host refuses something
/// a person can run into (a file that exists, a font that is missing).
#[derive(Debug, Clone)]
pub struct Coded {
    pub kind: &'static str,
    pub params: Vec<(&'static str, String)>,
    pub message: String,
}

impl CmdError {
    pub fn io(path: &std::path::Path, e: std::io::Error) -> Self {
        CmdError::Io(format!("{}: {e}", path.display()))
    }

    pub fn coded(kind: &'static str, params: &[(&'static str, String)], message: String) -> Self {
        CmdError::Coded(Coded { kind, params: params.to_vec(), message })
    }

    /// The catalog's name for this error, and the values its sentence takes.
    pub fn kind(&self) -> (&'static str, Vec<(&'static str, String)>) {
        let path = |p: &std::path::Path| ("path", p.display().to_string());
        match self {
            CmdError::Coded(c) => (c.kind, c.params.clone()),
            CmdError::Audio(AudioError::Decode(d)) => {
                ("cannot-decode", vec![("detail", d.clone())])
            }
            CmdError::Audio(AudioError::Device(d)) => ("audio-device", vec![("detail", d.clone())]),
            CmdError::Launch(LaunchError::NotEz2play(p)) => ("not-ez2play", vec![path(p)]),
            CmdError::Launch(LaunchError::Changed(p)) => ("changed", vec![path(p)]),
            CmdError::Launch(LaunchError::Stale(rel)) => ("stale", vec![("path", rel.clone())]),
            CmdError::Launch(LaunchError::NotEmpty(p)) => ("not-empty", vec![path(p)]),
            CmdError::Launch(LaunchError::NotAFolder(p)) => ("not-a-folder", vec![path(p)]),
            CmdError::Launch(LaunchError::NoBackup(s)) => ("no-backup", vec![("name", s.clone())]),
            CmdError::Launch(LaunchError::BackupExists(s)) => {
                ("backup-exists", vec![("name", s.clone())])
            }
            CmdError::Media(MediaError::Decode(d)) => ("not-an-image", vec![("detail", d.clone())]),
            CmdError::Media(MediaError::TooLarge { w, h, max }) => (
                "image-too-large",
                vec![("w", w.to_string()), ("h", h.to_string()), ("max", max.to_string())],
            ),
            _ => ("other", vec![]),
        }
    }
}

impl serde::Serialize for CmdError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let (kind, params) = self.kind();
        let params: BTreeMap<_, _> = params.into_iter().collect();
        let mut e = s.serialize_struct("CmdError", 3)?;
        e.serialize_field("kind", kind)?;
        e.serialize_field("message", &self.to_string())?;
        e.serialize_field("params", &params)?;
        e.end()
    }
}

pub type CmdResult<T> = Result<T, CmdError>;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn an_error_goes_to_the_editor_with_its_kind_values_and_english() {
        let e = CmdError::from(LaunchError::NotEmpty("/songs/out".into()));
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            json!({ "kind": "not-empty", "message": "/songs/out is not empty",
                    "params": { "path": "/songs/out" } })
        );
        let big = CmdError::from(MediaError::TooLarge { w: 9000, h: 10, max: 8192 });
        assert_eq!(
            serde_json::to_value(&big).unwrap()["params"],
            json!({ "w": "9000", "h": "10", "max": "8192" })
        );
        // A bug's refusal and the OS's own words: the English, as it is.
        let io = CmdError::io(std::path::Path::new("/x"), std::io::Error::other("denied"));
        assert_eq!(
            serde_json::to_value(&io).unwrap(),
            json!({ "kind": "other", "message": "/x: denied", "params": {} })
        );
        let coded =
            CmdError::coded("exists", &[("path", "b.wav".into())], "b.wav already exists".into());
        assert_eq!(serde_json::to_value(&coded).unwrap()["kind"], "exists");
    }
}
