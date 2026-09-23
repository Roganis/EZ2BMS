//! File access for the editor: whole-file reads, atomic writes with a backup
//! of the previous version, directory listings and project scans.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::error::{CmdError, CmdResult};

/// Audio the editor can use as keysounds (what the audio crate decodes).
pub const AUDIO_EXTS: [&str; 7] = ["wav", "ogg", "flac", "mp3", "ssf", "ezw", "oga"];
/// Images the song art is cut from (what ez2bms-media decodes).
pub const IMAGE_EXTS: [&str; 4] = ["png", "jpg", "jpeg", "bmp"];

/// What an import is for; other files offered with it are refused.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportKind {
    #[default]
    Audio,
    Image,
}

impl ImportKind {
    fn accepts(self, p: &Path) -> bool {
        let exts: &[&str] = match self {
            ImportKind::Audio => &AUDIO_EXTS,
            ImportKind::Image => &IMAGE_EXTS,
        };
        p.extension()
            .map(|x| x.to_string_lossy().to_ascii_lowercase())
            .is_some_and(|x| exts.contains(&x.as_str()))
    }

    fn refusal(self) -> &'static str {
        match self {
            ImportKind::Audio => "not an audio file EZ2BMS can play",
            ImportKind::Image => "not an image EZ2BMS can read (PNG, JPEG or BMP)",
        }
    }
}

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
            } else if IMAGE_EXTS.contains(&ext.as_str()) {
                scan.images.push(rel);
            }
        }
    }
    scan.samples.sort();
    scan.images.sort();
    Ok(scan)
}

/// One file offered for import, and what became of it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Imported {
    pub from: String,
    /// Its name in the song folder (relative, forward slashes), when imported.
    pub name: Option<String>,
    /// The folder already had it (the same file, or the same bytes under that name).
    pub reused: bool,
    pub error: Option<String>,
}

/// The files among `paths`, folders walked (hidden ones skipped), in order.
fn offered_files(paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for p in paths {
        if p.is_dir() {
            let mut inner: Vec<PathBuf> = std::fs::read_dir(p)
                .map(|rd| {
                    rd.flatten()
                        .map(|e| e.path())
                        .filter(|q| {
                            !q.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.'))
                        })
                        .collect()
                })
                .unwrap_or_default();
            inner.sort();
            out.extend(offered_files(&inner));
        } else {
            out.push(p.clone());
        }
    }
    out
}

/// Copy sound files (or images; and those inside folders) into the song
/// folder, flat. A file already inside the folder keeps its place; a name the
/// folder already has is reused when the bytes are the same and otherwise
/// becomes `name (2).ext`; each copy is written beside its target and renamed
/// into place, so a failure never leaves half a file.
pub fn copy_into(dir: &Path, paths: &[PathBuf], kind: ImportKind) -> Vec<Imported> {
    let root = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    offered_files(paths)
        .into_iter()
        .map(|src| {
            let from = src.to_string_lossy().into_owned();
            let fail = |e: String| Imported {
                from: from.clone(),
                name: None,
                reused: false,
                error: Some(e),
            };
            if !kind.accepts(&src) {
                return fail(kind.refusal().into());
            }
            let real = src.canonicalize().unwrap_or_else(|_| src.clone());
            if let Ok(rel) = real.strip_prefix(&root) {
                let name = rel.to_string_lossy().replace('\\', "/");
                return Imported { from, name: Some(name), reused: true, error: None };
            }
            let bytes = match std::fs::read(&src) {
                Ok(b) => b,
                Err(e) => return fail(e.to_string()),
            };
            let file =
                src.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let (stem, ext) = match file.rsplit_once('.') {
                Some((s, x)) => (s.to_string(), format!(".{x}")),
                None => (file.clone(), String::new()),
            };
            for n in 1.. {
                let name = if n == 1 { file.clone() } else { format!("{stem} ({n}){ext}") };
                let target = dir.join(&name);
                match std::fs::read(&target) {
                    Ok(existing) if existing == bytes => {
                        return Imported { from, name: Some(name), reused: true, error: None };
                    }
                    Ok(_) => continue,
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(e) => return fail(e.to_string()),
                }
                // A case-insensitive disk would call a differently-cased name the same file.
                if list(dir).is_ok_and(|l| l.iter().any(|x| x.name.eq_ignore_ascii_case(&name))) {
                    continue;
                }
                return match write_atomic(&target, &bytes, false) {
                    Ok(()) => Imported { from, name: Some(name), reused: false, error: None },
                    Err(e) => fail(e.to_string()),
                };
            }
            unreachable!()
        })
        .collect()
}

