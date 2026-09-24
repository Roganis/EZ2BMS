//! Files the system hands to EZ2BMS: a double-clicked chart (Windows passes
//! it as an argument; on Linux the desktop entry's `%F` does), and the files
//! a second launch passes on to the window already open
//! (tauri-plugin-single-instance). They wait here until the editor takes
//! them (`opened_take`), so none is lost to a window not yet listening.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Default)]
pub struct Opened(Mutex<Vec<PathBuf>>);

impl Opened {
    pub fn new(paths: Vec<PathBuf>) -> Self {
        Opened(Mutex::new(paths))
    }

    pub fn push(&self, paths: Vec<PathBuf>) {
        self.0.lock().unwrap().extend(paths);
    }

    /// Everything waiting, oldest first; the queue is left empty.
    pub fn take(&self) -> Vec<PathBuf> {
        std::mem::take(&mut *self.0.lock().unwrap())
    }
}

/// The files among a launch's arguments: not the program itself, not an
/// option, relative ones against the directory it was launched from, and
/// only files that exist (a stray argument is nothing to open).
pub fn paths_from_args(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    args.iter()
        .skip(1)
        .filter(|a| !a.is_empty() && !a.starts_with('-'))
        .map(|a| {
            let p = Path::new(a.strip_prefix("file://").unwrap_or(a));
            if p.is_absolute() {
                p.to_path_buf()
            } else {
                cwd.join(p)
            }
        })
        .filter(|p| p.is_file())
        .collect()
}

/// Whether one window can take a second launch's files. On Linux the two
/// meet on the session bus, and the plugin panics without one (a bare X
/// session, a test runner): then each launch opens its own window instead.
pub fn single_instance_possible() -> bool {
    if cfg!(target_os = "linux") {
        std::env::var_os("DBUS_SESSION_BUS_ADDRESS").is_some()
            || std::env::var_os("XDG_RUNTIME_DIR")
                .is_some_and(|d| Path::new(&d).join("bus").exists())
    } else {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_launch_opens_the_files_it_was_given_and_nothing_else() {
        let d = std::env::temp_dir().join(format!("ez2bms-opened-{}", std::process::id()));
        std::fs::create_dir_all(d.join("song")).unwrap();
        let chart = d.join("song/streetmix1p-abc.bmson");
        let bms = d.join("song/a b.bme");
        std::fs::write(&chart, "{}").unwrap();
        std::fs::write(&bms, "#TITLE x").unwrap();
        let args: Vec<String> = [
            "ez2bms",
            "--flag",
            chart.to_str().unwrap(),
            "song/a b.bme",
            "missing.bmson",
            "",
            &format!("file://{}", chart.display()),
            d.join("song").to_str().unwrap(),
        ]
        .map(String::from)
        .to_vec();
        let got = paths_from_args(&args, &d);
        assert_eq!(got, vec![chart.clone(), d.join("song/a b.bme"), chart]);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn the_queue_hands_everything_over_once() {
        let q = Opened::new(vec![PathBuf::from("/a.bmson")]);
        q.push(vec![PathBuf::from("/b.bms")]);
        assert_eq!(q.take(), vec![PathBuf::from("/a.bmson"), PathBuf::from("/b.bms")]);
        assert!(q.take().is_empty());
    }
}
