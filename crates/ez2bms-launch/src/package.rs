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

/// Write `<songs_root>/<key>/` with exactly these files, replacing any older
/// copy. Returns the package folder.
pub fn write_package(songs_root: &Path, key: &str, files: &[(String, Vec<u8>)]) -> Result<PathBuf> {
    if !is_valid_song_key(key) {
        return Err(LaunchError::Invalid(format!(
            "song key {key:?} must be 1-15 lowercase letters or digits"
        )));
    }
    for (name, _) in files {
        check_file_name(name)?;
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
    if dest.exists() {
        std::fs::rename(&dest, &old).map_err(io(&dest))?;
    }
    if let Err(e) = std::fs::rename(&stage, &dest) {
        // Put the old copy back rather than leave no song at all.
        let _ = std::fs::rename(&old, &dest);
        return Err(io(&dest)(e));
    }
    let _ = std::fs::remove_dir_all(&old);
    let _ = std::fs::remove_dir(&staging_root);
    Ok(dest)
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
