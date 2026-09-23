//! Writing a song package into a songs root, all or nothing.
//!
//! The files are written into a staging folder inside the songs root (same
//! file system, so the final step is a rename), then swapped in for any older
//! copy. EZ2PORT never sees a half-written song. The staging folder holds no
//! `song.ini` at its top level, so EZ2PORT does not take it for a song if a
//! crash leaves it behind; the next write clears it.

use std::path::{Path, PathBuf};

use crate::error::{io, LaunchError, Result};

const STAGING: &str = ".ez2bms-staging";

/// EZ2PORT's rule for a song key (BMSON.md section 7): 1-15 lowercase letters
/// or digits. Same as chart-core's `isValidSongKey`.
pub fn is_valid_song_key(key: &str) -> bool {
    (1..=15).contains(&key.len())
        && key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

fn check_file_name(name: &str) -> Result<()> {
    let ok = !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', ':', '\0'])
        && !name.starts_with('.');
    if ok {
        Ok(())
    } else {
        Err(LaunchError::Invalid(format!("bad file name in a package: {name:?}")))
    }
}

/// Where a publish keeps the package it replaced (one copy per key). EZ2PORT
/// skips dot-folders (ez2/vfs.c), so it never lists these.
pub const BACKUP: &str = ".ez2bms-backup";

/// What a publish may assume about the songs root, and what it keeps.
#[derive(Debug, Clone, Default)]
pub struct WriteOptions {
    /// Files of the package now in place to copy into the new one: EZ2PORT
    /// keeps a song's ranking tables in its package folder (ez2/ranking.c),
    /// and the caller decides which are still valid.
    pub carry: Vec<String>,
    /// The song.ini the caller saw when it decided to write (`Some(None)`:
    /// there was no package). If the folder holds something else by now,
    /// nothing is written - the check the caller made would be stale.
    pub expect: Option<Option<Vec<u8>>>,
    /// Move the replaced package to `.ez2bms-backup/<key>` instead of deleting it.
    pub backup: bool,
}

/// A songs root's view of one key, for deciding whether to publish there.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Inspection {
    /// The folder EZ2PORT resolves the key to (any case), when there is one.
    pub folder: Option<String>,
    /// Its song.ini, when it has one.
    pub song_ini: Option<Vec<u8>>,
    /// The files in it.
    pub files: Vec<String>,
    /// The game ships a song with this key (`<game>/sound/<key>`): a package
    /// with it would take that song over everywhere.
    pub shipped: bool,
}

/// `dir/name`, matched as EZ2PORT does (ez2/vfs.c ez2_vfs_child): the exact
/// name first, then any case. The folder is listed rather than probed: on a
/// case-insensitive disk (Windows) a probe for "abc" also finds "ABC", and
/// the name reported - which the caller shows and compares - would be wrong.
fn child_ci(dir: &Path, name: &str) -> Option<PathBuf> {
    let names: Vec<_> = std::fs::read_dir(dir).ok()?.flatten().map(|e| e.file_name()).collect();
    let hit = names
        .iter()
        .find(|n| n.as_os_str() == name)
        .or_else(|| names.iter().find(|n| n.to_string_lossy().eq_ignore_ascii_case(name)))?;
    Some(dir.join(hit))
}

/// song.ini compared as the text the caller was shown (it crossed the bridge
/// as a string), so a stray invalid byte does not make it "changed".
fn same_text(a: Option<&[u8]>, b: Option<&[u8]>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => String::from_utf8_lossy(a) == String::from_utf8_lossy(b),
        _ => false,
    }
}

fn read_song_ini(folder: &Path) -> Option<Vec<u8>> {
    child_ci(folder, "song.ini").and_then(|p| std::fs::read(p).ok())
}

/// What is at `<songs_root>/<key>` now, and whether the key is a shipped song's.
pub fn inspect(songs_root: &Path, key: &str, game_root: Option<&Path>) -> Result<Inspection> {
    let mut out = Inspection::default();
    if let Some(dir) = child_ci(songs_root, key).filter(|p| p.is_dir()) {
        out.folder = dir.file_name().map(|n| n.to_string_lossy().into_owned());
        out.song_ini = read_song_ini(&dir);
        let mut files: Vec<String> = std::fs::read_dir(&dir)
            .map_err(io(&dir))?
            .flatten()
            .filter(|e| e.path().is_file())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        files.sort();
        out.files = files;
    }
    if let Some(game) = game_root {
        out.shipped =
            child_ci(game, "sound").and_then(|s| child_ci(&s, key)).is_some_and(|p| p.is_dir());
    }
    Ok(out)
}

/// Write `<songs_root>/<key>/` with exactly these files, replacing any older
/// copy. Returns the package folder.
pub fn write_package(songs_root: &Path, key: &str, files: &[(String, Vec<u8>)]) -> Result<PathBuf> {
    write_package_with(songs_root, key, files, &WriteOptions::default())
}

