//! The controller thread: SDL3's joystick layer, used as EZ2PORT uses it
//! (platform/common/ezpad.c), so a board has the same name, the same button,
//! hat and axis numbers and the same event times in both programs.
//!
//! - SDL wants init, event pumping and quit on ONE thread. Everything SDL
//!   runs on the thread `Pads::start` makes; other threads send it commands.
//! - Pads are open only while the editor needs them (`set_active`). On
//!   Windows SDL reads a board like the cabinet bridge through DirectInput,
//!   which opens it exclusively: a pad EZ2BMS holds open is a pad the game
//!   launched by F5 cannot read. Closed, nothing is pumped at all.
//! - Hints, set before init:
//!   - SDL_NO_SIGNAL_HANDLERS: SDL_INIT_JOYSTICK implies the event subsystem,
//!     which would otherwise take SIGINT/SIGTERM from the host process and
//!     turn them into a quit event nobody reads.
//!   - SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS: SDL drops pad events while it
//!     has windows and none is focused. This build has no video (the editor's
//!     window is the webview's), so it never does - the hint keeps that true
//!     if a later build turns video on.
//! - Waiting: without video SDL_WaitEventTimeout pumps every millisecond
//!   while a joystick is open (SDL_events.c EVENT_POLL_INTERVAL_NS), the
//!   rate EZ2PORT's frame loop can't beat; a press's time is SDL's stamp
//!   anyway, not when it was read (time.rs).

use std::ffi::CStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use sdl3_sys::error::SDL_GetError;
use sdl3_sys::events::*;
use sdl3_sys::hints::{
    SDL_SetHint, SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS, SDL_HINT_NO_SIGNAL_HANDLERS,
};
use sdl3_sys::init::{SDL_Init, SDL_Quit, SDL_INIT_JOYSTICK};
use sdl3_sys::joystick::*;
use sdl3_sys::stdinc::SDL_free;
use sdl3_sys::timer::SDL_GetTicksNS;

use crate::device::{clamp_count, count_same, key_for, pad_name, PadInfo};
use crate::device::{MAX_AXES, MAX_BUTTONS, MAX_HATS, MAX_PADS};
use crate::event::PadEvent;
use crate::time::ClockPair;

/// The host clock events are carried onto (the audio engine's `now_ns`).
pub type Clock = Arc<dyn Fn() -> u64 + Send + Sync>;
/// Where each batch of events goes.
pub type Sink = Arc<dyn Fn(Vec<PadEvent>) + Send + Sync>;

/// How long a wait for events may block before commands are looked at again.
const WAIT_MS: i32 = 4;

/// SDL is one per process: a second thread would share its state.
static RUNNING: AtomicBool = AtomicBool::new(false);

enum Cmd {
    Active(bool, Sender<()>),
    Run(Box<dyn FnOnce() + Send>),
    Stop,
}

#[derive(Default)]
struct Shared {
    devices: Mutex<Vec<PadInfo>>,
    sink: Mutex<Option<Sink>>,
}

impl Shared {
    fn emit(&self, events: Vec<PadEvent>) {
        let sink = self.sink.lock().unwrap().clone();
        if let Some(sink) = sink {
            sink(events);
        }
    }
}

/// The controller thread. Dropping it closes every pad and quits SDL.
pub struct Pads {
    tx: Sender<Cmd>,
    shared: Arc<Shared>,
    thread: Option<JoinHandle<()>>,
}

impl Pads {
    /// Start SDL's joystick subsystem on a thread of its own, pads closed.
    pub fn start(clock: Clock) -> Result<Pads, String> {
        if RUNNING.swap(true, Ordering::SeqCst) {
            return Err("the controller thread is already running".into());
        }
        let shared = Arc::new(Shared::default());
        let (tx, rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        let sh = shared.clone();
        let spawned = std::thread::Builder::new()
            .name("ez2bms-pads".into())
            .spawn(move || thread_main(clock, sh, rx, ready_tx));
        let thread = match spawned {
            Ok(t) => t,
            Err(e) => {
                RUNNING.store(false, Ordering::SeqCst);
                return Err(e.to_string());
            }
        };
        match ready_rx.recv() {
            Ok(Ok(())) => Ok(Pads { tx, shared, thread: Some(thread) }),
            Ok(Err(e)) => {
                let _ = thread.join();
                RUNNING.store(false, Ordering::SeqCst);
                Err(e)
            }
            Err(_) => {
                let _ = thread.join();
                RUNNING.store(false, Ordering::SeqCst);
                Err("the controller thread stopped while starting".into())
            }
        }
    }

    /// Where events go from now on (None: nowhere).
    pub fn set_sink(&self, sink: Option<Sink>) {
        *self.shared.sink.lock().unwrap() = sink;
    }

    /// Open every pad (a rescan) or close them all; returns once it is done,
    /// so a caller about to launch the game knows the pads are free.
    pub fn set_active(&self, on: bool) {
        let (ack_tx, ack_rx) = mpsc::channel();
        if self.tx.send(Cmd::Active(on, ack_tx)).is_ok() {
            let _ = ack_rx.recv();
        }
    }

    /// The pads open now, in SDL's order (empty while inactive).
    pub fn devices(&self) -> Vec<PadInfo> {
        self.shared.devices.lock().unwrap().clone()
    }

    /// Run `f` on SDL's thread between waits, and return what it returns
    /// (None if the thread has stopped). SDL calls must be made there.
    pub fn run<T: Send + 'static>(&self, f: impl FnOnce() -> T + Send + 'static) -> Option<T> {
        let (tx, rx) = mpsc::channel();
        let job: Box<dyn FnOnce() + Send> = Box::new(move || {
            let _ = tx.send(f());
        });
        self.tx.send(Cmd::Run(job)).ok()?;
        rx.recv().ok()
    }
}

