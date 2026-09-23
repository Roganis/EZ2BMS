//! Publishing songs and running them in EZ2PORT.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use ez2bms_audio::cut::cut_ssf;
use ez2bms_launch::{
    launch, probe, Caps, LaunchSpec, LogLine, Outcome, Probe, Running, Stream, TempSongs,
};
use serde::{Deserialize, Serialize};

use crate::audio::{publish_cache, resolve};
use crate::error::{CmdError, CmdResult};

#[derive(Debug, Clone, Deserialize)]
pub struct PackageFile {
    pub path: String,
    pub bytes: Vec<u8>,
}

/// A keysound to cut: frames of a source file at 44.1 kHz (chart-core
/// `KeysoundJob`).
#[derive(Debug, Clone, Deserialize)]
pub struct KeysoundJob {
    pub src: String,
    pub start_frame: u64,
    pub end_frame: Option<u64>,
    pub file: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PackageDto {
    pub key: String,
    /// Where relative keysound sources are (the project folder).
    pub project_dir: PathBuf,
    pub files: Vec<PackageFile>,
    pub keysounds: Vec<KeysoundJob>,
}

/// What the editor saw at the target and decided (chart-core publish/rankings.ts).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct PublishOptions {
    /// Ranking tables of the package in place to carry into the new one.
    #[serde(default)]
    pub carry: Vec<String>,
    /// The target as inspected; absent: publish without checking.
    #[serde(default)]
    pub expect: Option<Expected>,
    /// Keep the replaced package in `.ez2bms-backup/<key>`.
    #[serde(default)]
    pub backup: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Expected {
    /// The song.ini port_inspect returned (null: there was no package).
    pub song_ini: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InspectionDto {
    pub folder: Option<String>,
    pub song_ini: Option<String>,
    pub files: Vec<String>,
    pub shipped: bool,
}

pub fn inspect(songs_root: &Path, key: &str, game_root: Option<&Path>) -> CmdResult<InspectionDto> {
    let i = ez2bms_launch::inspect(songs_root, key, game_root)?;
    Ok(InspectionDto {
        folder: i.folder,
        song_ini: i.song_ini.map(|b| String::from_utf8_lossy(&b).into_owned()),
        files: i.files,
        shipped: i.shipped,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct Published {
    pub dir: PathBuf,
    pub files: usize,
    /// Keysounds whose source could not be read, with the reason; the rest
    /// of the package is written regardless.
    pub missing: Vec<(String, String)>,
}

/// Cut every keysound and write the package into `songs_root`, all or nothing.
pub fn publish(songs_root: &Path, pkg: &PackageDto) -> CmdResult<Published> {
    publish_with(songs_root, pkg, &PublishOptions::default())
}

/// `publish`, keeping the tables and backup the editor decided on, and only
/// if the target is still what it inspected.
pub fn publish_with(
    songs_root: &Path,
    pkg: &PackageDto,
    opts: &PublishOptions,
) -> CmdResult<Published> {
    let cache = publish_cache();
    let mut files: Vec<(String, Vec<u8>)> =
        pkg.files.iter().map(|f| (f.path.clone(), f.bytes.clone())).collect();
    let mut missing = Vec::new();
    for job in &pkg.keysounds {
        match cache.get(&resolve(&pkg.project_dir, &job.src)) {
            Ok(s) => files.push((job.file.clone(), cut_ssf(&s, job.start_frame, job.end_frame)?)),
            Err(e) => missing.push((job.src.clone(), e.to_string())),
        }
    }
    let write = ez2bms_launch::WriteOptions {
        carry: opts.carry.clone(),
        expect: opts.expect.as_ref().map(|e| e.song_ini.as_ref().map(|s| s.clone().into_bytes())),
        backup: opts.backup,
    };
    let dir = ez2bms_launch::write_package_with(songs_root, &pkg.key, &files, &write)?;
    Ok(Published { dir, files: files.len() + opts.carry.len(), missing })
}

#[derive(Debug, Clone, Serialize)]
pub struct ProbeDto {
    pub path: PathBuf,
    pub commit: Option<String>,
    pub options: Vec<String>,
    pub songs_root: bool,
    pub log_file: bool,
    pub start_at: bool,
    pub skip_ready: bool,
    pub viewer: bool,
    pub result_file: bool,
}

impl From<&Probe> for ProbeDto {
    fn from(p: &Probe) -> Self {
        let c = p.caps();
        ProbeDto {
            path: p.path.clone(),
            commit: p.commit.clone(),
            options: p.options.iter().cloned().collect(),
            songs_root: c.songs_root,
            log_file: c.log_file,
            start_at: c.start_at,
            skip_ready: c.skip_ready,
            viewer: c.viewer,
            result_file: c.result_file,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Located {
    pub game_root: Option<PathBuf>,
    pub ez2play: Option<PathBuf>,
    pub songs_root: Option<PathBuf>,
}

pub fn locate(start: &Path) -> Located {
    let game_root = ez2bms_launch::locate::find_game_root(start);
    Located {
        ez2play: game_root.as_deref().and_then(ez2bms_launch::locate::find_ez2play),
        songs_root: game_root.as_deref().map(ez2bms_launch::locate::default_songs_root),
        game_root,
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct TestDto {
    pub package: PackageDto,
    /// The chart's file inside the package (`<prefix>1p-<key>[-tier].ez`).
    pub chart_file: String,
    pub mode: String,
    pub ez2play: PathBuf,
    pub game_root: PathBuf,
    pub exe: Option<PathBuf>,
    #[serde(default)]
    pub auto: bool,
    #[serde(default = "yes")]
    pub windowed: bool,
    pub bga: Option<bool>,
    pub speed: Option<u32>,
    pub start_ms: Option<f64>,
    #[serde(default)]
    pub skip_ready: bool,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RunEvent {
    Line { stream: &'static str, text: String, at_ms: u64 },
    Exit { outcome: String, code: Option<i32> },
}

fn line(l: LogLine) -> RunEvent {
    let stream = match l.stream {
        Stream::Out => "out",
        Stream::Err => "err",
    };
    RunEvent::Line { stream, text: l.text, at_ms: l.at_ms }
}

/// Test runs in flight, each with its private songs folder.
#[derive(Default)]
pub struct Runs {
    next: AtomicU32,
    live: Mutex<HashMap<u32, (Running, TempSongs)>>,
}

impl Runs {
    /// Publish into a private songs folder under `cache_dir`, start ez2play,
    /// and forward what it says to `emit` until it exits.
    pub fn start(
        self: &Arc<Self>,
        cache_dir: &Path,
        t: &TestDto,
        emit: impl Fn(RunEvent) -> bool + Send + 'static,
    ) -> CmdResult<u32> {
        let probe = probe(&t.ez2play)?;
        let caps: Caps = probe.caps();
        let songs = TempSongs::create(&cache_dir.join("test-songs"))?;
        let dir = publish(songs.root(), &t.package)?.dir;
        let spec = LaunchSpec {
            ez2play: t.ez2play.clone(),
            game_root: t.game_root.clone(),
            exe: t.exe.clone(),
            songs: Some(songs.root().to_path_buf()),
            chart: dir.join(&t.chart_file),
            mode: t.mode.clone(),
            auto: t.auto,
            windowed: t.windowed,
            bga: t.bga,
            speed: t.speed,
            log: Some(songs.root().join("ez2play.log")),
            start_ms: t.start_ms,
            skip_ready: t.skip_ready,
            result: Some(songs.root().join("result.json")),
        };
        let running = launch(&spec, &caps)?;
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        self.live.lock().unwrap().insert(id, (running, songs));
        let me = self.clone();
        std::thread::spawn(move || me.watch(id, emit));
        Ok(id)
    }

    fn watch(&self, id: u32, emit: impl Fn(RunEvent) -> bool) {
        loop {
            let (lines, done) = {
                let mut live = self.live.lock().unwrap();
                let Some((r, _)) = live.get_mut(&id) else { return };
                (r.drain(), r.try_wait().ok().flatten())
            };
            for l in lines {
                emit(line(l));
            }
            if let Some(outcome) = done {
                // Last words, then the private songs folder goes with the run.
                if let Some((r, songs)) = self.live.lock().unwrap().remove(&id) {
                    if let Ok((_, rest)) = r.wait() {
                        for l in rest {
                            emit(line(l));
                        }
                    }
                    drop(songs);
                }
                let (name, code) = match outcome {
                    Outcome::Finished => ("finished", Some(0)),
                    Outcome::Failed => ("failed", Some(1)),
                    Outcome::Usage => ("usage", Some(2)),
                    Outcome::Skipped => ("skipped", Some(77)),
                    Outcome::Other(c) => ("other", Some(c)),
                    Outcome::Killed => ("killed", None),
                };
                emit(RunEvent::Exit { outcome: name.into(), code });
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    pub fn stop(&self, id: u32) -> CmdResult<()> {
        match self.live.lock().unwrap().get_mut(&id) {
            Some((r, _)) => Ok(r.kill()?),
            None => Err(CmdError::Invalid(format!("no test run {id}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_front_end_shapes_deserialize() {
        let pkg = serde_json::json!({
            "key": "abc",
            "project_dir": "/songs/abc",
            "files": [{ "path": "song.ini", "bytes": [91, 83] }],
            "keysounds": [{ "src": "kick.wav", "start_frame": 0, "end_frame": null, "file": "kick.ssf" }]
        });
        let p: PackageDto = serde_json::from_value(pkg.clone()).unwrap();
        assert_eq!((p.files[0].bytes.len(), p.keysounds[0].end_frame), (2, None));
        let t: TestDto = serde_json::from_value(serde_json::json!({
            "package": pkg, "chart_file": "streetmix1p-abc.ez", "mode": "StreetMix",
            "ez2play": "/g/ez2play.exe", "game_root": "/g", "auto": true
        }))
        .unwrap();
        assert!(t.auto && t.windowed && !t.skip_ready && t.start_ms.is_none());
        let line =
            serde_json::to_value(RunEvent::Line { stream: "err", text: "x".into(), at_ms: 3 })
                .unwrap();
        assert_eq!(line["kind"], "line");
        let exit =
            serde_json::to_value(RunEvent::Exit { outcome: "finished".into(), code: Some(0) })
                .unwrap();
        assert_eq!((exit["kind"].as_str(), exit["code"].as_i64()), (Some("exit"), Some(0)));
    }

    #[test]
    fn publishing_cuts_keysounds_and_reports_what_is_missing() {
        let d = std::env::temp_dir().join(format!("ez2bms-app publish {}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        let project = d.join("my project");
        std::fs::create_dir_all(project.join("stems")).unwrap();
        let pcm: Vec<i16> = (0..2 * 44_100).map(|i| (i * 37 % 20_000) as i16).collect();
        std::fs::write(
            project.join("stems/loop.wav"),
            ez2bms_audio::wav::encode_pcm16(2, 44_100, &pcm),
        )
        .unwrap();
        let pkg = PackageDto {
            key: "abc".into(),
            project_dir: project.clone(),
            files: vec![PackageFile {
                path: "song.ini".into(),
                bytes: b"[Song]\nKey = abc\n".to_vec(),
            }],
            keysounds: vec![
                KeysoundJob {
                    src: "stems/loop.wav".into(),
                    start_frame: 0,
                    end_frame: Some(1000),
                    file: "loop_0_23.ssf".into(),
                },
                KeysoundJob {
                    src: "stems/loop.wav".into(),
                    start_frame: 1000,
                    end_frame: None,
                    file: "loop_23_end.ssf".into(),
                },
                KeysoundJob {
                    src: "gone.ogg".into(),
                    start_frame: 0,
                    end_frame: None,
                    file: "gone.ssf".into(),
                },
            ],
        };
        let songs = d.join("songs");
        let out = publish(&songs, &pkg).unwrap();
        assert_eq!(out.dir, songs.join("abc"));
        assert_eq!(out.files, 3);
        assert_eq!(out.missing.len(), 1);
        assert_eq!(out.missing[0].0, "gone.ogg");
        let a = std::fs::read(out.dir.join("loop_0_23.ssf")).unwrap();
        let b = std::fs::read(out.dir.join("loop_23_end.ssf")).unwrap();
        let (ha, pa) = ez2bms_audio::ssf::parse(&a).unwrap();
        let (hb, pb) = ez2bms_audio::ssf::parse(&b).unwrap();
        assert_eq!((ha.frames(), hb.frames()), (1000, 43_100));
        // The two cuts are the source, byte for byte.
        let joined: Vec<u8> = pa.iter().chain(pb).copied().collect();
        let src: Vec<u8> = pcm.iter().flat_map(|s| s.to_le_bytes()).collect();
        assert_eq!(joined, src);
        std::fs::remove_dir_all(&d).ok();
    }
}