/// `write_package`, keeping what `opts` says to keep and refusing when the
/// folder is no longer what the caller inspected.
pub fn write_package_with(
    songs_root: &Path,
    key: &str,
    files: &[(String, Vec<u8>)],
    opts: &WriteOptions,
) -> Result<PathBuf> {
    if !is_valid_song_key(key) {
        return Err(LaunchError::Invalid(format!(
            "song key {key:?} must be 1-15 lowercase letters or digits"
        )));
    }
    for (name, _) in files {
        check_file_name(name)?;
    }
    for name in &opts.carry {
        check_file_name(name)?;
    }
    // EZ2PORT finds the folder in any case, so an old copy may be named otherwise.
    let current = child_ci(songs_root, key).filter(|p| p.is_dir());
    if let Some(expect) = &opts.expect {
        let now = current.as_deref().and_then(read_song_ini);
        if !same_text(now.as_deref(), expect.as_deref()) {
            return Err(LaunchError::Invalid(format!(
                "{} changed since it was checked; look again before publishing",
                songs_root.join(key).display()
            )));
        }
    }
    let staging_root = songs_root.join(STAGING);
    let stage = staging_root.join(key);
    let old = staging_root.join(format!("{key}.old"));
    let dest = songs_root.join(key);
    std::fs::create_dir_all(&staging_root).map_err(io(&staging_root))?;
    for p in [&stage, &old] {
        if p.exists() {
            std::fs::remove_dir_all(p).map_err(io(p))?;
        }
    }
    std::fs::create_dir(&stage).map_err(io(&stage))?;
    for (name, bytes) in files {
        let p = stage.join(name);
        std::fs::write(&p, bytes).map_err(io(&p))?;
    }
    if let Some(cur) = &current {
        for name in &opts.carry {
            // A table the old package lost since is simply not carried.
            if let Some(src) = child_ci(cur, name).filter(|p| p.is_file()) {
                let to = stage.join(name);
                if !to.exists() {
                    std::fs::copy(&src, &to).map_err(io(&src))?;
                }
            }
        }
        std::fs::rename(cur, &old).map_err(io(cur))?;
    }
    if let Err(e) = std::fs::rename(&stage, &dest) {
        // Put the old copy back rather than leave no song at all.
        if let Some(cur) = &current {
            let _ = std::fs::rename(&old, cur);
        }
        return Err(io(&dest)(e));
    }
    if current.is_some() {
        if opts.backup {
            keep_backup(songs_root, key, &old)?;
        } else {
            let _ = std::fs::remove_dir_all(&old);
        }
    }
    let _ = std::fs::remove_dir(&staging_root);
    Ok(dest)
}

fn keep_backup(songs_root: &Path, key: &str, from: &Path) -> Result<()> {
    let backups = songs_root.join(BACKUP);
    let to = backups.join(key);
    std::fs::create_dir_all(&backups).map_err(io(&backups))?;
    if to.exists() {
        std::fs::remove_dir_all(&to).map_err(io(&to))?;
    }
    std::fs::rename(from, &to).map_err(io(from))
}

/// Take a package out of the song wheel (a song whose key changed): it moves
/// to the backup folder, if it still holds the song.ini the caller saw.
pub fn retire_package(songs_root: &Path, key: &str, expect: &[u8]) -> Result<()> {
    let dir = child_ci(songs_root, key)
        .filter(|p| p.is_dir())
        .ok_or_else(|| LaunchError::Invalid(format!("no package {key:?} to remove")))?;
    if !same_text(read_song_ini(&dir).as_deref(), Some(expect)) {
        return Err(LaunchError::Invalid(format!(
            "{} changed since it was checked; leaving it alone",
            dir.display()
        )));
    }
    keep_backup(songs_root, key, &dir)
}

/// A songs root of its own for one test run, so testing never touches the
/// real song wheel. Removed on drop.
pub struct TempSongs {
    root: PathBuf,
}

impl TempSongs {
    /// A new folder under `base` (the app's cache). Folders left by earlier
    /// runs of a crashed app are cleared first.
    pub fn create(base: &Path) -> Result<TempSongs> {
        std::fs::create_dir_all(base).map_err(io(base))?;
        if let Ok(rd) = std::fs::read_dir(base) {
            for e in rd.flatten() {
                if e.file_name().to_string_lossy().starts_with("songs-") {
                    let _ = std::fs::remove_dir_all(e.path());
                }
            }
        }
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let root = base.join(format!("songs-{}-{nanos}", std::process::id()));
        std::fs::create_dir(&root).map_err(io(&root))?;
        Ok(TempSongs { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn write_package(&self, key: &str, files: &[(String, Vec<u8>)]) -> Result<PathBuf> {
        write_package(&self.root, key, files)
    }
}

impl Drop for TempSongs {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
