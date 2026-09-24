//! The controller thread against SDL itself, with virtual joysticks (SDL's
//! own test devices, which go through the same event path as a real board):
//! naming by make with `#n`, the events and their times, closing. And the
//! scancode names chart-core carries, checked against SDL's.
//!
//! One test drives the thread: SDL is one per process.

#![cfg(feature = "sdl")]

use std::ffi::{CStr, CString};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use ez2bms_input::sdl::{Clock, Pads};
use ez2bms_input::{PadEvent, PadInfo};
use sdl3_sys::joystick::*;
use sdl3_sys::keyboard::SDL_GetScancodeName;
use sdl3_sys::scancode::SDL_Scancode;

/// Made-up makes, so a real pad on the machine never matches.
const MAKE_A: (u16, u16) = (0xeb01, 0x0001);
const MAKE_B: (u16, u16) = (0xeb02, 0x0002);

/// A board like the cabinet bridge: 25 buttons, two turntable axes, a hat.
unsafe fn attach(make: (u16, u16), name: &str) -> SDL_JoystickID {
    let name = CString::new(name).unwrap();
    let desc = SDL_VirtualJoystickDesc {
        r#type: SDL_JOYSTICK_TYPE_GAMEPAD.0 as u16,
        vendor_id: make.0,
        product_id: make.1,
        naxes: 2,
        nbuttons: 25,
        nhats: 1,
        name: name.as_ptr(),
        ..Default::default()
    };
    // SDL copies the name.
    let id = SDL_AttachVirtualJoystick(&desc);
    assert_ne!(id.0, 0, "virtual joystick not attached");
    id
}

fn wait_for<T>(what: &str, mut f: impl FnMut() -> Option<T>) -> T {
    let until = Instant::now() + Duration::from_secs(5);
    loop {
        if let Some(v) = f() {
            return v;
        }
        assert!(Instant::now() < until, "timed out waiting for {what}");
        std::thread::sleep(Duration::from_millis(2));
    }
}

fn ours(devs: Vec<PadInfo>) -> Vec<PadInfo> {
    devs.into_iter().filter(|p| (p.vid, p.pid) == MAKE_A || (p.vid, p.pid) == MAKE_B).collect()
}

