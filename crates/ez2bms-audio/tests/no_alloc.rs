//! The render path must never touch the allocator: an allocation in an audio
//! callback can block for milliseconds and glitch the sound.

mod common;

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::sync::Arc;

use common::{noise, Lcg};
use ez2bms_audio::schedule::{lane_voice, NO_CHOKE};
use ez2bms_audio::{Engine, Event, Schedule, VoiceStart};

struct Counting;

thread_local! {
    static WATCH: Cell<bool> = const { Cell::new(false) };
    static COUNT: Cell<usize> = const { Cell::new(0) };
}

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        if WATCH.with(Cell::get) {
            COUNT.with(|c| c.set(c.get() + 1));
        }
        unsafe { System.alloc(l) }
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        if WATCH.with(Cell::get) {
            COUNT.with(|c| c.set(c.get() + 1));
        }
        unsafe { System.dealloc(p, l) }
    }
}

#[global_allocator]
static A: Counting = Counting;

#[test]
fn rendering_allocates_and_frees_nothing() {
    let rate = 48_000;
    let (engine, mut r) = Engine::with_renderer(rate);
    let samples: Vec<_> = (0..4).map(|i| noise(rate, 1 + i % 2, 3000, i as u64)).collect();
    let mut g = Lcg(3);
    let events: Vec<Event> = (0..3000)
        .map(|_| Event {
            at: g.below(200_000),
            sample: g.below(4) as u32,
            from: 0,
            to: 3000,
            key: if g.below(2) == 0 { NO_CHOKE } else { g.below(16) as u32 },
            gain_l: 0.5,
            gain_r: 0.5,
        })
        .collect();
    let s1 = Arc::new(Schedule::new(rate, samples.clone(), events.clone()).unwrap());
    let s2 = Arc::new(Schedule::new(rate, samples, events[..1000].to_vec()).unwrap());
    let mut buf = vec![0.0f32; 2 * 512];
    r.render(&mut buf, 0); // first use of arc-swap on this thread registers it

    engine.set_schedule(s1).unwrap();
    engine.play_from(1234);
    let mut total = 0;
    for i in 0..400 {
        if i == 100 {
            engine.set_schedule(s2.clone()).unwrap();
        }
        if i == 200 {
            engine.play_from(50_000);
        }
        if i % 10 == 0 {
            engine.trigger(VoiceStart {
                sample: 1,
                pos: 0,
                to: 3000,
                key: lane_voice(1),
                gain_l: 1.0,
                gain_r: 1.0,
            });
        }
        if i == 300 {
            engine.stop();
        }
        WATCH.with(|w| w.set(true));
        r.render(&mut buf, 0);
        WATCH.with(|w| w.set(false));
        total += COUNT.with(|c| c.replace(0));
    }
    assert_eq!(total, 0, "allocator calls during render");
}
