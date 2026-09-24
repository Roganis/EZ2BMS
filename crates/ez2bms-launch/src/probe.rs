//! What an `ez2play` build supports, read from the executable without running
//! it. Running it is not safe as a probe: a drop-in `ez2play` started with no
//! chart finds the data folder beside itself and boots the whole arcade.
//!
//! ez2play parses options with `strcmp(argv[i], "--songs")`, so every option
//! it knows is in the binary as its own NUL-terminated string. Finding
//! `--start\0` means the build has `--start`, and so on - which is how Test
//! from cursor lights up once EZ2PORT ships the flags EZ2BMS asked for
//! (docs/ez2port-requests.md).

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use crate::error::{io, LaunchError, Result};

/// Options every usable build has; a file with none of them is not ez2play.
const CORE: [&str; 4] = ["--exe", "--root", "--mode", "--auto"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Probe {
    pub path: PathBuf,
    /// Every `--option` literal in the binary.
    pub options: BTreeSet<String>,
    /// The source commit, when the binary names one (`ez2play build N (commit)`).
    pub commit: Option<String>,
}

impl Probe {
    pub fn has(&self, option: &str) -> bool {
        self.options.contains(option)
    }

    pub fn caps(&self) -> Caps {
        Caps {
            songs_root: self.has("--songs"),
            log_file: self.has("--log"),
            windowed: self.has("--windowed"),
            bga_toggle: self.has("--bga") && self.has("--no-bga"),
            speed: self.has("--speed"),
            start_at: self.has("--start"),
            skip_ready: self.has("--no-ready"),
            viewer: self.has("--viewer"),
            plugin: self.has("--plugin"),
            result_file: self.has("--result"),
        }
    }
}

/// The features EZ2BMS uses, by name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Caps {
    /// `--songs DIR`: play packages from an isolated folder.
    pub songs_root: bool,
    /// `--log FILE`.
    pub log_file: bool,
    pub windowed: bool,
    pub bga_toggle: bool,
    pub speed: bool,
    /// `--start POS` (requested): Test from cursor.
    pub start_at: bool,
    /// `--no-ready` (requested): skip the 6.3 s READY count.
    pub skip_ready: bool,
    /// `--viewer` (requested): one long-lived window driven over a socket.
    pub viewer: bool,
    /// `--plugin CMD`: a JSON line per finished stage.
    pub plugin: bool,
    /// `--result FILE` (requested): the stage result as one JSON object.
    pub result_file: bool,
}

pub fn probe(path: &Path) -> Result<Probe> {
    let bytes = std::fs::read(path).map_err(io(path))?;
    let p = probe_bytes(path, &bytes);
    if !CORE.iter().any(|o| p.has(o)) {
        return Err(LaunchError::NotEz2play(path.to_path_buf()));
    }
    Ok(p)
}

pub fn probe_bytes(path: &Path, bytes: &[u8]) -> Probe {
    let mut options = BTreeSet::new();
    let mut commit = None;
    for s in c_strings(bytes) {
        if s.len() > 2
            && s.starts_with("--")
            && s[2..].bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        {
            options.insert(s.to_string());
        }
    }
    // The commit sits among the build strings as 7+ lowercase hex digits,
    // optionally "-dirty"; only trust it next to the "ez2play build" format.
    let strings: Vec<&str> = c_strings(bytes).collect();
    if let Some(at) = strings.iter().position(|s| s.starts_with("ez2play build ")) {
        let near = &strings[at.saturating_sub(8)..(at + 8).min(strings.len())];
        commit = near
            .iter()
            .find(|s| {
                let h = s.strip_suffix("-dirty").unwrap_or(s);
                (7..=40).contains(&h.len())
                    && h.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            })
            .map(|s| s.to_string());
    }
    Probe { path: path.to_path_buf(), options, commit }
}

/// Printable ASCII runs of 3+ bytes that end in a NUL (C string literals).
fn c_strings(bytes: &[u8]) -> impl Iterator<Item = &str> {
    bytes.split(|&b| b == 0).filter_map(|run| {
        let start = run.iter().rposition(|&b| !(0x20..0x7f).contains(&b)).map_or(0, |i| i + 1);
        let s = &run[start..];
        (s.len() >= 3).then(|| std::str::from_utf8(s).ok()).flatten()
    })
}
