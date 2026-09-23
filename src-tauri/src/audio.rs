//! The app's audio: one engine (the default device, or a silent clock when
//! there is none), the samples it has loaded, and what it is playing.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Weak};

use ez2bms_audio::cache::SampleCache;
use ez2bms_audio::level::ds_gains;
use ez2bms_audio::peaks::Peaks;
use ez2bms_audio::schedule::{frame_at_ms, EventSpec, VoiceKey, LANE_VOICE_BASE};
use ez2bms_audio::{preview, Engine, Sample, Schedule, VoiceStart};
use serde::{Deserialize, Serialize};

use crate::error::{CmdError, CmdResult};

pub struct Audio {
    pub engine: Engine,
    pub backend: &'static str,
    pub device_error: Option<String>,
    cache: SampleCache,
    bank: Mutex<Bank>,
    /// Waveform mipmaps per sample id, kept while the id still holds the same
    /// decoded sample (a reload replaces it, and the entry no longer matches).
    peaks: Mutex<PeakCache>,
}

/// Per sample id: the decoded sample a mipmap was built from, and the mipmap.
type PeakCache = HashMap<u32, (Weak<Sample>, Arc<Peaks>)>;

/// Frames per bucket at a waveform mipmap's finest level.
const PEAK_BASE: u32 = 64;

