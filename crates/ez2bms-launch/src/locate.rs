//! Finding the pieces: the game's data folder, EZ2PORT's `ez2play` in it, and
//! the songs root it reads user packages from.

use std::path::{Path, PathBuf};

/// The file name ez2play has on this platform.
pub const EZ2PLAY: &str = if cfg!(windows) { "ez2play.exe" } else { "ez2play" };

/// A data folder is one with `sound` and `system` in it (EZ2PORT's own test,
/// `ezAssetRootHere`). Walks up from `start`.
pub fn find_game_root(start: &Path) -> Option<PathBuf> {
    let mut dir = Some(start);
    while let Some(d) = dir {
        if is_game_root(d) {
            return Some(d.to_path_buf());
        }
        dir = d.parent();
    }
    None
}

pub fn is_game_root(dir: &Path) -> bool {
    let has = |name: &str| {
        std::fs::read_dir(dir).is_ok_and(|rd| {
            rd.flatten().any(|e| {
                e.file_name().to_string_lossy().eq_ignore_ascii_case(name) && e.path().is_dir()
            })
        })
    };
    has("sound") && has("system")
}

/// `ez2play` beside the game (the drop-in install), else None.
pub fn find_ez2play(game_root: &Path) -> Option<PathBuf> {
    let p = game_root.join(EZ2PLAY);
    p.is_file().then_some(p)
}

/// Where a drop-in install keeps user songs: `<game>/ez2port/songs`.
pub fn default_songs_root(game_root: &Path) -> PathBuf {
    game_root.join("ez2port").join("songs")
}
