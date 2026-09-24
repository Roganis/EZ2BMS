//! What EZ2BMS leaves behind when something goes wrong, for the About box
//! and for a report. Nothing here is sent anywhere: the log stays in the
//! app's log folder (`<log dir>/ez2bms.log`, rotated by tauri-plugin-log).
//!
//! - **An unclean exit** is found by a session marker: written at start,
//!   removed on a clean exit. One still there at the next start means the
//!   app died without closing (a crash, a kill, the power), whatever the
//!   cause - a panic hook only sees Rust panics, and not every panic
//!   closes the app.
//! - **A panic** is logged with its backtrace, and the window is told, so a
//!   command that panicked says so instead of failing silently.
//! - **A report** is the last part of the log files, newest last.

use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// The log file's stem in the app's log folder (tauri-plugin-log's LogDir target).
pub const LOG_NAME: &str = "ez2bms";
const MARKER: &str = "session.json";

/// A session that ended without closing: what its marker said.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreviousSession {
    /// When it started, ms since the Unix epoch.
    pub started_ms: u64,
    pub pid: u32,
    pub version: String,
}

/// This run's marker.
pub struct Session {
    marker: PathBuf,
    /// The run before this one, when it did not close cleanly.
    pub previous: Option<PreviousSession>,
}

impl Session {
    /// Read what the last run left, and mark this one as running.
    pub fn begin(dir: &Path, version: &str) -> std::io::Result<Session> {
        std::fs::create_dir_all(dir)?;
        let marker = dir.join(MARKER);
        // A marker that cannot be read is still an unclean exit.
        let previous = match std::fs::read(&marker) {
            Ok(b) => Some(serde_json::from_slice(&b).unwrap_or(PreviousSession {
                started_ms: 0,
                pid: 0,
                version: String::new(),
            })),
            Err(_) => None,
        };
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        let mine = PreviousSession {
            started_ms: now as u64,
            pid: std::process::id(),
            version: version.to_string(),
        };
        std::fs::write(&marker, serde_json::to_vec(&mine).unwrap_or_default())?;
        Ok(Session { marker, previous })
    }

    /// A clean exit: the next start finds nothing.
    pub fn end(&self) {
        let _ = std::fs::remove_file(&self.marker);
    }
}

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Log every panic with its backtrace, tell the window, then do what Rust
/// would have done anyway (print it; abort if it was the main thread's).
pub fn install_panic_hook(app: AppHandle) {
    let _ = APP.set(app);
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let bt = std::backtrace::Backtrace::force_capture();
        let what = info.to_string();
        log::error!(target: "panic", "{what}\n{bt}");
        if let Some(app) = APP.get() {
            let _ = app.emit("diag://panic", what);
        }
        default(info);
    }));
}

/// The log files in `dir` (the current one and its rotated copies), oldest first.
fn log_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<(SystemTime, PathBuf)> = rd
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension().is_some_and(|x| x == "log")
                && p.file_stem()
                    .and_then(|s| s.to_str())
                    .is_some_and(|s| s == LOG_NAME || s.starts_with(&format!("{LOG_NAME}_")))
        })
        .map(|p| (p.metadata().and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH), p))
        .collect();
    files.sort();
    files.into_iter().map(|(_, p)| p).collect()
}

/// The last `max` bytes of the logs, across files (newest last), cut at a
/// line start and read as UTF-8 leniently.
pub fn tail(dir: &Path, max: usize) -> String {
    let mut chunks: Vec<Vec<u8>> = Vec::new();
    let mut left = max;
    for p in log_files(dir).into_iter().rev() {
        if left == 0 {
            break;
        }
        let Ok(mut f) = std::fs::File::open(&p) else { continue };
        let len = f.metadata().map(|m| m.len()).unwrap_or(0) as usize;
        let take = len.min(left);
        // One byte before the cut says whether it falls on a line start.
        let from = len - take - usize::from(take < len);
        if f.seek(SeekFrom::Start(from as u64)).is_err() {
            continue;
        }
        let mut buf = Vec::with_capacity(len - from);
        if f.take((len - from) as u64).read_to_end(&mut buf).is_err() {
            continue;
        }
        if take < len {
            // Not a partial first line: drop through the first newline (the
            // byte before the cut is one when it falls on a line start).
            match buf.iter().position(|&b| b == b'\n') {
                Some(nl) => drop(buf.drain(..=nl)),
                None => buf.clear(),
            }
        }
        left -= take;
        chunks.push(buf);
    }
    chunks.reverse();
    String::from_utf8_lossy(&chunks.concat()).into_owned()
}

/// The build's commit, from build.rs (`unknown` outside a git checkout).
pub const COMMIT: &str = env!("EZ2BMS_COMMIT");

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ez2bms-diag-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn a_session_that_did_not_end_is_found_by_the_next() {
        let d = tmp("session");
        let first = Session::begin(&d, "0.1.0").unwrap();
        assert_eq!(first.previous, None);
        first.end();
        let second = Session::begin(&d, "0.1.0").unwrap();
        assert_eq!(second.previous, None, "a clean exit leaves nothing");
        // It dies without ending.
        let third = Session::begin(&d, "0.2.0").unwrap();
        let prev = third.previous.clone().unwrap();
        assert_eq!(prev.version, "0.1.0");
        assert_eq!(prev.pid, std::process::id());
        assert!(prev.started_ms > 0);
        third.end();
        // A damaged marker is still an unclean exit.
        std::fs::write(d.join(MARKER), b"garbage").unwrap();
        assert!(Session::begin(&d, "0.2.0").unwrap().previous.is_some());
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn the_tail_spans_rotated_files_newest_last_from_a_line_start() {
        let d = tmp("tail");
        let old = d.join(format!("{LOG_NAME}_2026-09-01_10-00-00.log"));
        let cur = d.join(format!("{LOG_NAME}.log"));
        std::fs::write(&old, "old one\nold two\n").unwrap();
        // Make the rotated file older than the current one.
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&cur, "new one\nnew two\n").unwrap();
        std::fs::write(d.join("other.log"), "not ours\n").unwrap();
        std::fs::write(d.join(MARKER), "{}").unwrap();
        assert_eq!(tail(&d, 1000), "old one\nold two\nnew one\nnew two\n");
        // Only the end, cut at a line start.
        assert_eq!(tail(&d, 12), "new two\n");
        // A cut inside a line drops it; one on a line start keeps it whole.
        assert_eq!(tail(&d, 20), "new one\nnew two\n");
        assert_eq!(tail(&d, 24), "old two\nnew one\nnew two\n");
        assert_eq!(tail(&d, 8), "new two\n");
        assert_eq!(tail(&tmp("empty"), 100), "");
        std::fs::remove_dir_all(&d).ok();
    }
}
