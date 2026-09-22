//! File access for the editor: whole-file reads, atomic writes with a backup
//! of the previous version, directory listings and project scans.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::error::{CmdError, CmdResult};

/// Audio the editor can use as keysounds (what the audio crate decodes).
pub const AUDIO_EXTS: [&str; 7] = ["wav", "ogg", "flac", "mp3", "ssf", "ezw", "oga"];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    /// Milliseconds since the Unix epoch (0 when unknown).
    pub modified_ms: u64,
}

fn entry(path: &Path, name: String) -> CmdResult<Entry> {
    let m = std::fs::metadata(path).map_err(|e| CmdError::io(path, e))?;
    Ok(Entry {
        name,
        is_dir: m.is_dir(),
        size: m.len(),
        modified_ms: m
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as u64),
    })
}

pub fn read(path: &Path) -> CmdResult<Vec<u8>> {
    std::fs::read(path).map_err(|e| CmdError::io(path, e))
}

/// Write `bytes` to `path` so that a crash leaves either the old file or the
/// new one, never half of either: write a temporary file beside it, flush it
/// to disk, then rename it over. With `backup`, the previous version is kept
/// as `<name>.bak`.
pub fn write_atomic(path: &Path, bytes: &[u8], backup: bool) -> CmdResult<()> {
    use std::io::Write;
    let dir = path.parent().filter(|d| !d.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let name = path
        .file_name()
        .ok_or_else(|| CmdError::Invalid(format!("not a file path: {}", path.display())))?
        .to_string_lossy()
        .into_owned();
    std::fs::create_dir_all(dir).map_err(|e| CmdError::io(dir, e))?;
    let tmp = dir.join(format!(".{name}.ez2bms-tmp"));
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| CmdError::io(&tmp, e))?;
        f.write_all(bytes).map_err(|e| CmdError::io(&tmp, e))?;
        f.sync_all().map_err(|e| CmdError::io(&tmp, e))?;
    }
    if backup && path.exists() {
        let bak = dir.join(format!("{name}.bak"));
        std::fs::copy(path, &bak).map_err(|e| CmdError::io(&bak, e))?;
    }
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        CmdError::io(path, e)
    })
}

pub fn list(dir: &Path) -> CmdResult<Vec<Entry>> {
    let mut out = Vec::new();
    for e in std::fs::read_dir(dir).map_err(|e| CmdError::io(dir, e))?.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if let Ok(en) = entry(&e.path(), name) {
            out.push(en);
        }
    }
    out.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProjectScan {
    pub dir: PathBuf,
    /// One chart per bmson.
    pub charts: Vec<Entry>,
    /// `ez2bms.song.json`, when present.
    pub sidecar: Option<Entry>,
    /// Audio files, as paths relative to the project (subfolders included,
    /// forward slashes, as bmson names them).
    pub samples: Vec<String>,
    /// Images (jackets, BGA stills).
    pub images: Vec<String>,
}

pub const SIDECAR: &str = "ez2bms.song.json";
const MAX_SCAN: usize = 20_000;

pub fn scan_project(dir: &Path) -> CmdResult<ProjectScan> {
    let mut scan = ProjectScan {
        dir: dir.to_path_buf(),
        charts: Vec::new(),
        sidecar: None,
        samples: Vec::new(),
        images: Vec::new(),
    };
    for e in list(dir)? {
        let lower = e.name.to_lowercase();
        if !e.is_dir && lower.ends_with(".bmson") {
            scan.charts.push(e);
        } else if !e.is_dir && e.name == SIDECAR {
            scan.sidecar = Some(e);
        }
    }
    // Samples may sit in subfolders; walk them breadth-first, bounded.
    let mut queue = vec![(dir.to_path_buf(), String::new())];
    let mut seen = 0;
    while let Some((d, prefix)) = queue.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            seen += 1;
            if seen > MAX_SCAN {
                break;
            }
            let name = e.file_name().to_string_lossy().into_owned();
            let rel = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                if !name.starts_with('.') {
                    queue.push((e.path(), rel));
                }
                continue;
            }
            let ext =
                name.rsplit_once('.').map(|(_, x)| x.to_ascii_lowercase()).unwrap_or_default();
            if AUDIO_EXTS.contains(&ext.as_str()) {
                scan.samples.push(rel);
            } else if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "bmp") {
                scan.images.push(rel);
            }
        }
    }
    scan.samples.sort();
    scan.images.sort();
    Ok(scan)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ez2bms-app {name} {}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn atomic_write_replaces_and_keeps_a_backup() {
        let d = scratch("write");
        let p = d.join("chart one.bmson");
        write_atomic(&p, b"v1", true).unwrap();
        assert!(!d.join("chart one.bmson.bak").exists(), "nothing to back up yet");
        write_atomic(&p, b"v2", true).unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"v2");
        assert_eq!(std::fs::read(d.join("chart one.bmson.bak")).unwrap(), b"v1");
        write_atomic(&p, b"v3", false).unwrap();
        assert_eq!(std::fs::read(d.join("chart one.bmson.bak")).unwrap(), b"v1");
        let names: Vec<_> = list(&d).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["chart one.bmson", "chart one.bmson.bak"], "no temporary left");
        write_atomic(&d.join("new/sub/x.json"), b"{}", true).unwrap();
        assert!(d.join("new/sub/x.json").is_file());
    }

    #[test]
    fn a_project_scan_finds_charts_the_sidecar_and_samples_in_subfolders() {
        let d = scratch("scan");
        for f in [
            "streetmix1p-abc.bmson",
            "7streetmix1p-abc-hd.BMSON",
            SIDECAR,
            "notes.txt",
            "kick.WAV",
            "jacket.png",
        ] {
            std::fs::write(d.join(f), b"").unwrap();
        }
        std::fs::create_dir_all(d.join("stems/drums")).unwrap();
        std::fs::create_dir_all(d.join(".cache")).unwrap();
        std::fs::write(d.join("stems/drums/snare.ogg"), b"").unwrap();
        std::fs::write(d.join(".cache/junk.wav"), b"").unwrap();
        let s = scan_project(&d).unwrap();
        let charts: Vec<_> = s.charts.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(charts, ["7streetmix1p-abc-hd.BMSON", "streetmix1p-abc.bmson"]);
        assert!(s.sidecar.is_some());
        assert_eq!(s.samples, ["kick.WAV", "stems/drums/snare.ogg"]);
        assert_eq!(s.images, ["jacket.png"]);
    }
}