/// Rename a file, never over another one. A change of case only goes through
/// a temporary name (a case-insensitive disk would otherwise refuse or do
/// nothing).
pub fn rename(from: &Path, to: &Path) -> CmdResult<()> {
    if !from.is_file() {
        return Err(CmdError::Invalid(format!("{} is not a file", from.display())));
    }
    let same_but_case =
        from.to_string_lossy().to_lowercase() == to.to_string_lossy().to_lowercase();
    if !same_but_case && to.exists() {
        return Err(CmdError::Invalid(format!("{} already exists", to.display())));
    }
    if let Some(parent) = to.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent).map_err(|e| CmdError::io(parent, e))?;
    }
    if same_but_case {
        let tmp = from.with_file_name(format!(
            ".{}.ez2bms-rename",
            from.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
        ));
        std::fs::rename(from, &tmp).map_err(|e| CmdError::io(from, e))?;
        return std::fs::rename(&tmp, to).map_err(|e| {
            let _ = std::fs::rename(&tmp, from);
            CmdError::io(to, e)
        });
    }
    std::fs::rename(from, to).map_err(|e| CmdError::io(from, e))
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

    #[test]
    fn imports_copy_flat_reuse_what_is_there_and_never_overwrite() {
        let song = scratch("import-song");
        let outside = scratch("import-src");
        std::fs::create_dir_all(outside.join("kit/.hidden")).unwrap();
        std::fs::write(outside.join("kick.wav"), b"kick").unwrap();
        std::fs::write(outside.join("kit/snare.ogg"), b"snare").unwrap();
        std::fs::write(outside.join("kit/.hidden/x.wav"), b"x").unwrap();
        std::fs::write(outside.join("notes.txt"), b"no").unwrap();
        std::fs::write(song.join("snare.ogg"), b"snare").unwrap();
        std::fs::write(song.join("kick.wav"), b"another kick").unwrap();
        std::fs::create_dir_all(song.join("stems")).unwrap();
        std::fs::write(song.join("stems/pad.wav"), b"pad").unwrap();
        let got = copy_into(
            &song,
            &[
                outside.join("kick.wav"),
                outside.join("kit"),
                outside.join("notes.txt"),
                song.join("stems/pad.wav"),
            ],
            ImportKind::Audio,
        );
        let names: Vec<_> = got.iter().map(|i| (i.name.clone(), i.reused)).collect();
        assert_eq!(
            names,
            vec![
                (Some("kick (2).wav".into()), false),
                (Some("snare.ogg".into()), true),
                (None, false),
                (Some("stems/pad.wav".into()), true),
            ]
        );
        assert_eq!(std::fs::read(song.join("kick (2).wav")).unwrap(), b"kick");
        assert_eq!(std::fs::read(song.join("kick.wav")).unwrap(), b"another kick");
        assert!(got[2].error.is_some());
        // Importing the same file again reuses the copy.
        let again = copy_into(&song, &[outside.join("kick.wav")], ImportKind::Audio);
        assert_eq!(again[0].name.as_deref(), Some("kick (2).wav"));
        assert!(again[0].reused);
    }

    #[test]
    fn an_image_import_takes_images_only() {
        let song = scratch("import-art-song");
        let outside = scratch("import-art-src");
        std::fs::write(outside.join("Jacket.JPG"), b"jpeg").unwrap();
        std::fs::write(outside.join("kick.wav"), b"kick").unwrap();
        let got = copy_into(
            &song,
            &[outside.join("Jacket.JPG"), outside.join("kick.wav")],
            ImportKind::Image,
        );
        assert_eq!(got[0].name.as_deref(), Some("Jacket.JPG"));
        assert_eq!(got[1].name, None);
        assert!(got[1].error.as_deref().is_some_and(|e| e.contains("not an image")));
        assert_eq!(std::fs::read(song.join("Jacket.JPG")).unwrap(), b"jpeg");
    }

    #[test]
    fn renames_never_overwrite_and_handle_a_change_of_case() {
        let d = scratch("rename");
        std::fs::write(d.join("a.wav"), b"a").unwrap();
        std::fs::write(d.join("b.wav"), b"b").unwrap();
        assert!(rename(&d.join("a.wav"), &d.join("b.wav")).is_err());
        assert_eq!(std::fs::read(d.join("b.wav")).unwrap(), b"b");
        rename(&d.join("a.wav"), &d.join("drums/A.wav")).unwrap();
        assert_eq!(std::fs::read(d.join("drums/A.wav")).unwrap(), b"a");
        rename(&d.join("drums/A.wav"), &d.join("drums/a.wav")).unwrap();
        let names: Vec<_> = list(&d.join("drums")).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, vec!["a.wav"]);
        assert!(rename(&d.join("missing.wav"), &d.join("x.wav")).is_err());
    }
}
