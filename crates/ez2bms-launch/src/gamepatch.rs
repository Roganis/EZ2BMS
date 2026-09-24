//! Writing into a game folder - a cabinet export (M6) - all or nothing, with
//! a way back.
//!
//! A cabinet export replaces some of a shipped song's files (its charts, a
//! song table) and adds others (keysounds, a new tier). Unlike a package,
//! the folder cannot be swapped whole: other charts and other songs use the
//! rest of it. So each file is handled on its own, in four steps:
//!
//! 1. Check: every path stays inside the root and out of dot-folders; every
//!    file is what the caller saw when it planned (`expect`: absent, or these
//!    exact bytes by FNV-1a), and every file it relies on without writing is
//!    still there unchanged (`keep`). Any mismatch refuses before anything is
//!    touched - the plan would be stale.
//! 2. Stage every new file in `<root>/.ez2bms-staging/<stamp>/`, on the same
//!    disk so the last step is a rename, and flush it.
//! 3. Copy every file about to be replaced into `<root>/.ez2bms-backup/<stamp>/`
//!    and write the manifest there - what was replaced or created, its bytes'
//!    size and hash before and after - before anything in the game changes.
//! 4. Rename the staged files into place. On any failure, what was renamed is
//!    put back from the backup (created files removed), and the backup and
//!    stage are removed: the game is as it was.
//!
//! Paths are matched in any case, as the game and EZ2PORT match them
//! (`sound/DirtyD` for `dirtyd`): a file that is there is replaced under its
//! own name. `restore` undoes an export from its manifest, file by file, only
//! where the file is still what the export wrote; anything changed since is
//! reported as a conflict and left alone unless forced. Neither the game nor
//! EZ2PORT reads dot-folders at the root.
//!
//! `write_tree` is the other destination: a new folder shaped like the game,
//! to copy onto a cabinet by hand.

use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::{io, LaunchError, Result};
use crate::package::{child_ci, BACKUP};

const STAGING: &str = ".ez2bms-staging";
const MANIFEST: &str = "manifest.json";