#[test]
fn virtual_boards_are_named_like_the_port_and_stream_timed_events() {
    let epoch = Instant::now();
    let clock: Clock = Arc::new(move || epoch.elapsed().as_nanos() as u64);
    let pads = Pads::start(clock.clone()).expect("SDL joystick init");
    assert!(Pads::start(clock.clone()).is_err(), "SDL is one per process");

    let got: Arc<Mutex<Vec<PadEvent>>> = Arc::default();
    let sink = got.clone();
    pads.set_sink(Some(Arc::new(move |evs| sink.lock().unwrap().extend(evs))));

    // Closed: nothing is listed.
    assert!(ours(pads.devices()).is_empty());
    pads.set_active(true);

    // Two boards of one make and one of another, in this order.
    let ids = pads
        .run(|| unsafe {
            [
                attach(MAKE_A, "Bridge one"),
                attach(MAKE_B, "Other pad"),
                attach(MAKE_A, "Bridge two"),
            ]
        })
        .unwrap();
    let devs = wait_for("three boards", || {
        let d = ours(pads.devices());
        (d.len() == 3).then_some(d)
    });
    let keys: Vec<&str> = devs.iter().map(|p| p.key.as_str()).collect();
    assert_eq!(keys, ["eb01:0001", "eb02:0002", "eb01:0001#1"]);
    assert_eq!(devs[2].name, "Bridge two");
    assert_eq!((devs[2].buttons, devs[2].axes, devs[2].hats), (25, 2, 1));
    assert!(got.lock().unwrap().iter().any(|e| matches!(e, PadEvent::Devices { .. })));

    // Press, a hat, an axis and a release on the second board of make A,
    // each in its own update (SDL reports a virtual board's state per update,
    // so a press and release in one would cancel out).
    let before = clock();
    let second = ids[2];
    type Act = Box<dyn Fn(*mut SDL_Joystick) + Send>;
    type Want = fn(&PadEvent) -> bool;
    let acts: Vec<(Act, Want)> = vec![
        (
            Box::new(|j| unsafe {
                SDL_SetJoystickVirtualButton(j, 3, true);
            }),
            |e| matches!(e, PadEvent::Button { index: 3, down: true, .. }),
        ),
        (
            Box::new(|j| unsafe {
                SDL_SetJoystickVirtualHat(j, 0, 3);
            }),
            |e| matches!(e, PadEvent::Hat { index: 0, value: 3, .. }),
        ),
        (
            Box::new(|j| unsafe {
                SDL_SetJoystickVirtualAxis(j, 1, -20000);
            }),
            |e| matches!(e, PadEvent::Axis { index: 1, value: -20000, .. }),
        ),
        (
            Box::new(|j| unsafe {
                SDL_SetJoystickVirtualButton(j, 3, false);
            }),
            |e| matches!(e, PadEvent::Button { index: 3, down: false, .. }),
        ),
    ];
    let mut times = Vec::new();
    for (act, want) in acts {
        pads.run(move || {
            let j = unsafe { SDL_GetJoystickFromID(second) };
            assert!(!j.is_null(), "the board is open");
            act(j);
        })
        .unwrap();
        let ev = wait_for("an event", || got.lock().unwrap().iter().find(|e| want(e)).cloned());
        let (device, host_ns) = match &ev {
            PadEvent::Button { device, host_ns, .. }
            | PadEvent::Hat { device, host_ns, .. }
            | PadEvent::Axis { device, host_ns, .. } => (device.clone(), *host_ns),
            PadEvent::Devices { .. } => unreachable!(),
        };
        assert_eq!(device, "eb01:0001#1");
        times.push(host_ns);
    }
    let after = clock();
    // On the host clock, in order, and inside the span they happened in.
    assert!(times.windows(2).all(|w| w[0] <= w[1]), "{times:?}");
    assert!(before <= times[0] && *times.last().unwrap() <= after, "{before} {times:?} {after}");

    // Unplugging renumbers: the second A board is now the only one.
    pads.run(move || unsafe {
        SDL_DetachVirtualJoystick(ids[0]);
    })
    .unwrap();
    wait_for("the rescan", || {
        let d = ours(pads.devices());
        (d.len() == 2).then_some(())
    });
    let keys: Vec<String> = ours(pads.devices()).into_iter().map(|p| p.key).collect();
    assert_eq!(keys, ["eb02:0002", "eb01:0001"]);

    // Closed: every board is closed (SDL has no handle for it) and none listed.
    pads.set_active(false);
    assert!(pads.devices().is_empty());
    let open = pads.run(move || unsafe { !SDL_GetJoystickFromID(ids[2]).is_null() }).unwrap();
    assert!(!open);
    // Reopened: listed again, same names.
    pads.set_active(true);
    let keys: Vec<String> = ours(pads.devices()).into_iter().map(|p| p.key).collect();
    assert_eq!(keys, ["eb02:0002", "eb01:0001"]);
    pads.run(move || unsafe {
        SDL_DetachVirtualJoystick(ids[1]);
        SDL_DetachVirtualJoystick(ids[2]);
    });
    drop(pads);
}

/// chart-core's SDL_SCANCODE_NAMES (packages/chart-core/src/input/scancodes.ts)
/// is SDL's table: every entry is SDL_GetScancodeName's name, and every
/// scancode SDL names is in it.
#[test]
fn chart_core_scancode_names_are_sdls() {
    let src = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/chart-core/src/input/scancodes.ts"
    ))
    .unwrap();
    let start = src.find("export const SDL_SCANCODE_NAMES").unwrap();
    let body = &src[start..];
    let body = &body[..body.find("\n];").unwrap()];
    let mut table = Vec::new();
    for line in body.lines().skip(1) {
        let line = line.trim();
        let inner = line.strip_prefix('[').and_then(|l| l.strip_suffix("],")).unwrap();
        let (num, lit) = inner.split_once(", ").unwrap();
        let q = lit.chars().next().unwrap();
        let s = lit.strip_prefix(q).and_then(|l| l.strip_suffix(q)).unwrap();
        table.push((num.parse::<i32>().unwrap(), s.replace("\\\\", "\\")));
    }
    assert!(table.len() > 200, "parsed {} entries", table.len());

    let sdl_name = |sc: i32| {
        // SAFETY: a static table lookup; no init needed.
        let p = unsafe { SDL_GetScancodeName(SDL_Scancode(sc)) };
        unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned()
    };
    for (sc, name) in &table {
        assert_eq!(&sdl_name(*sc), name, "scancode {sc}");
    }
    for sc in 0..512 {
        let name = sdl_name(sc);
        if !name.is_empty() {
            assert!(table.iter().any(|(s, _)| *s == sc), "scancode {sc} ({name}) missing");
        }
    }
}
