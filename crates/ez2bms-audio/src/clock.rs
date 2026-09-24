//! The audio clock: what the device is playing, published once per callback
//! through a seqlock so any thread reads a consistent snapshot without ever
//! blocking the audio thread.

use std::sync::atomic::{fence, AtomicU64, Ordering};

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct ClockSnapshot {
    /// Timeline frame at the start of the buffer being rendered.
    pub frame: u64,
    /// Engine host time (ns since the engine started) when it was rendered.
    pub host_ns: u64,
    /// Frames between rendering and the speaker.
    pub latency_frames: u32,
    pub rate: u32,
    pub playing: bool,
    /// Bumped by every transport change (play, stop, seek, new schedule).
    pub generation: u64,
    pub callbacks: u64,
}

impl ClockSnapshot {
    /// The timeline frame being heard at host time `now_ns`.
    pub fn heard_frame_at(&self, now_ns: u64) -> f64 {
        if !self.playing {
            return self.frame as f64;
        }
        let dt = now_ns.saturating_sub(self.host_ns) as f64 * 1e-9;
        self.frame as f64 + dt * self.rate as f64 - self.latency_frames as f64
    }

    pub fn heard_ms_at(&self, now_ns: u64) -> f64 {
        self.heard_frame_at(now_ns) * 1000.0 / self.rate.max(1) as f64
    }
}

#[derive(Default)]
pub struct Clock {
    seq: AtomicU64,
    frame: AtomicU64,
    host_ns: AtomicU64,
    /// latency_frames | rate << 32
    meta: AtomicU64,
    /// playing | generation << 1
    state: AtomicU64,
    callbacks: AtomicU64,
}

impl Clock {
    /// Writer side: the audio thread only.
    pub fn publish(&self, s: &ClockSnapshot) {
        let seq = self.seq.load(Ordering::Relaxed);
        self.seq.store(seq.wrapping_add(1), Ordering::Relaxed);
        fence(Ordering::Release);
        self.frame.store(s.frame, Ordering::Relaxed);
        self.host_ns.store(s.host_ns, Ordering::Relaxed);
        self.meta.store(s.latency_frames as u64 | (s.rate as u64) << 32, Ordering::Relaxed);
        self.state.store(s.playing as u64 | s.generation << 1, Ordering::Relaxed);
        self.callbacks.store(s.callbacks, Ordering::Relaxed);
        self.seq.store(seq.wrapping_add(2), Ordering::Release);
    }

    pub fn read(&self) -> ClockSnapshot {
        loop {
            let s1 = self.seq.load(Ordering::Acquire);
            if s1 & 1 == 1 {
                std::hint::spin_loop();
                continue;
            }
            let frame = self.frame.load(Ordering::Relaxed);
            let host_ns = self.host_ns.load(Ordering::Relaxed);
            let meta = self.meta.load(Ordering::Relaxed);
            let state = self.state.load(Ordering::Relaxed);
            let callbacks = self.callbacks.load(Ordering::Relaxed);
            fence(Ordering::Acquire);
            if self.seq.load(Ordering::Relaxed) == s1 {
                return ClockSnapshot {
                    frame,
                    host_ns,
                    latency_frames: meta as u32,
                    rate: (meta >> 32) as u32,
                    playing: state & 1 == 1,
                    generation: state >> 1,
                    callbacks,
                };
            }
        }
    }
}
