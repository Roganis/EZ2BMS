//! The engine: a control side any thread may call, and a [`Renderer`] owned by
//! the audio thread.
//!
//! The two meet in three lock-free places:
//! - the transport (schedule, play/stop/seek, voices to resume), swapped whole
//!   with `arc-swap` and noticed at the start of the next buffer;
//! - a ring of immediate sounds (auditions, test-play presses);
//! - the clock, published once per buffer.
//!
//! Nothing the audio thread drops is ever the last reference: the control side
//! keeps every retired transport until the audio thread has let go of it, so
//! freeing memory never happens in the callback.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use arc_swap::{ArcSwap, Guard};

use crate::clock::{Clock, ClockSnapshot};
use crate::error::{AudioError, Result};
use crate::level::output_stage;
use crate::mixer::Mixer;
use crate::schedule::{Schedule, VoiceStart};

const TRIGGER_RING: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Cue {
    /// New schedule, same position and voices.
    Keep,
    /// Silence everything and continue from this frame.
    Jump(u64),
    /// Silence everything, stay put.
    Halt,
}

#[derive(Debug)]
struct Transport {
    generation: u64,
    schedule: Arc<Schedule>,
    playing: bool,
    cue: Cue,
    resume: Vec<VoiceStart>,
}

struct Shared {
    transport: ArcSwap<Transport>,
    clock: Clock,
    master: AtomicU32,
    dropped: AtomicU64,
    epoch: Instant,
}

impl Shared {
    fn now_ns(&self) -> u64 {
        self.epoch.elapsed().as_nanos() as u64
    }
}

/// The audio thread's half. `render` never allocates, locks or frees.
pub struct Renderer {
    shared: Arc<Shared>,
    current: Arc<Transport>,
    mixer: Mixer,
    pos: u64,
    next: usize,
    playing: bool,
    triggers: rtrb::Consumer<VoiceStart>,
    callbacks: u64,
    rate: u32,
    /// Apply EZ2PORT's output stage (master gain, soft knee, clamp).
    pub limiter: bool,
}

impl Renderer {
    /// Fill `out` (interleaved stereo) with the next `out.len() / 2` frames.
    pub fn render(&mut self, out: &mut [f32], latency_frames: u32) {
        let host_ns = self.shared.now_ns();
        self.sync_transport();
        self.callbacks += 1;
        self.shared.clock.publish(&ClockSnapshot {
            frame: self.pos,
            host_ns,
            latency_frames,
            rate: self.rate,
            playing: self.playing,
            generation: self.current.generation,
            callbacks: self.callbacks,
        });
        out.fill(0.0);
        let frames = out.len() / 2;
        let schedule = &self.current.schedule;
        let samples = schedule.samples();
        while let Ok(mut v) = self.triggers.pop() {
            if let Some(s) = samples.get(v.sample as usize) {
                v.to = v.to.min(s.frames() as u64);
                self.mixer.start(v);
            }
        }
        if self.playing {
            let end = self.pos + frames as u64;
            let events = schedule.events();
            let mut cursor = 0;
            while let Some(e) = events.get(self.next).filter(|e| e.at < end) {
                let off = e.at.saturating_sub(self.pos) as usize;
                if off > cursor {
                    self.mixer.mix(samples, out, cursor, off);
                    cursor = off;
                }
                self.mixer.start(e.voice(0));
                self.next += 1;
            }
            self.mixer.mix(samples, out, cursor, frames);
            self.pos = end;
        } else {
            self.mixer.mix(samples, out, 0, frames);
        }
        self.shared.dropped.store(self.mixer.dropped, Ordering::Relaxed);
        if self.limiter {
            output_stage(out, f32::from_bits(self.shared.master.load(Ordering::Relaxed)));
        }
    }

    fn sync_transport(&mut self) {
        let g = self.shared.transport.load();
        if g.generation == self.current.generation {
            return;
        }
        let t = Guard::into_inner(g);
        match t.cue {
            Cue::Keep => self.mixer.retain_samples(t.schedule.samples().len()),
            Cue::Halt => self.mixer.clear(),
            Cue::Jump(f) => {
                self.mixer.clear();
                self.pos = f;
                for v in &t.resume {
                    self.mixer.start(*v);
                }
            }
        }
        self.next = t.schedule.first_at_or_after(self.pos);
        self.playing = t.playing;
        self.current = t;
    }

    pub fn rate_hz(&self) -> u32 {
        self.rate
    }

    /// Timeline position of the next frame to render.
    pub fn position(&self) -> u64 {
        self.pos
    }

    pub fn active_voices(&self) -> usize {
        self.mixer.active()
    }
}

struct Control {
    generation: u64,
    schedule: Arc<Schedule>,
    playing: bool,
    retired: Vec<Arc<Transport>>,
}

/// The control half: cheap to call from any thread.
pub struct Engine {
    shared: Arc<Shared>,
    ctl: Mutex<Control>,
    triggers: Mutex<rtrb::Producer<VoiceStart>>,
    rate: u32,
    /// Behind a mutex only so the engine is `Sync` whatever the backend is.
    backend: Mutex<Option<Box<dyn Send>>>,
}