impl Drop for Pads {
    fn drop(&mut self) {
        let _ = self.tx.send(Cmd::Stop);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
        RUNNING.store(false, Ordering::SeqCst);
    }
}

fn sdl_error() -> String {
    // SAFETY: SDL_GetError returns a valid NUL-terminated string (maybe empty).
    unsafe { CStr::from_ptr(SDL_GetError()) }.to_string_lossy().into_owned()
}

struct Pad {
    info: PadInfo,
    id: SDL_JoystickID,
    joy: *mut SDL_Joystick,
}

#[derive(Default)]
struct State {
    pads: Vec<Pad>,
    active: bool,
}

fn thread_main(
    clock: Clock,
    shared: Arc<Shared>,
    rx: Receiver<Cmd>,
    ready: Sender<Result<(), String>>,
) {
    // SAFETY: SDL is initialised, used and quit on this thread only.
    unsafe {
        SDL_SetHint(SDL_HINT_NO_SIGNAL_HANDLERS, c"1".as_ptr());
        SDL_SetHint(SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS, c"1".as_ptr());
        if !SDL_Init(SDL_INIT_JOYSTICK) {
            let _ = ready.send(Err(format!("SDL joystick init failed: {}", sdl_error())));
            return;
        }
    }
    let _ = ready.send(Ok(()));
    let mut st = State::default();
    loop {
        // Inactive, the thread sleeps on its commands; active, it looks at
        // them between waits for events.
        let cmd = if st.active {
            match rx.try_recv() {
                Ok(c) => Some(c),
                Err(TryRecvError::Empty) => None,
                Err(TryRecvError::Disconnected) => Some(Cmd::Stop),
            }
        } else {
            Some(rx.recv().unwrap_or(Cmd::Stop))
        };
        match cmd {
            Some(Cmd::Stop) => break,
            Some(Cmd::Active(on, ack)) => {
                st.set_active(on, &shared);
                let _ = ack.send(());
            }
            Some(Cmd::Run(f)) => f(),
            None => st.pump(&clock, &shared),
        }
    }
    st.close();
    // SAFETY: as above; every joystick is closed.
    unsafe { SDL_Quit() };
}

impl State {
    fn set_active(&mut self, on: bool, shared: &Shared) {
        if on == self.active {
            return;
        }
        self.active = on;
        if on {
            // SAFETY: SDL's thread. A pump notices boards plugged while the
            // thread slept; their queued ADDED events (and anything else
            // left over) are covered by the rescan, so they're dropped.
            unsafe {
                SDL_PumpEvents();
                SDL_FlushEvents(SDL_EVENT_FIRST.0, SDL_EVENT_LAST.0);
            }
            self.rescan();
        } else {
            self.close();
        }
        self.publish(shared, &mut Vec::new());
    }

    fn publish(&self, shared: &Shared, out: &mut Vec<PadEvent>) {
        let devices: Vec<PadInfo> = self.pads.iter().map(|p| p.info.clone()).collect();
        *shared.devices.lock().unwrap() = devices.clone();
        out.push(PadEvent::Devices { devices });
        shared.emit(std::mem::take(out));
    }

    fn close(&mut self) {
        for p in self.pads.drain(..) {
            // SAFETY: opened by rescan on this thread, closed once.
            unsafe { SDL_CloseJoystick(p.joy) };
        }
    }

