//! The voice mixer: real-time safe (fixed storage, no allocation, no locks),
//! shared by live playback and offline rendering.

use std::sync::Arc;

use crate::sample::Sample;
use crate::schedule::{VoiceKey, VoiceStart, MAX_VOICE_KEYS, NO_CHOKE};

pub const MAX_VOICES: usize = 1024;

pub struct Mixer {
    voices: Vec<VoiceStart>,
    /// Voice key -> slot + 1 (0 = not sounding).
    slot: Vec<u16>,
    /// Sounds refused because every voice was busy.
    pub dropped: u64,
}

impl Default for Mixer {
    fn default() -> Self {
        Self::new()
    }
}

impl Mixer {
    pub fn new() -> Self {
        Mixer { voices: Vec::with_capacity(MAX_VOICES), slot: vec![0; MAX_VOICE_KEYS], dropped: 0 }
    }

    pub fn active(&self) -> usize {
        self.voices.len()
    }

    pub fn is_sounding(&self, key: VoiceKey) -> bool {
        key != NO_CHOKE && self.slot[key as usize] != 0
    }

    pub fn clear(&mut self) {
        for v in &self.voices {
            if v.key != NO_CHOKE {
                self.slot[v.key as usize] = 0;
            }
        }
        self.voices.clear();
    }

    /// Start a sound. On a voice that is sounding, it cuts that sound and
    /// takes its place (a zero-length one just cuts).
    pub fn start(&mut self, v: VoiceStart) {
        let live = v.pos < v.to;
        if v.key != NO_CHOKE {
            let s = self.slot[v.key as usize];
            if s != 0 {
                let i = s as usize - 1;
                if live {
                    self.voices[i] = v;
                } else {
                    self.remove(i);
                }
                return;
            }
        }
        if !live {
            return;
        }
        if self.voices.len() == MAX_VOICES {
            self.dropped += 1;
            return;
        }
        self.voices.push(v);
        if v.key != NO_CHOKE {
            self.slot[v.key as usize] = self.voices.len() as u16;
        }
    }

    fn remove(&mut self, i: usize) {
        let v = self.voices.swap_remove(i);
        if v.key != NO_CHOKE {
            self.slot[v.key as usize] = 0;
        }
        if let Some(moved) = self.voices.get(i) {
            if moved.key != NO_CHOKE {
                self.slot[moved.key as usize] = i as u16 + 1;
            }
        }
    }

    /// Drop voices naming samples past `count` (after a bank shrank).
    pub fn retain_samples(&mut self, count: usize) {
        let mut i = 0;
        while i < self.voices.len() {
            if self.voices[i].sample as usize >= count {
                self.remove(i);
            } else {
                i += 1;
            }
        }
    }

    /// Add every voice into frames `[from, to)` of `out` (interleaved stereo).
    pub fn mix(&mut self, samples: &[Arc<Sample>], out: &mut [f32], from: usize, to: usize) {
        if to <= from {
            return;
        }
        let mut i = 0;
        while i < self.voices.len() {
            let v = &mut self.voices[i];
            let Some(s) = samples.get(v.sample as usize) else {
                self.remove(i);
                continue;
            };
            let end = v.to.min(s.frames() as u64);
            let n = (end.saturating_sub(v.pos) as usize).min(to - from);
            let p = v.pos as usize;
            let dst = &mut out[2 * from..2 * (from + n)];
            let (gl, gr) = (v.gain_l, v.gain_r);
            if s.channels == 1 {
                for (o, &x) in dst.chunks_exact_mut(2).zip(&s.data[p..p + n]) {
                    o[0] += x * gl;
                    o[1] += x * gr;
                }
            } else {
                for (o, x) in
                    dst.chunks_exact_mut(2).zip(s.data[2 * p..2 * (p + n)].chunks_exact(2))
                {
                    o[0] += x[0] * gl;
                    o[1] += x[1] * gr;
                }
            }
            v.pos += n as u64;
            if v.pos >= end {
                self.remove(i);
            } else {
                i += 1;
            }
        }
    }
}
