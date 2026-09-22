//! The app's audio: one engine (the default device, or a silent clock when
//! there is none), the samples it has loaded, and what it is playing.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use ez2bms_audio::cache::SampleCache;
use ez2bms_audio::level::ds_gains;
use ez2bms_audio::peaks::Peaks;
use ez2bms_audio::schedule::{frame_at_ms, EventSpec, VoiceKey};
use ez2bms_audio::{Engine, Sample, Schedule, VoiceStart};
use serde::{Deserialize, Serialize};

use crate::error::{CmdError, CmdResult};

pub struct Audio {
    pub engine: Engine,
    pub backend: &'static str,
    pub device_error: Option<String>,
    cache: SampleCache,
    bank: Mutex<Bank>,
}

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
        let cache = SampleCache::new(engine.rate());
        Audio { engine, backend, device_error, cache, bank: Mutex::default() }
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

    /// Waveform overview: `[min, max]` pairs as i16, the mip level nearest
    /// `frames_per_px`, flattened little-endian for a zero-copy JS Int16Array.
    pub fn peaks(&self, id: u32, frames_per_px: f64) -> CmdResult<Vec<u8>> {
        let p = Peaks::build(self.sample(id)?.as_ref(), 64);
        let level = &p.levels[p.level_for(frames_per_px)];
        let mut out = Vec::with_capacity(level.len() * 4);
        for [lo, hi] in level {
            out.extend_from_slice(&lo.to_le_bytes());
            out.extend_from_slice(&hi.to_le_bytes());
        }
        Ok(out)
    }

    pub fn set_events(&self, events: &[EventDto]) -> CmdResult<()> {
        let samples = self.bank.lock().unwrap().samples.clone();
        let specs: Vec<EventSpec> = events
            .iter()
            .map(|e| EventSpec {
                ms: e.ms,
                origin_ms: e.origin_ms,
                end_ms: e.until_ms,
                sample: e.sample,
                key: e.voice,
                level: e.level,
                pan: e.pan,
            })
            .collect();
        let schedule = Schedule::from_specs(self.engine.rate(), samples, &specs)?;
        self.engine.set_schedule(Arc::new(schedule))?;
        Ok(())
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
}
