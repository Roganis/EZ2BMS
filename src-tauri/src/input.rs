//! Game controllers for the editor (crates/ez2bms-input): which pads are
//! open, their events on the audio engine's clock, and when they are open.
//!
//! Pads are open only while the editor asks (test play, recording, the
//! Controls dialog, step input) and never while an EZ2PORT test run is live:
//! on Windows SDL opens a board like the cabinet bridge through DirectInput,
//! exclusively, so a pad held here is a pad the game cannot read.

use std::sync::{Arc, Mutex};

use ez2bms_input::sdl::{Clock, Pads, Sink};
use ez2bms_input::PadInfo;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct InputInfo {
    pub devices: Vec<PadInfo>,
    /// Pads are open.
    pub active: bool,
    /// SDL's joystick layer did not start: keyboard only.
    pub error: Option<String>,
}

#[derive(Default)]
struct Hold {
    /// The editor wants pads (one flag: the page counts its own users, and a
    /// reloaded page sends its state again rather than leaking a count).
    wanted: bool,
    /// Test runs in flight.
    paused: u32,
    active: bool,
}

impl Hold {
    fn open(&self) -> bool {
        self.wanted && self.paused == 0
    }
}

pub struct Input {
    pads: Option<Pads>,
    error: Option<String>,
    hold: Mutex<Hold>,
}

impl Input {
    /// Start SDL's joystick thread with events carried onto `clock`; on
    /// failure the editor runs keyboard-only and says why.
    pub fn start(clock: Clock) -> Input {
        let (pads, error) = match Pads::start(clock) {
            Ok(p) => (Some(p), None),
            Err(e) => (None, Some(e)),
        };
        Input { pads, error, hold: Mutex::default() }
    }

    pub fn info(&self) -> InputInfo {
        InputInfo {
            devices: self.pads.as_ref().map(Pads::devices).unwrap_or_default(),
            active: self.hold.lock().unwrap().active,
            error: self.error.clone(),
        }
    }

    /// Where events go; a new stream (a reloaded page) replaces the last.
    pub fn stream(&self, sink: Sink) {
        if let Some(p) = &self.pads {
            p.set_sink(Some(sink));
        }
    }

    /// Whether the editor wants pads open.
    pub fn want(&self, on: bool) {
        self.change(|h| h.wanted = on);
    }

    /// A test run starts (true) or ends (false): pads close for its length.
    pub fn pause(&self, on: bool) {
        self.change(|h| h.paused = if on { h.paused + 1 } else { h.paused.saturating_sub(1) });
    }

    /// Returns once the pads are open or closed, so a test run starts with
    /// them released. The lock is held throughout: two changes never race.
    fn change(&self, f: impl FnOnce(&mut Hold)) {
        let mut h = self.hold.lock().unwrap();
        f(&mut h);
        let open = h.open();
        if open != h.active {
            if let Some(p) = &self.pads {
                p.set_active(open);
            }
            h.active = open;
        }
    }
}

/// Close the pads for a test run's length: pause now, resume when dropped.
pub struct Paused(pub Arc<Input>);

impl Paused {
    pub fn new(input: Arc<Input>) -> Paused {
        input.pause(true);
        Paused(input)
    }
}

impl Drop for Paused {
    fn drop(&mut self) {
        self.0.pause(false);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pads_open_when_wanted_and_close_for_test_runs() {
        let input = Arc::new(Input::start(Arc::new(|| 0)));
        if let Some(e) = &input.error {
            panic!("SDL did not start: {e}");
        }
        assert!(!input.info().active);
        input.want(true);
        assert!(input.info().active);
        {
            let _a = Paused::new(input.clone());
            let _b = Paused::new(input.clone());
            assert!(!input.info().active);
            drop(_a);
            assert!(!input.info().active, "one run still live");
        }
        assert!(input.info().active);
        input.want(false);
        assert!(!input.info().active);
        // A run while nothing wants pads leaves them closed after.
        drop(Paused::new(input.clone()));
        assert!(!input.info().active);
    }

    #[test]
    fn info_serializes_for_the_front_end() {
        let info = InputInfo {
            devices: vec![PadInfo {
                key: "0810:e501".into(),
                name: "bridge".into(),
                vid: 0x0810,
                pid: 0xe501,
                buttons: 25,
                axes: 2,
                hats: 0,
            }],
            active: true,
            error: None,
        };
        let v = serde_json::to_value(&info).unwrap();
        assert_eq!(v["devices"][0]["key"], "0810:e501");
        assert_eq!(v["active"], true);
        assert!(v["error"].is_null());
    }
}