// Commands on any thread share one engine.
const _: () = {
    const fn shared<T: Send + Sync>() {}
    shared::<Engine>();
};

impl Engine {
    /// An engine and its renderer, for a backend (or a test) to drive.
    pub fn with_renderer(rate: u32) -> (Engine, Renderer) {
        let schedule = Arc::new(Schedule::empty(rate));
        let first = Arc::new(Transport {
            generation: 0,
            schedule: schedule.clone(),
            playing: false,
            cue: Cue::Halt,
            resume: Vec::new(),
        });
        let shared = Arc::new(Shared {
            transport: ArcSwap::new(first.clone()),
            clock: Clock::default(),
            master: AtomicU32::new(1.0f32.to_bits()),
            dropped: AtomicU64::new(0),
            epoch: Instant::now(),
        });
        let (tx, rx) = rtrb::RingBuffer::new(TRIGGER_RING);
        let renderer = Renderer {
            shared: shared.clone(),
            current: first,
            mixer: Mixer::new(),
            pos: 0,
            next: 0,
            playing: false,
            triggers: rx,
            callbacks: 0,
            rate,
            limiter: true,
        };
        let engine = Engine {
            shared,
            ctl: Mutex::new(Control {
                generation: 0,
                schedule,
                playing: false,
                retired: Vec::new(),
            }),
            triggers: Mutex::new(tx),
            rate,
            backend: Mutex::new(None),
        };
        (engine, renderer)
    }

    /// Keep a backend alive for as long as the engine (dropping it stops output).
    pub fn attach_backend(&mut self, backend: Box<dyn Send>) {
        *self.backend.get_mut().unwrap() = Some(backend);
    }

    /// Output to nowhere in real time: a working clock without a device.
    pub fn start_null(rate: u32) -> Engine {
        let (mut engine, renderer) = Engine::with_renderer(rate);
        engine.attach_backend(Box::new(crate::backend::null::NullBackend::spawn(renderer, 256)));
        engine
    }

    /// The system's default output device.
    #[cfg(feature = "cpal")]
    pub fn start_cpal() -> Result<Engine> {
        crate::backend::cpal_backend::start()
    }

    pub fn rate(&self) -> u32 {
        self.rate
    }

    pub fn has_backend(&self) -> bool {
        self.backend.lock().unwrap().is_some()
    }

    fn publish(&self, ctl: &mut Control, cue: Cue, resume: Vec<VoiceStart>) {
        ctl.generation += 1;
        let t = Arc::new(Transport {
            generation: ctl.generation,
            schedule: ctl.schedule.clone(),
            playing: ctl.playing,
            cue,
            resume,
        });
        let old = self.shared.transport.swap(t);
        ctl.retired.push(old);
        ctl.retired.retain(|t| Arc::strong_count(t) > 1);
    }

    /// Replace what is playing. While playing, position and sounding voices
    /// carry on (sample ids must be stable across edits).
    pub fn set_schedule(&self, schedule: Arc<Schedule>) -> Result<()> {
        if schedule.rate() != self.rate {
            return Err(AudioError::Schedule(format!(
                "a {} Hz schedule for a {} Hz engine",
                schedule.rate(),
                self.rate
            )));
        }
        let mut ctl = self.ctl.lock().unwrap();
        ctl.schedule = schedule;
        self.publish(&mut ctl, Cue::Keep, Vec::new());
        Ok(())
    }

    pub fn schedule(&self) -> Arc<Schedule> {
        self.ctl.lock().unwrap().schedule.clone()
    }

    /// Play from a timeline frame, picking up every sound already under way.
    pub fn play_from(&self, frame: u64) {
        let mut ctl = self.ctl.lock().unwrap();
        let resume = ctl.schedule.resume_at(frame);
        ctl.playing = true;
        self.publish(&mut ctl, Cue::Jump(frame), resume);
    }

    /// Move without playing.
    pub fn seek(&self, frame: u64) {
        let mut ctl = self.ctl.lock().unwrap();
        ctl.playing = false;
        self.publish(&mut ctl, Cue::Jump(frame), Vec::new());
    }

    pub fn stop(&self) {
        let mut ctl = self.ctl.lock().unwrap();
        ctl.playing = false;
        self.publish(&mut ctl, Cue::Halt, Vec::new());
    }

    /// Sound something now, on top of the timeline (an audition, a press).
    /// False when the ring is full.
    pub fn trigger(&self, v: VoiceStart) -> bool {
        self.triggers.lock().unwrap().push(v).is_ok()
    }

    pub fn clock(&self) -> ClockSnapshot {
        self.shared.clock.read()
    }

    /// Host time on the clock's own scale.
    pub fn now_ns(&self) -> u64 {
        self.shared.now_ns()
    }

    pub fn set_master(&self, gain: f32) {
        self.shared.master.store(gain.max(0.0).to_bits(), Ordering::Relaxed);
    }

    /// Sounds refused so far because all voices were busy.
    pub fn dropped_voices(&self) -> u64 {
        self.shared.dropped.load(Ordering::Relaxed)
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        // Stop the backend (and its audio thread) before the shared state goes.
        self.backend.get_mut().unwrap().take();
    }
}
