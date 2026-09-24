//! Where EZ2PORT keeps its own settings - `keys.ini` (the bindings) and
//! `settings.ini` (among others, the input `Debounce`) - so the editor can
//! start from the player's bindings and import them again later. EZ2BMS
//! only reads these files; it never writes them.
//!
//! The port resolves ONE settings folder (ez2/cfgdir.c, tools/ez2play/main.c):
//!
//! 1. `<data folder>/ez2port`, when ez2play is run from inside a data folder
//!    with no `--root` (the cabinet: the exe dropped into the game);
//! 2. else `$XDG_CONFIG_HOME/ez2port`, `$HOME/.config/ez2port` or
//!    `%APPDATA%\ez2port`, whichever variable is set first - set, not whether
//!    the folder exists;
//!
//! and `EZ2_KEYS` (or `--keys`) names keys.ini outright. Which of these a
//! given run reads depends on how it was started - a cabinet run reads the
//! data folder's, a run from EZ2BMS's F5 (which passes `--root`) the
//! per-user one - so every candidate is listed, in the port's order, and
//! the editor takes the first that exists.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::locate::is_game_root;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct ConfigFile {
    /// `keys` or `settings`.
    pub kind: &'static str,
    pub path: PathBuf,
    pub exists: bool,
    /// `env` (EZ2_KEYS), `data` (a data folder's `ez2port`), `user`.
    pub source: &'static str,
}

/// Every place the port would read its settings from, first first.
/// `ez2play` and `game_root` are the editor's settings; `env` reads the
/// environment (a parameter so tests don't depend on the machine's).
pub fn config_files(
    ez2play: Option<&Path>,
    game_root: Option<&Path>,
    env: &dyn Fn(&str) -> Option<OsString>,
) -> Vec<ConfigFile> {
    let set = |name: &str| env(name).filter(|v| !v.is_empty());
    let mut out = Vec::new();
    let mut push = |kind: &'static str, path: PathBuf, source: &'static str| {
        if !out.iter().any(|c: &ConfigFile| c.kind == kind && c.path == path) {
            let exists = path.is_file();
            out.push(ConfigFile { kind, path, exists, source });
        }
    };
    if let Some(k) = set("EZ2_KEYS") {
        push("keys", PathBuf::from(k), "env");
    }
    let mut dirs: Vec<PathBuf> = Vec::new();
    // The cabinet: ez2play in the data folder. The game folder itself is
    // the same place for a drop-in install that EZ2BMS was only told the
    // game folder of.
    for d in [ez2play.and_then(Path::parent), game_root].into_iter().flatten() {
        if is_game_root(d) {
            dirs.push(d.join("ez2port"));
        }
    }
    let user = if let Some(x) = set("XDG_CONFIG_HOME") {
        Some(PathBuf::from(x).join("ez2port"))
    } else if let Some(h) = set("HOME") {
        Some(PathBuf::from(h).join(".config").join("ez2port"))
    } else {
        set("APPDATA").map(|a| PathBuf::from(a).join("ez2port"))
    };
    for (i, d) in dirs.iter().chain(user.iter()).enumerate() {
        let source = if i < dirs.len() { "data" } else { "user" };
        push("keys", d.join("keys.ini"), source);
        push("settings", d.join("settings.ini"), source);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env(vars: &[(&str, &str)]) -> impl Fn(&str) -> Option<OsString> {
        let m: HashMap<String, OsString> =
            vars.iter().map(|(k, v)| (k.to_string(), OsString::from(v))).collect();
        move |k| m.get(k).cloned()
    }

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ez2bms-cfg-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn the_per_user_folder_is_the_first_variable_set() {
        let xdg = config_files(None, None, &env(&[("XDG_CONFIG_HOME", "/x"), ("HOME", "/h")]));
        assert_eq!(
            xdg.iter().map(|c| (c.kind, c.path.clone(), c.source)).collect::<Vec<_>>(),
            [
                ("keys", PathBuf::from("/x/ez2port/keys.ini"), "user"),
                ("settings", PathBuf::from("/x/ez2port/settings.ini"), "user"),
            ]
        );
        // Set but empty is unset; HOME before APPDATA.
        let home = config_files(
            None,
            None,
            &env(&[("XDG_CONFIG_HOME", ""), ("HOME", "/h"), ("APPDATA", "/a")]),
        );
        assert_eq!(home[0].path, PathBuf::from("/h/.config/ez2port/keys.ini"));
        let win = config_files(None, None, &env(&[("APPDATA", "C:/U/AppData/Roaming")]));
        assert_eq!(win[0].path, PathBuf::from("C:/U/AppData/Roaming/ez2port/keys.ini"));
        assert!(config_files(None, None, &env(&[])).is_empty());
    }

    #[test]
    fn a_data_folder_comes_first_and_ez2_keys_before_it() {
        let game = tmp("game");
        std::fs::create_dir_all(game.join("Sound")).unwrap();
        std::fs::create_dir_all(game.join("system")).unwrap();
        std::fs::create_dir_all(game.join("ez2port")).unwrap();
        std::fs::write(game.join("ez2port/keys.ini"), "[Keys]\n").unwrap();
        let exe = game.join("ez2play.exe");
        let not_game = tmp("elsewhere");

        let files = config_files(
            Some(&exe),
            Some(&game),
            &env(&[("EZ2_KEYS", "/k/keys.ini"), ("HOME", "/h")]),
        );
        let got: Vec<_> = files.iter().map(|c| (c.kind, c.source, c.exists)).collect();
        // ez2play's folder and the game folder are one place: listed once.
        assert_eq!(
            got,
            [
                ("keys", "env", false),
                ("keys", "data", true),
                ("settings", "data", false),
                ("keys", "user", false),
                ("settings", "user", false),
            ]
        );
        assert_eq!(files[1].path, game.join("ez2port").join("keys.ini"));

        // ez2play outside a data folder, no game folder: the per-user one only.
        let exe2 = not_game.join("ez2play");
        let files = config_files(Some(&exe2), None, &env(&[("HOME", "/h")]));
        assert!(files.iter().all(|c| c.source == "user"));
        let _ = std::fs::remove_dir_all(&game);
        let _ = std::fs::remove_dir_all(&not_game);
    }
}