/// Sample ids are stable per path for the app's lifetime: schedules and
/// sounding voices refer to them, and a reloaded file keeps its id.
#[derive(Default)]
struct Bank {
    ids: HashMap<PathBuf, u32>,
    samples: Vec<Arc<Sample>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioInfo {
    pub rate: u32,
    pub backend: &'static str,
    pub device_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Loaded {
    pub path: String,
    pub id: Option<u32>,
    pub frames: u64,
    pub channels: u16,
    pub seconds: f64,
    pub error: Option<String>,
}

/// One event of the compiled chart (chart-core `PlanEvent`, reduced).
#[derive(Debug, Clone, Deserialize)]
pub struct EventDto {
    pub ms: f64,
    pub origin_ms: f64,
    pub until_ms: Option<f64>,
    pub sample: u32,
    pub voice: VoiceKey,
    pub level: i32,
    pub pan: i32,
}

impl EventDto {
    fn spec(&self) -> EventSpec {
        EventSpec {
            ms: self.ms,
            origin_ms: self.origin_ms,
            end_ms: self.until_ms,
            sample: self.sample,
            key: self.voice,
            level: self.level,
            pan: self.pan,
        }
    }
}

/// The song's preview to render (chart-core publish/preview.ts): the chart's
/// events over `sources` (the events' `sample` indexes them), or a window of
/// an audio `file`.
#[derive(Debug, Clone, Deserialize)]
pub struct PreviewJob {
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub events: Vec<EventDto>,
    #[serde(default)]
    pub file: Option<String>,
    pub from_ms: f64,
    pub length_ms: f64,
    pub fade_ms: f64,
}

/// The longest preview rendered: the port loops whatever it is given, but a
/// longer one only grows the package (chart-core caps the window at 30 s).
const PREVIEW_MAX_MS: f64 = 60_000.0;

/// The window in frames at `rate`.
fn preview_frames(job: &PreviewJob, rate: u32) -> (u64, usize, usize) {
    let len = job.length_ms.clamp(0.0, PREVIEW_MAX_MS);
    (
        frame_at_ms(job.from_ms, rate),
        frame_at_ms(len, rate) as usize,
        frame_at_ms(job.fade_ms.clamp(0.0, len / 2.0), rate) as usize,
    )
}

/// A preview at the cache's rate (44.1 kHz when publishing), sources found
/// under `base`. A source that cannot be read is silence, as a missing
/// keysound is.
pub fn render_preview(cache: &SampleCache, base: &Path, job: &PreviewJob) -> CmdResult<Vec<i16>> {
    let rate = cache.rate();
    let (from, frames, fade) = preview_frames(job, rate);
    if let Some(file) = &job.file {
        let s = cache.get(&resolve(base, file))?;
        return Ok(preview::from_sample(&s, from, frames, fade));
    }
    let samples = job
        .sources
        .iter()
        .map(|src| {
            cache.get(&resolve(base, src)).unwrap_or_else(|_| Arc::new(Sample::silence(rate, 2, 0)))
        })
        .collect();
    let specs: Vec<EventSpec> = job.events.iter().map(EventDto::spec).collect();
    let schedule = Schedule::from_specs(rate, samples, &specs)?;
    Ok(preview::render(Arc::new(schedule), from, frames, fade)?)
}

/// The voice the preview is auditioned on: a lane charts never use, so a
/// new audition cuts the last one - the wheel's hard restart.
pub const PREVIEW_VOICE: VoiceKey = LANE_VOICE_BASE + 255;

/// A rendered preview, ready to trigger: its sample id, length, and the
/// voice to play it on.
#[derive(Debug, Clone, Serialize)]
pub struct Audition {
    pub sample: u32,
    pub seconds: f64,
    pub voice: VoiceKey,
}

/// The bank's key for the auditioned preview (not a file).
const PREVIEW_KEY: &str = "\0ez2bms-preview";

#[derive(Debug, Clone, Deserialize)]
pub struct TriggerDto {
    pub sample: u32,
    pub voice: VoiceKey,
    #[serde(default)]
    pub level: i32,
    #[serde(default)]
    pub pan: i32,
    /// Start this far into the sample.
    #[serde(default)]
    pub offset_ms: f64,
    pub until_ms: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct ClockDto {
    pub frame: u64,
    pub host_ns: u64,
    pub latency_frames: u32,
    pub rate: u32,
    pub playing: bool,
    pub generation: u64,
    /// Host time when this was read, on the same scale as `host_ns`.
    pub now_ns: u64,
}

impl Audio {
    /// The default output device, else a silent real-time clock so the editor
    /// still plays (visually) on a machine with no sound.
    pub fn open() -> Audio {
        let (engine, backend, device_error) = match Engine::start_cpal() {
            Ok(e) => (e, "cpal", None),
            Err(e) => (Engine::start_null(48_000), "null", Some(e.to_string())),
        };
        Self::from_engine(engine, backend, device_error)
    }

    fn from_engine(engine: Engine, backend: &'static str, device_error: Option<String>) -> Audio {
        let cache = SampleCache::new(engine.rate());
        Audio {
            engine,
            backend,
            device_error,
            cache,
            bank: Mutex::default(),
            peaks: Mutex::default(),
        }
    }

    pub fn info(&self) -> AudioInfo {
        AudioInfo {
            rate: self.engine.rate(),
            backend: self.backend,
            device_error: self.device_error.clone(),
        }
    }

    /// Decode (or re-decode, if changed) and give each file its id.
    pub fn load(&self, paths: &[PathBuf]) -> Vec<Loaded> {
        let results = self.cache.load_many(paths);
        let mut bank = self.bank.lock().unwrap();
        paths
            .iter()
            .zip(results)
            .map(|(p, r)| match r {
                Ok(s) => {
                    let id = match bank.ids.get(p) {
                        Some(&id) => {
                            bank.samples[id as usize] = s.clone();
                            id
                        }
                        None => {
                            let id = bank.samples.len() as u32;
                            bank.samples.push(s.clone());
                            bank.ids.insert(p.clone(), id);
                            id
                        }
                    };
                    Loaded {
                        path: p.to_string_lossy().into_owned(),
                        id: Some(id),
                        frames: s.frames() as u64,
                        channels: s.channels,
                        seconds: s.seconds(),
                        error: None,
                    }
                }
                Err(e) => Loaded {
                    path: p.to_string_lossy().into_owned(),
                    id: None,
                    frames: 0,
                    channels: 0,
                    seconds: 0.0,
                    error: Some(e.to_string()),
                },
            })
            .collect()
    }

    fn sample(&self, id: u32) -> CmdResult<Arc<Sample>> {
        self.bank
            .lock()
            .unwrap()
            .samples
            .get(id as usize)
            .cloned()
            .ok_or_else(|| CmdError::Invalid(format!("no sample {id}")))
    }

    /// The sample's waveform mipmap, built once per decoded sample.
    fn peaks_of(&self, id: u32) -> CmdResult<Arc<Peaks>> {
        let s = self.sample(id)?;
        if let Some((w, p)) = self.peaks.lock().unwrap().get(&id) {
            if w.upgrade().is_some_and(|cur| Arc::ptr_eq(&cur, &s)) {
                return Ok(p.clone());
            }
        }
        let p = Arc::new(Peaks::build(&s, PEAK_BASE));
        self.peaks.lock().unwrap().insert(id, (Arc::downgrade(&s), p.clone()));
        Ok(p)
    }

    /// Waveform overview: `[min, max]` pairs as i16, the mip level nearest
    /// `frames_per_px`, flattened little-endian for a zero-copy JS Int16Array.
    pub fn peaks(&self, id: u32, frames_per_px: f64) -> CmdResult<Vec<u8>> {
        let p = self.peaks_of(id)?;
        let level = &p.levels[p.level_for(frames_per_px)];
        let mut out = Vec::with_capacity(level.len() * 4);
        for [lo, hi] in level {
            out.extend_from_slice(&lo.to_le_bytes());
            out.extend_from_slice(&hi.to_le_bytes());
        }
        Ok(out)
    }

    /// Thumbnails for many samples at once: `width` `[min, max]` pairs per
    /// id, in order, as little-endian i16 (all zero for an unknown id).
    /// Missing mipmaps are built on every core - the keysound workbench asks
    /// for a screenful of sounds at a time.
    pub fn thumbs(&self, ids: &[u32], width: usize) -> Vec<u8> {
        let threads = std::thread::available_parallelism().map_or(4, |n| n.get());
        let chunk = ids.len().div_ceil(threads).max(1);
        let built: Vec<Option<Arc<Peaks>>> = std::thread::scope(|scope| {
            let jobs: Vec<_> = ids
                .chunks(chunk)
                .map(|part| {
                    let job = scope.spawn(move || {
                        part.iter().map(|&id| self.peaks_of(id).ok()).collect::<Vec<_>>()
                    });
                    (part.len(), job)
                })
                .collect();
            // A failed part still takes its places, so every id keeps its slot.
            jobs.into_iter().flat_map(|(n, j)| j.join().unwrap_or_else(|_| vec![None; n])).collect()
        });
        let mut out = Vec::with_capacity(ids.len() * width * 4);
        for p in built {
            match p {
                Some(p) => {
                    for [lo, hi] in p.overview(width) {
                        out.extend_from_slice(&lo.to_le_bytes());
                        out.extend_from_slice(&hi.to_le_bytes());
                    }
                }
                None => out.resize(out.len() + width * 4, 0),
            }
        }
        out
    }

    pub fn set_events(&self, events: &[EventDto]) -> CmdResult<()> {
        self.engine.set_schedule(Arc::new(self.schedule_of(events)?))?;
        Ok(())
    }

    /// Events over the loaded samples (their `sample` is a bank id).
    fn schedule_of(&self, events: &[EventDto]) -> CmdResult<Schedule> {
        let samples = self.bank.lock().unwrap().samples.clone();
        let specs: Vec<EventSpec> = events.iter().map(EventDto::spec).collect();
        Ok(Schedule::from_specs(self.engine.rate(), samples, &specs)?)
    }

    /// The song's first `end_ms` of loudness, `width` [min, max] i16 pairs
    /// (little-endian bytes), for picking the preview's window.
    pub fn preview_overview(
        &self,
        events: &[EventDto],
        end_ms: f64,
        width: usize,
    ) -> CmdResult<Vec<u8>> {
        // Ten minutes at most: a longer render would only stall the picker.
        let frames = frame_at_ms(end_ms.clamp(0.0, 600_000.0), self.engine.rate()) as usize;
        let o = preview::overview(Arc::new(self.schedule_of(events)?), frames, width)?;
        Ok(o.iter().flat_map(|v| v.to_le_bytes()).collect())
    }

    /// Render the preview at the device rate - `events` over the loaded
    /// samples, or `file` - and keep it in the bank to be triggered on
    /// PREVIEW_VOICE.
    pub fn preview(&self, job: &PreviewJob) -> CmdResult<Audition> {
        let rate = self.engine.rate();
        let (from, frames, fade) = preview_frames(job, rate);
        let pcm = match &job.file {
            Some(file) => {
                let s = self.cache.get(Path::new(file))?;
                preview::from_sample(&s, from, frames, fade)
            }
            None => preview::render(Arc::new(self.schedule_of(&job.events)?), from, frames, fade)?,
        };
        let s = Arc::new(Sample::from_pcm16(rate, 2, &pcm));
        let key = PathBuf::from(PREVIEW_KEY);
        let mut bank = self.bank.lock().unwrap();
        let id = match bank.ids.get(&key) {
            Some(&id) => {
                bank.samples[id as usize] = s.clone();
                id
            }
            None => {
                let id = bank.samples.len() as u32;
                bank.samples.push(s.clone());
                bank.ids.insert(key, id);
                id
            }
        };
        Ok(Audition { sample: id, seconds: s.seconds(), voice: PREVIEW_VOICE })
    }

    pub fn trigger(&self, t: &TriggerDto) -> CmdResult<bool> {
        let rate = self.engine.rate();
        let s = self.sample(t.sample)?;
        let pos = frame_at_ms(t.offset_ms, rate);
        let to = t.until_ms.map_or(s.frames() as u64, |u| frame_at_ms(u, rate));
        let (gain_l, gain_r) = ds_gains(t.level, t.pan);
        Ok(self.engine.trigger(VoiceStart {
            sample: t.sample,
            pos,
            to,
            key: t.voice,
            gain_l,
            gain_r,
        }))
    }

    pub fn clock(&self) -> ClockDto {
        let c = self.engine.clock();
        ClockDto {
            frame: c.frame,
            host_ns: c.host_ns,
            latency_frames: c.latency_frames,
            rate: c.rate,
            playing: c.playing,
            generation: c.generation,
            now_ns: self.engine.now_ns(),
        }
    }

    pub fn frame_at_ms(&self, ms: f64) -> u64 {
        frame_at_ms(ms, self.engine.rate())
    }
}

/// Decoded at 44.1 kHz for cutting published keysounds (not the device rate).
pub fn publish_cache() -> SampleCache {
    SampleCache::new(ez2bms_audio::cut::PUBLISH_RATE)
}

pub fn resolve(base: &Path, rel: &str) -> PathBuf {
    let p = Path::new(rel);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        base.join(rel)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The shapes apps/editor/src/bridge/types.ts sends; field names must match.
    #[test]
    fn the_front_end_shapes_deserialize() {
        let e: EventDto = serde_json::from_value(serde_json::json!({
            "ms": 400.5, "origin_ms": 0.0, "until_ms": null, "sample": 3, "voice": 7, "level": -120, "pan": 0
        }))
        .unwrap();
        assert_eq!((e.sample, e.voice, e.level, e.until_ms), (3, 7, -120, None));
        let t: TriggerDto = serde_json::from_value(
            serde_json::json!({ "sample": 1, "voice": 65791, "offset_ms": 0, "until_ms": null }),
        )
        .unwrap();
        assert_eq!((t.sample, t.voice, t.level, t.pan), (1, 65791, 0, 0));
        let c = serde_json::to_value(ClockDto {
            frame: 1,
            host_ns: 2,
            latency_frames: 3,
            rate: 48000,
            playing: true,
            generation: 4,
            now_ns: 5,
        })
        .unwrap();
        for k in ["frame", "host_ns", "latency_frames", "rate", "playing", "generation", "now_ns"] {
            assert!(c.get(k).is_some(), "{k}");
        }
    }

    #[test]
    fn thumbnails_come_back_in_order_and_follow_a_reloaded_file() {
        let dir = std::env::temp_dir().join(format!("ez2bms-thumbs-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let wav = |path: &Path, loud: i16| {
            let pcm: Vec<i16> = (0..4800).map(|i| if i % 2 == 0 { loud } else { -loud }).collect();
            std::fs::write(path, ez2bms_audio::wav::encode_pcm16(1, 48_000, &pcm)).unwrap();
        };
        let (a, b) = (dir.join("a.wav"), dir.join("b.wav"));
        wav(&a, 16_000);
        wav(&b, 4_000);
        let audio = Audio::from_engine(Engine::start_null(48_000), "null", None);
        let ids: Vec<u32> = audio.load(&[a.clone(), b]).iter().map(|l| l.id.unwrap()).collect();
        let pairs = |bytes: &[u8]| -> Vec<i16> {
            bytes.chunks(2).map(|c| i16::from_le_bytes([c[0], c[1]])).collect()
        };
        let t = pairs(&audio.thumbs(&[ids[0], 999, ids[1]], 8));
        assert_eq!(t.len(), 3 * 8 * 2);
        assert!(t[1] > 15_000, "the loud file first");
        assert!(t[16..32].iter().all(|&v| v == 0), "an unknown id is blank");
        assert!(t[33] < 5_000 && t[33] > 3_000, "the quiet file third");
        // Same file again: the cached mipmap. Changed file: a new one.
        assert_eq!(pairs(&audio.thumbs(&[ids[0]], 8)), t[..16].to_vec());
        std::thread::sleep(std::time::Duration::from_millis(20));
        wav(&a, 1_000);
        audio.load(std::slice::from_ref(&a));
        let after = pairs(&audio.thumbs(&[ids[0]], 8));
        assert!(after[1] < 2_000, "reloaded: {:?}", &after[..2]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