/// 64-bit FNV-1a, as chart-core's `fnv1a64Hex` computes it.
pub fn fnv1a64(b: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &x in b {
        h ^= x as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

pub fn fnv_hex(h: u64) -> String {
    format!("{h:016x}")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Content {
    Bytes(Vec<u8>),
    /// A file copied in by path (a keysound made on disk, a large file).
    Copy(PathBuf),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Expect {
    Any,
    Absent,
    /// There, with these bytes.
    Fnv(u64),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PatchEntry {
    /// Root-relative, forward slashes.
    pub rel: String,
    pub content: Content,
    pub expect: Expect,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PatchSpec {
    /// The backup's folder name: letters, digits, `-` and `_`.
    pub stamp: String,
    /// What the export was, for the list of backups.
    pub label: String,
    pub entries: Vec<PatchEntry>,
    /// Files the export relies on without writing (keysounds it reuses), with their bytes' hash.
    pub keep: Vec<(String, u64)>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct PatchReport {
    pub stamp: String,
    /// Root-relative, as on disk.
    pub created: Vec<String>,
    pub replaced: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct RestoreReport {
    pub restored: Vec<String>,
    pub removed: Vec<String>,
    /// Changed since the export: left alone.
    pub conflicts: Vec<String>,
    /// Already as they were before the export.
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackupInfo {
    pub stamp: String,
    pub label: String,
    pub created_ms: u64,
    /// "applying" (interrupted), "applied" or "restored".
    pub state: String,
    pub files: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
struct Sum {
    size: u64,
    fnv: u64,
}

impl Sum {
    fn of(b: &[u8]) -> Sum {
        Sum { size: b.len() as u64, fnv: fnv1a64(b) }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ManifestFile {
    path: String,
    /// "replaced" or "created".
    action: String,
    before: Option<Sum>,
    after: Sum,
    /// The copy of the file before, relative to the backup folder.
    backup: Option<String>,
    readonly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Manifest {
    ez2bms: u32,
    stamp: String,
    label: String,
    created_ms: u64,
    state: String,
    files: Vec<ManifestFile>,
    /// Folders the export made, outermost first.
    dirs: Vec<String>,
}

fn invalid(msg: impl Into<String>) -> LaunchError {
    LaunchError::Invalid(msg.into())
}

/// A root-relative path's parts: no root, no `..`, nothing hidden.
fn parts(rel: &str) -> Result<Vec<String>> {
    let p = Path::new(rel);
    let mut out = Vec::new();
    for c in p.components() {
        match c {
            Component::Normal(s) => {
                let s = s.to_string_lossy();
                if s.starts_with('.') {
                    return Err(invalid(format!("{rel}: a dot-folder or hidden file")));
                }
                out.push(s.into_owned());
            }
            _ => return Err(invalid(format!("{rel}: not a path inside the game folder"))),
        }
    }
    if out.is_empty() || rel.contains('\\') {
        return Err(invalid(format!("{rel}: not a path inside the game folder")));
    }
    Ok(out)
}

/// `rel` under `root`, each part matched as it is on disk (the exact name
/// first, then any case); parts that do not exist yet are taken as given.
/// Returns the path and whether it exists (as a file).
pub fn resolve_ci(root: &Path, rel: &str) -> Result<(PathBuf, bool)> {
    let mut p = root.to_path_buf();
    let mut found = true;
    for part in parts(rel)? {
        if found {
            if let Some(hit) = child_ci(&p, &part) {
                p = hit;
                continue;
            }
            found = false;
        }
        p.push(part);
    }
    Ok((p.clone(), found && p.is_file()))
}

fn rel_of(root: &Path, p: &Path) -> String {
    p.strip_prefix(root)
        .unwrap_or(p)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Write a file and flush it to the disk.
fn write_synced(p: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(io(d))?;
    }
    let mut f = std::fs::File::create(p).map_err(io(p))?;
    f.write_all(bytes).map_err(io(p))?;
    f.sync_all().map_err(io(p))
}

/// Write via a temporary file and a rename, so the file is never half written.
fn replace_synced(p: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = p.with_extension("ez2bms-tmp");
    write_synced(&tmp, bytes)?;
    std::fs::rename(&tmp, p).map_err(io(p))
}

fn set_readonly(p: &Path, ro: bool) -> Result<()> {
    let mut perm = std::fs::metadata(p).map_err(io(p))?.permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    perm.set_readonly(ro);
    std::fs::set_permissions(p, perm).map_err(io(p))
}

fn valid_stamp(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 80
        && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn read_manifest(dir: &Path) -> Result<Manifest> {
    let p = dir.join(MANIFEST);
    let text = std::fs::read(&p).map_err(io(&p))?;
    serde_json::from_slice(&text).map_err(|e| invalid(format!("{}: {e}", p.display())))
}

fn write_manifest(dir: &Path, m: &Manifest) -> Result<()> {
    let text = serde_json::to_vec_pretty(m).map_err(|e| invalid(e.to_string()))?;
    replace_synced(&dir.join(MANIFEST), &text)
}

/// Apply an export to the game folder at `root`. `progress(done, total)` is
/// called as files are staged and moved.
pub fn apply(
    root: &Path,
    spec: &PatchSpec,
    progress: &mut dyn FnMut(usize, usize),
) -> Result<PatchReport> {
    if !valid_stamp(&spec.stamp) {
        return Err(invalid(format!("a backup name of letters and digits, not {:?}", spec.stamp)));
    }
    if !root.is_dir() {
        return Err(LaunchError::NotAFolder(root.to_path_buf()));
    }
    let backup = root.join(BACKUP).join(&spec.stamp);
    if backup.exists() {
        return Err(LaunchError::BackupExists(spec.stamp.clone()));
    }

    // 1. Check.
    let mut targets: Vec<(PathBuf, bool)> = Vec::with_capacity(spec.entries.len());
    let mut seen = std::collections::HashSet::new();
    for e in &spec.entries {
        let (p, exists) = resolve_ci(root, &e.rel)?;
        if !seen.insert(rel_of(root, &p).to_lowercase()) {
            return Err(invalid(format!("{} is written twice", e.rel)));
        }
        let ok = match e.expect {
            Expect::Any => true,
            Expect::Absent => !exists,
            Expect::Fnv(h) => exists && fnv1a64(&std::fs::read(&p).map_err(io(&p))?) == h,
        };
        if !ok {
            return Err(LaunchError::Stale(e.rel.clone()));
        }
        targets.push((p, exists));
    }
    for (rel, h) in &spec.keep {
        let (p, exists) = resolve_ci(root, rel)?;
        if !exists || fnv1a64(&std::fs::read(&p).map_err(io(&p))?) != *h {
            return Err(LaunchError::Stale(rel.clone()));
        }
    }
    let total = spec.entries.len() * 2;
    let mut done = 0;

    // 2. Stage.
    let stage = root.join(STAGING).join(&spec.stamp);
    let _ = std::fs::remove_dir_all(&stage);
    let staged = (|| -> Result<Vec<(PathBuf, Sum)>> {
        let mut out = Vec::with_capacity(spec.entries.len());
        for (i, e) in spec.entries.iter().enumerate() {
            let s = stage.join(i.to_string());
            let bytes = match &e.content {
                Content::Bytes(b) => b.clone(),
                Content::Copy(from) => std::fs::read(from).map_err(io(from))?,
            };
            write_synced(&s, &bytes)?;
            out.push((s, Sum::of(&bytes)));
            done += 1;
            progress(done, total);
        }
        Ok(out)
    })();
    let staged = match staged {
        Ok(s) => s,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&stage);
            return Err(e);
        }
    };

    // 3. Back up, and write the manifest before the game changes.
    let mut manifest = Manifest {
        ez2bms: 1,
        stamp: spec.stamp.clone(),
        label: spec.label.clone(),
        created_ms: now_ms(),
        state: "applying".into(),
        files: Vec::new(),
        dirs: Vec::new(),
    };
    let prepared = (|| -> Result<()> {
        for (i, (p, exists)) in targets.iter().enumerate() {
            let rel = rel_of(root, p);
            if *exists {
                let bytes = std::fs::read(p).map_err(io(p))?;
                let readonly = std::fs::metadata(p).map_err(io(p))?.permissions().readonly();
                write_synced(&backup.join("files").join(&rel), &bytes)?;
                manifest.files.push(ManifestFile {
                    path: rel.clone(),
                    action: "replaced".into(),
                    before: Some(Sum::of(&bytes)),
                    after: staged[i].1,
                    backup: Some(format!("files/{rel}")),
                    readonly,
                });
            } else {
                manifest.files.push(ManifestFile {
                    path: rel,
                    action: "created".into(),
                    before: None,
                    after: staged[i].1,
                    backup: None,
                    readonly: false,
                });
            }
        }
        // The folders it will make, outermost first.
        for (p, _) in &targets {
            let mut missing = Vec::new();
            let mut d = p.parent();
            while let Some(dir) = d {
                if dir == root || dir.exists() {
                    break;
                }
                missing.push(rel_of(root, dir));
                d = dir.parent();
            }
            for m in missing.into_iter().rev() {
                if !manifest.dirs.contains(&m) {
                    manifest.dirs.push(m);
                }
            }
        }
        std::fs::create_dir_all(&backup).map_err(io(&backup))?;
        write_manifest(&backup, &manifest)
    })();
    if let Err(e) = prepared {
        let _ = std::fs::remove_dir_all(&stage);
        let _ = std::fs::remove_dir_all(&backup);
        return Err(e);
    }

    // 4. Into place; on failure, back out what was done.
    let mut moved = 0usize;
    let result = (|| -> Result<()> {
        for (i, (p, _)) in targets.iter().enumerate() {
            if let Some(d) = p.parent() {
                std::fs::create_dir_all(d).map_err(io(d))?;
            }
            if manifest.files[i].readonly {
                set_readonly(p, false)?;
            }
            std::fs::rename(&staged[i].0, p).map_err(io(p))?;
            moved += 1;
            done += 1;
            progress(done, total);
        }
        Ok(())
    })();
    if let Err(e) = result {
        for (i, (p, _)) in targets.iter().enumerate().take(moved + 1) {
            let f = &manifest.files[i];
            match &f.backup {
                Some(b) => {
                    if let Ok(bytes) = std::fs::read(backup.join(b)) {
                        let _ = replace_synced(p, &bytes);
                        if f.readonly {
                            let _ = set_readonly(p, true);
                        }
                    }
                }
                None if i < moved => {
                    let _ = std::fs::remove_file(p);
                }
                None => {}
            }
        }
        for d in manifest.dirs.iter().rev() {
            let _ = std::fs::remove_dir(root.join(d));
        }
        let _ = std::fs::remove_dir_all(&stage);
        let _ = std::fs::remove_dir_all(&backup);
        return Err(e);
    }
    for (i, (p, _)) in targets.iter().enumerate() {
        if manifest.files[i].readonly {
            let _ = set_readonly(p, true);
        }
    }
    manifest.state = "applied".into();
    write_manifest(&backup, &manifest)?;
    let _ = std::fs::remove_dir_all(&stage);
    let _ = std::fs::remove_dir(root.join(STAGING));
    let mut report = PatchReport { stamp: spec.stamp.clone(), ..Default::default() };
    for f in &manifest.files {
        if f.action == "replaced" {
            report.replaced.push(f.path.clone());
        } else {
            report.created.push(f.path.clone());
        }
    }
    Ok(report)
}

fn current(p: &Path) -> Option<Sum> {
    std::fs::read(p).ok().map(|b| Sum::of(&b))
}

/// Undo an export: every file it replaced put back, every file it created
/// removed - where the file is still what the export wrote. Files changed
/// since are conflicts: with any, nothing is done unless `force`.
pub fn restore(root: &Path, stamp: &str, force: bool) -> Result<RestoreReport> {
    if !valid_stamp(stamp) {
        return Err(LaunchError::NoBackup(stamp.to_string()));
    }
    let dir = root.join(BACKUP).join(stamp);
    let mut manifest = read_manifest(&dir)?;
    let mut report = RestoreReport::default();
    let mut todo: Vec<&ManifestFile> = Vec::new();
    for f in &manifest.files {
        let p = root.join(&f.path);
        let now = current(&p);
        if now == Some(f.after) || (force && now != f.before) {
            todo.push(f);
        } else if now == f.before {
            report.skipped.push(f.path.clone());
        } else {
            report.conflicts.push(f.path.clone());
        }
    }
    if !report.conflicts.is_empty() && !force {
        return Ok(report);
    }
    for f in todo {
        let p = root.join(&f.path);
        match &f.backup {
            Some(b) => {
                let src = dir.join(b);
                let bytes = std::fs::read(&src).map_err(io(&src))?;
                if p.exists() && std::fs::metadata(&p).map_err(io(&p))?.permissions().readonly() {
                    set_readonly(&p, false)?;
                }
                replace_synced(&p, &bytes)?;
                if f.readonly {
                    set_readonly(&p, true)?;
                }
                report.restored.push(f.path.clone());
            }
            None => {
                if p.exists() {
                    std::fs::remove_file(&p).map_err(io(&p))?;
                }
                report.removed.push(f.path.clone());
            }
        }
    }
    for d in manifest.dirs.iter().rev() {
        let _ = std::fs::remove_dir(root.join(d)); // only if empty
    }
    manifest.state = "restored".into();
    write_manifest(&dir, &manifest)?;
    Ok(report)
}

/// The exports whose backups are in the game folder, newest first.
pub fn backups(root: &Path) -> Result<Vec<BackupInfo>> {
    let dir = root.join(BACKUP);
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for e in rd.flatten() {
        let Ok(m) = read_manifest(&e.path()) else {
            continue; // a publish's package backup, or not ours
        };
        out.push(BackupInfo {
            stamp: m.stamp,
            label: m.label,
            created_ms: m.created_ms,
            state: m.state,
            files: m.files.len(),
        });
    }
    out.sort_by(|a, b| b.created_ms.cmp(&a.created_ms).then_with(|| b.stamp.cmp(&a.stamp)));
    Ok(out)
}

/// Write a new folder shaped like the game (to copy onto a cabinet by hand):
/// `dest` must not exist or be empty; everything is staged beside it and
/// renamed into place at the end.
pub fn write_tree(
    dest: &Path,
    entries: &[(String, Content)],
    progress: &mut dyn FnMut(usize, usize),
) -> Result<PathBuf> {
    if dest.exists() {
        let empty = std::fs::read_dir(dest).map_err(io(dest))?.next().is_none();
        if !dest.is_dir() || !empty {
            return Err(LaunchError::NotEmpty(dest.to_path_buf()));
        }
    }
    for (rel, _) in entries {
        parts(rel)?;
    }
    let parent = dest.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    std::fs::create_dir_all(parent).map_err(io(parent))?;
    let name = dest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let stage = parent.join(format!(".{name}.ez2bms-export-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&stage);
    let written = (|| -> Result<()> {
        for (i, (rel, content)) in entries.iter().enumerate() {
            let p = stage.join(rel);
            match content {
                Content::Bytes(b) => write_synced(&p, b)?,
                Content::Copy(from) => {
                    let b = std::fs::read(from).map_err(io(from))?;
                    write_synced(&p, &b)?;
                }
            }
            progress(i + 1, entries.len());
        }
        Ok(())
    })();
    if let Err(e) = written {
        let _ = std::fs::remove_dir_all(&stage);
        return Err(e);
    }
    if dest.exists() {
        std::fs::remove_dir(dest).map_err(io(dest))?;
    }
    if let Err(e) = std::fs::rename(&stage, dest) {
        let _ = std::fs::remove_dir_all(&stage);
        return Err(io(dest)(e));
    }
    Ok(dest.to_path_buf())
}