    /// ezpad.c ezPadRescan: close everything, then open SDL's joysticks in
    /// its order, the first MAX_PADS that open, naming each by make.
    fn rescan(&mut self) {
        self.close();
        let mut count = 0;
        // SAFETY: SDL's thread; the id array is SDL's and freed here.
        unsafe {
            let ids = SDL_GetJoysticks(&mut count);
            if ids.is_null() {
                return;
            }
            let ids_slice = std::slice::from_raw_parts(ids, count.max(0) as usize);
            for &id in ids_slice {
                if self.pads.len() >= MAX_PADS {
                    break;
                }
                let joy = SDL_OpenJoystick(id);
                if joy.is_null() {
                    continue;
                }
                let vid = SDL_GetJoystickVendor(joy);
                let pid = SDL_GetJoystickProduct(joy);
                let seen = count_same(self.pads.iter().map(|p| p.info.key.as_str()), vid, pid);
                let key = key_for(vid, pid, seen);
                let nm = SDL_GetJoystickName(joy);
                let nm = (!nm.is_null()).then(|| CStr::from_ptr(nm).to_string_lossy().into_owned());
                let info = PadInfo {
                    name: pad_name(nm.as_deref(), &key),
                    key,
                    vid,
                    pid,
                    buttons: clamp_count(SDL_GetNumJoystickButtons(joy), MAX_BUTTONS),
                    axes: clamp_count(SDL_GetNumJoystickAxes(joy), MAX_AXES),
                    hats: clamp_count(SDL_GetNumJoystickHats(joy), MAX_HATS),
                };
                self.pads.push(Pad { info, id, joy });
            }
            SDL_free(ids.cast());
        }
    }

    fn key_of(&self, id: SDL_JoystickID) -> Option<String> {
        self.pads.iter().find(|p| p.id == id).map(|p| p.info.key.clone())
    }

    /// Wait for events; take every one queued, then read both clocks once
    /// and send the batch.
    fn pump(&mut self, clock: &Clock, shared: &Shared) {
        let mut batch = Vec::new();
        let mut ev = SDL_Event::default();
        // SAFETY: SDL's thread; SDL writes the event it returns.
        unsafe {
            if !SDL_WaitEventTimeout(&mut ev, WAIT_MS) {
                return;
            }
            batch.push(ev);
            while SDL_PollEvent(&mut ev) {
                batch.push(ev);
            }
        }
        // SAFETY: SDL's thread.
        let pair = ClockPair { sdl_ns: unsafe { SDL_GetTicksNS() }, host_ns: clock() };
        let mut out = Vec::new();
        for ev in &batch {
            self.handle(ev, pair, shared, &mut out);
        }
        if !out.is_empty() {
            shared.emit(out);
        }
    }

    /// ezpad.c ez2_pad_event, the SDL half: which device and which control.
    /// Indices at or past the port's limits are dropped, as it drops them.
    fn handle(
        &mut self,
        ev: &SDL_Event,
        pair: ClockPair,
        shared: &Shared,
        out: &mut Vec<PadEvent>,
    ) {
        // SAFETY: each union member is read only for its own event type.
        unsafe {
            let ty = SDL_EventType(ev.r#type);
            let host_ns = pair.host_at(ev.common.timestamp);
            if ty == SDL_EVENT_JOYSTICK_ADDED || ty == SDL_EVENT_JOYSTICK_REMOVED {
                // Hot-plug renumbers the `#n` suffixes, as it does in the
                // port. Held buttons are released by the Devices event.
                self.rescan();
                self.publish(shared, out);
            } else if ty == SDL_EVENT_JOYSTICK_BUTTON_DOWN || ty == SDL_EVENT_JOYSTICK_BUTTON_UP {
                let b = ev.jbutton;
                if let Some(device) = self.key_of(b.which) {
                    if (b.button as usize) < MAX_BUTTONS {
                        out.push(PadEvent::Button {
                            device,
                            index: b.button,
                            down: b.down,
                            host_ns,
                        });
                    }
                }
            } else if ty == SDL_EVENT_JOYSTICK_HAT_MOTION {
                let h = ev.jhat;
                if let Some(device) = self.key_of(h.which) {
                    if (h.hat as usize) < MAX_HATS {
                        out.push(PadEvent::Hat { device, index: h.hat, value: h.value, host_ns });
                    }
                }
            } else if ty == SDL_EVENT_JOYSTICK_AXIS_MOTION {
                let a = ev.jaxis;
                if let Some(device) = self.key_of(a.which) {
                    if (a.axis as usize) < MAX_AXES {
                        out.push(PadEvent::Axis { device, index: a.axis, value: a.value, host_ns });
                    }
                }
            }
        }
    }
}
