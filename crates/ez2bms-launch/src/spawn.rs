//! Running a chart in ez2play and capturing what it says.

use std::ffi::OsString;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::Instant;

use crate::error::{io, LaunchError, Result};
use crate::probe::Caps;

#[derive(Debug, Clone, PartialEq)]
pub struct LaunchSpec {
    pub ez2play: PathBuf,
    /// The game's data folder (`--root`).
    pub game_root: PathBuf,
    /// The unpacked executable; None lets ez2play find it in the data folder.
    pub exe: Option<PathBuf>,
    /// Songs root to read packages from (`--songs`).
    pub songs: Option<PathBuf>,
    pub chart: PathBuf,
    /// EZ2PORT's mode name (`StreetMix`, `7StreetMix`, ...).
    pub mode: String,
    pub auto: bool,
    pub windowed: bool,
    pub bga: Option<bool>,
    /// The speed dial, percent.
    pub speed: Option<u32>,
    pub log: Option<PathBuf>,
    /// Start this far into the chart (needs `--start`).
    pub start_ms: Option<f64>,
    /// Skip the READY count (needs `--no-ready`).
    pub skip_ready: bool,
    /// Where to write the stage result, when the build can (`--result`).
    pub result: Option<PathBuf>,
}

impl LaunchSpec {
    /// The command line, refusing what this build of ez2play cannot do.
    pub fn args(&self, caps: &Caps) -> Result<Vec<OsString>> {
        let need = |ok: bool, what: &'static str| {
            if ok {
                Ok(())
            } else {
                Err(LaunchError::Unsupported(what))
            }
        };
        let mut a: Vec<OsString> = Vec::new();
        if let Some(exe) = &self.exe {
            a.extend(["--exe".into(), exe.into()]);
        }
        a.extend(["--root".into(), self.game_root.clone().into()]);
        if let Some(s) = &self.songs {
            need(caps.songs_root, "play from a songs folder (--songs)")?;
            a.extend(["--songs".into(), s.into()]);
        }
        a.extend(["--mode".into(), self.mode.clone().into()]);
        if self.auto {
            a.push("--auto".into());
        }
        if self.windowed && caps.windowed {
            a.push("--windowed".into());
        }
        match self.bga {
            Some(true) if caps.bga_toggle => a.push("--bga".into()),
            Some(false) if caps.bga_toggle => a.push("--no-bga".into()),
            _ => {}
        }
        if let Some(sp) = self.speed.filter(|_| caps.speed) {
            a.extend(["--speed".into(), sp.to_string().into()]);
        }
        if let Some(log) = self.log.as_ref().filter(|_| caps.log_file) {
            a.extend(["--log".into(), log.into()]);
        }
        if let Some(ms) = self.start_ms {
            need(caps.start_at, "start mid-chart (--start)")?;
            a.extend(["--start".into(), format!("{}", ms.max(0.0).round() as u64).into()]);
        }
        if self.skip_ready {
            need(caps.skip_ready, "skip the READY count (--no-ready)")?;
            a.push("--no-ready".into());
        }
        if let Some(r) = self.result.as_ref().filter(|_| caps.result_file) {
            a.extend(["--result".into(), r.into()]);
        }
        a.push(self.chart.clone().into());
        Ok(a)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stream {
    Out,
    Err,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogLine {
    pub stream: Stream,
    pub text: String,
    /// Milliseconds since launch.
    pub at_ms: u64,
}

/// How ez2play ended, by its own exit codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Finished,
    /// 1: it said why on stderr.
    Failed,
    /// 2: it did not understand its command line (an older or newer build).
    Usage,
    /// 77: the game data it needs is not there.
    Skipped,
    Other(i32),
    /// Killed, or died on a signal.
    Killed,
}

impl Outcome {
    pub fn from_status(s: ExitStatus) -> Outcome {
        match s.code() {
            Some(0) => Outcome::Finished,
            Some(1) => Outcome::Failed,
            Some(2) => Outcome::Usage,
            Some(77) => Outcome::Skipped,
            Some(c) => Outcome::Other(c),
            None => Outcome::Killed,
        }
    }
}

pub struct Running {
    child: Child,
    lines: Receiver<LogLine>,
    started: Instant,
}

/// CREATE_NO_WINDOW: ez2play is a console program; without this Windows opens
/// a console beside the game window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn launch(spec: &LaunchSpec, caps: &Caps) -> Result<Running> {
    let mut cmd = Command::new(&spec.ez2play);
    cmd.args(spec.args(caps)?)
        .current_dir(&spec.game_root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(io(&spec.ez2play))?;
    let started = Instant::now();
    let (tx, rx) = channel();
    if let Some(out) = child.stdout.take() {
        pump(out, Stream::Out, tx.clone(), started);
    }
    if let Some(err) = child.stderr.take() {
        pump(err, Stream::Err, tx, started);
    }
    Ok(Running { child, lines: rx, started })
}

fn pump(r: impl Read + Send + 'static, stream: Stream, tx: Sender<LogLine>, started: Instant) {
    std::thread::spawn(move || {
        let mut r = BufReader::new(r);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match r.read_until(b'\n', &mut buf) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let text =
                        String::from_utf8_lossy(&buf).trim_end_matches(['\r', '\n']).to_string();
                    let at_ms = started.elapsed().as_millis() as u64;
                    if tx.send(LogLine { stream, text, at_ms }).is_err() {
                        break;
                    }
                }
            }
        }
    });
}

impl Running {
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    pub fn elapsed_ms(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    /// Lines said since the last call.
    pub fn drain(&self) -> Vec<LogLine> {
        self.lines.try_iter().collect()
    }

    /// None while it runs.
    pub fn try_wait(&mut self) -> Result<Option<Outcome>> {
        Ok(self.child.try_wait().map_err(io("ez2play"))?.map(Outcome::from_status))
    }

    pub fn kill(&mut self) -> Result<()> {
        match self.child.kill() {
            Ok(()) => Ok(()),
            // Already gone.
            Err(e) if e.kind() == std::io::ErrorKind::InvalidInput => Ok(()),
            Err(e) => Err(io("ez2play")(e)),
        }
    }

    /// Wait for the end; returns how it ended and every line not yet drained.
    pub fn wait(mut self) -> Result<(Outcome, Vec<LogLine>)> {
        let status = self.child.wait().map_err(io("ez2play"))?;
        // The readers finish when the pipes close.
        let mut lines: Vec<LogLine> = self.lines.iter().collect();
        lines.sort_by_key(|l| l.at_ms);
        Ok((Outcome::from_status(status), lines))
    }
}
