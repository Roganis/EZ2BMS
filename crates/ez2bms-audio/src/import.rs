//! Writing an imported song's folder: its charts and song file (text the
//! editor made), and its keysounds copied in - an EZ2AC `.ssf`/`.ezw`
//! becoming a `.wav` with its PCM untouched, so the song plays in any tool
//! and sounds exactly as it did in the game.
//!
//! All or nothing, like a publish: everything is written into a staging
//! folder beside the destination and renamed into place at the end, so a
//! failure (or a crash) never leaves half a song where the editor would open
//! it. A keysound that cannot be read is not a failure - the chart names it,
//! and the editor lists it as missing - but it is reported.

use std::path::{Component, Path, PathBuf};

use crate::error::{AudioError, Result};
use crate::{ssf, wav};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Convert {
    /// Copied as it is.
    Copy,
    /// An `.ssf`/`.ezw`: its PCM, as a `.wav`.
    Pcm,
}

#[derive(Debug, Clone)]
pub struct ImportCopy {
    pub from: PathBuf,
    /// Relative path in the new folder (forward slashes).
    pub to: String,
    pub convert: Convert,
}

#[derive(Debug, Clone, Default)]
pub struct ImportJob {
    /// Relative path -> bytes (the charts and the song file).
    pub files: Vec<(String, Vec<u8>)>,
    pub copies: Vec<ImportCopy>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportReport {
    pub dir: PathBuf,
    pub copied: usize,
    /// Keysounds that could not be copied: (target, why).
    pub failed: Vec<(String, String)>,
}

fn io(path: &Path) -> impl FnOnce(std::io::Error) -> AudioError + '_ {
    move |source| AudioError::Io { path: path.to_path_buf(), source }
}

/// A relative path that stays inside the folder: no root, no `..`.
fn inside(dir: &Path, rel: &str) -> Result<PathBuf> {
    let p = Path::new(rel);
    if rel.is_empty() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(AudioError::Io {
            path: p.to_path_buf(),
            source: std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "not a path inside the song folder",
            ),
        });
    }
    Ok(dir.join(p))
}

/// The bytes a keysound becomes.
pub fn converted(from: &Path, convert: Convert) -> Result<Vec<u8>> {
    let bytes = std::fs::read(from).map_err(io(from))?;
    Ok(match convert {
        Convert::Copy => bytes,
        Convert::Pcm => {
            let (h, pcm) = ssf::parse(&bytes)?;
            wav::wrap_pcm(h.bits, h.channels, h.rate, pcm)
        }
    })
}

/// Write the song into `dest`, which must not exist yet or be an empty
/// folder. `progress(done, total)` is called after each file.
pub fn import_song(
    dest: &Path,
    job: &ImportJob,
    progress: &mut dyn FnMut(usize, usize),
) -> Result<ImportReport> {
    let busy = |why: &str| AudioError::Io {
        path: dest.to_path_buf(),
        source: std::io::Error::new(std::io::ErrorKind::AlreadyExists, why.to_string()),
    };
    if dest.exists() {
        let empty = std::fs::read_dir(dest).map_err(io(dest))?.next().is_none();
        if !dest.is_dir() || !empty {
            return Err(busy("the folder for the new song is not empty"));
        }
    }
    let parent = dest.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    std::fs::create_dir_all(parent).map_err(io(parent))?;
    let name = dest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let stage = parent.join(format!(".{name}.ez2bms-import-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&stage);
    std::fs::create_dir_all(&stage).map_err(io(&stage))?;
    let result = (|| {
        let total = job.files.len() + job.copies.len();
        let mut done = 0;
        let write = |rel: &str, bytes: &[u8]| -> Result<()> {
            let p = inside(&stage, rel)?;
            if let Some(d) = p.parent() {
                std::fs::create_dir_all(d).map_err(io(d))?;
            }
            std::fs::write(&p, bytes).map_err(io(&p))
        };
        for (rel, bytes) in &job.files {
            write(rel, bytes)?;
            done += 1;
            progress(done, total);
        }
        let mut copied = 0;
        let mut failed = Vec::new();
        for c in &job.copies {
            inside(&stage, &c.to)?;
            match converted(&c.from, c.convert) {
                Ok(bytes) => {
                    write(&c.to, &bytes)?;
                    copied += 1;
                }
                Err(e) => failed.push((c.to.clone(), e.to_string())),
            }
            done += 1;
            progress(done, total);
        }
        Ok((copied, failed))
    })();
    let (copied, failed) = match result {
        Ok(r) => r,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&stage);
            return Err(e);
        }
    };
    if dest.exists() {
        std::fs::remove_dir(dest).map_err(io(dest))?;
    }
    if let Err(e) = std::fs::rename(&stage, dest) {
        let _ = std::fs::remove_dir_all(&stage);
        return Err(io(dest)(e));
    }
    Ok(ImportReport { dir: dest.to_path_buf(), copied, failed })
}
