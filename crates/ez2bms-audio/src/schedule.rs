//! What the engine plays: a bank of samples and timed events, each on a voice.
//!
//! Voices carry EZ2PORT's rule. A sound started on a voice that is already
//! sounding CUTS it and restarts there: every keysound has its own voice
//! (backing and autoplay), and every lane has one for presses. [`NO_CHOKE`]
//! layers freely (BMS preview rules, auditioning).
//!
//! A schedule is immutable and built off the audio thread; the engine swaps
//! whole schedules in.

use std::collections::HashMap;
use std::sync::Arc;

use crate::error::{AudioError, Result};
use crate::sample::Sample;

pub type VoiceKey = u32;

/// A voice nothing else shares: never cut, never cuts.
pub const NO_CHOKE: VoiceKey = u32::MAX;
/// Keysound voices are `0..LANE_VOICE_BASE`; lane voices follow.
pub const LANE_VOICE_BASE: VoiceKey = 1 << 16;
pub const MAX_VOICE_KEYS: usize = (1 << 16) + 256;

/// The voice of a keysound (EZ2PORT's per-sample voice).
pub fn keysound_voice(keysound: u32) -> VoiceKey {
    assert!(keysound < LANE_VOICE_BASE, "keysound index out of range");
    keysound
}

/// The voice of a lane (EZ2PORT's per-lane press channel).
pub fn lane_voice(lane: u32) -> VoiceKey {
    assert!(lane < 256, "lane out of range");
    LANE_VOICE_BASE + lane
}

/// A sound that is (or will be) playing: `sample` frames `[pos, to)`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VoiceStart {
    pub sample: u32,
    pub pos: u64,
    pub to: u64,
    pub key: VoiceKey,
    pub gain_l: f32,
    pub gain_r: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Event {
    /// Timeline frame the sound starts on.
    pub at: u64,
    pub sample: u32,
    /// The part of the sample it plays, `[from, to)`.
    pub from: u64,
    pub to: u64,
    pub key: VoiceKey,
    pub gain_l: f32,
    pub gain_r: f32,
}

impl Event {
    pub fn len(&self) -> u64 {
        self.to - self.from
    }

    pub fn is_empty(&self) -> bool {
        self.to <= self.from
    }

    /// The voice as it stands `into` frames after the event started.
    pub fn voice(&self, into: u64) -> VoiceStart {
        VoiceStart {
            sample: self.sample,
            pos: (self.from + into).min(self.to),
            to: self.to,
            key: self.key,
            gain_l: self.gain_l,
            gain_r: self.gain_r,
        }
    }
}

/// An event as chart-core describes it, all in song milliseconds: when it
/// starts, when the sample it plays from would have started (its fresh hit:
/// equal to `ms` for a whole sample, earlier for a slice), and where the slice
/// ends (the next note on its channel; None plays out).
///
/// Slice bounds are derived from the same frame positions as the event times,
/// so at ANY device rate a slice ends on exactly the frame its continuation
/// starts: a chain of slices plays gapless, like the uncut sample.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EventSpec {
    pub ms: f64,
    pub origin_ms: f64,
    pub end_ms: Option<f64>,
    pub sample: u32,
    pub key: VoiceKey,
    /// DirectSound level (hundredths of a dB) and pan (-10000..10000).
    pub level: i32,
    pub pan: i32,
}

/// Song milliseconds to a timeline frame (nearest).
pub fn frame_at_ms(ms: f64, rate: u32) -> u64 {
    (ms * rate as f64 / 1000.0).round().max(0.0) as u64
}

#[derive(Debug)]
pub struct Schedule {
    rate: u32,
    samples: Vec<Arc<Sample>>,
    events: Vec<Event>,
    end: u64,
}

impl Schedule {
    pub fn empty(rate: u32) -> Self {
        Schedule { rate, samples: Vec::new(), events: Vec::new(), end: 0 }
    }

    /// Events are sorted by start (stably: of two on one voice at one frame,
    /// the later one given wins). Ranges are clamped to their sample.
    pub fn new(rate: u32, samples: Vec<Arc<Sample>>, mut events: Vec<Event>) -> Result<Self> {
        if let Some(s) = samples.iter().find(|s| s.rate != rate) {
            return Err(AudioError::Schedule(format!(
                "a {} Hz sample in a {rate} Hz schedule",
                s.rate
            )));
        }
        for e in &mut events {
            let s = samples.get(e.sample as usize).ok_or_else(|| {
                AudioError::Schedule(format!(
                    "event names sample {} of {}",
                    e.sample,
                    samples.len()
                ))
            })?;
            if e.key != NO_CHOKE && e.key as usize >= MAX_VOICE_KEYS {
                return Err(AudioError::Schedule(format!("voice {} out of range", e.key)));
            }
            let n = s.frames() as u64;
            e.to = e.to.min(n);
            e.from = e.from.min(e.to);
        }
        events.sort_by_key(|e| e.at);
        let end = events.iter().map(|e| e.at + e.len()).max().unwrap_or(0);
        Ok(Schedule { rate, samples, events, end })
    }

    /// From chart-core's description (see [`EventSpec`]).
    pub fn from_specs(rate: u32, samples: Vec<Arc<Sample>>, specs: &[EventSpec]) -> Result<Self> {
        let events = specs
            .iter()
            .map(|s| {
                let (gain_l, gain_r) = crate::level::ds_gains(s.level, s.pan);
                let at = frame_at_ms(s.ms, rate);
                let origin = frame_at_ms(s.origin_ms, rate).min(at);
                Event {
                    at,
                    sample: s.sample,
                    from: at - origin,
                    to: s.end_ms.map_or(u64::MAX, |e| frame_at_ms(e, rate).saturating_sub(origin)),
                    key: s.key,
                    gain_l,
                    gain_r,
                }
            })
            .collect();
        Schedule::new(rate, samples, events)
    }

    pub fn rate(&self) -> u32 {
        self.rate
    }

    pub fn samples(&self) -> &[Arc<Sample>] {
        &self.samples
    }

    pub fn events(&self) -> &[Event] {
        &self.events
    }

    /// The frame the last sound ends on.
    pub fn end(&self) -> u64 {
        self.end
    }

    /// Index of the first event starting at or after `frame`.
    pub fn first_at_or_after(&self, frame: u64) -> usize {
        self.events.partition_point(|e| e.at < frame)
    }

    /// Everything still sounding at `frame`, each picked up mid-sample where
    /// it would be had playback started earlier - voice cuts included.
    pub fn resume_at(&self, frame: u64) -> Vec<VoiceStart> {
        let before = &self.events[..self.first_at_or_after(frame)];
        let mut last_on: HashMap<VoiceKey, usize> = HashMap::new();
        let mut alive: Vec<usize> = Vec::new();
        for (i, e) in before.iter().enumerate() {
            if e.key == NO_CHOKE {
                if e.at + e.len() > frame {
                    alive.push(i);
                }
            } else {
                last_on.insert(e.key, i);
            }
        }
        alive.extend(last_on.into_values().filter(|&i| before[i].at + before[i].len() > frame));
        alive.sort_unstable();
        alive.into_iter().map(|i| before[i].voice(frame - before[i].at)).collect()
    }
}
