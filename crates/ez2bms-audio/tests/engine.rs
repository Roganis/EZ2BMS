mod common;

use std::sync::Arc;
use std::time::{Duration, Instant};

use common::{left, noise, ramp};
use ez2bms_audio::schedule::{lane_voice, NO_CHOKE};
use ez2bms_audio::{Engine, Event, Schedule, VoiceStart};

fn ev(at: u64, key: u32) -> Event {
    Event { at, sample: 0, from: 0, to: 1000, key, gain_l: 1.0, gain_r: 1.0 }
}

#[test]
fn transport_play_stop_seek_and_the_clock() {
    let rate = 44_100;
    let (engine, mut r) = Engine::with_renderer(rate);
    r.limiter = false;
    let s = Arc::new(
        Schedule::new(rate, vec![ramp(rate, 1000)], vec![ev(100, 0), ev(2000, 1)]).unwrap(),
    );
    engine.set_schedule(s).unwrap();
    let mut buf = vec![0.0; 2 * 256];

    r.render(&mut buf, 0);
    assert!(buf.iter().all(|&x| x == 0.0), "stopped: silent");
    assert!(!engine.clock().playing);

    engine.play_from(0);
    r.render(&mut buf, 32);
    let c = engine.clock();
    assert!(c.playing && c.frame == 0 && c.latency_frames == 32 && c.rate == rate);
    assert_eq!(left(&buf)[100], 0.0);
    assert_eq!(left(&buf)[101], 0.001);
    r.render(&mut buf, 32);
    assert_eq!(engine.clock().frame, 256);
    assert_eq!(r.position(), 512);

    // Stop silences what was sounding and holds the position.
    engine.stop();
    r.render(&mut buf, 0);
    assert!(buf.iter().all(|&x| x == 0.0));
    assert_eq!(r.position(), 512);
    assert!(!engine.clock().playing);

    // Seeking while stopped moves without sound; playing resumes mid-sample.
    engine.seek(10_000);
    r.render(&mut buf, 0);
    assert_eq!(engine.clock().frame, 10_000);
    engine.play_from(600);
    r.render(&mut buf, 0);
    assert_eq!(left(&buf)[0], 0.5, "the tick-100 sound is 500 frames in");
}

#[test]
fn triggers_sound_immediately_and_a_lane_press_cuts_the_last_one() {
    let rate = 44_100;
    let (engine, mut r) = Engine::with_renderer(rate);
    r.limiter = false;
    engine
        .set_schedule(Arc::new(Schedule::new(rate, vec![ramp(rate, 1000)], vec![]).unwrap()))
        .unwrap();
    let press =
        |pos| VoiceStart { sample: 0, pos, to: 1000, key: lane_voice(2), gain_l: 1.0, gain_r: 1.0 };
    let mut buf = vec![0.0; 2 * 64];
    assert!(engine.trigger(press(0)));
    r.render(&mut buf, 0);
    assert_eq!(left(&buf)[10], 0.01);
    assert!(engine.trigger(press(500)));
    r.render(&mut buf, 0);
    assert_eq!(left(&buf)[0], 0.5, "the new press replaced the old one");
    assert_eq!(r.active_voices(), 1);
    // An unknown sample is ignored, not a crash.
    assert!(engine.trigger(VoiceStart { sample: 7, ..press(0) }));
    r.render(&mut buf, 0);
    assert_eq!(r.active_voices(), 1);
}

#[test]
fn a_new_schedule_while_playing_keeps_position_and_voices() {
    let rate = 44_100;
    let (engine, mut r) = Engine::with_renderer(rate);
    r.limiter = false;
    let bank = vec![ramp(rate, 1000)];
    engine
        .set_schedule(Arc::new(Schedule::new(rate, bank.clone(), vec![ev(0, NO_CHOKE)]).unwrap()))
        .unwrap();
    engine.play_from(0);
    let mut buf = vec![0.0; 2 * 100];
    r.render(&mut buf, 0);
    engine
        .set_schedule(Arc::new(
            Schedule::new(rate, bank, vec![ev(0, NO_CHOKE), ev(150, NO_CHOKE)]).unwrap(),
        ))
        .unwrap();
    r.render(&mut buf, 0);
    assert_eq!(left(&buf)[0], 0.1, "the first sound carried on");
    assert_eq!(left(&buf)[60], 0.16 + 0.01, "the new event came in on time");
    assert!(engine.set_schedule(Arc::new(Schedule::empty(48_000))).is_err());
}

#[test]
fn the_null_backend_runs_a_real_time_clock() {
    let engine = Engine::start_null(48_000);
    engine
        .set_schedule(Arc::new(
            Schedule::new(48_000, vec![noise(48_000, 1, 10, 1)], vec![]).unwrap(),
        ))
        .unwrap();
    engine.play_from(0);
    let t = Instant::now();
    let mut last = 0.0;
    while t.elapsed() < Duration::from_millis(300) {
        let now = engine.now_ns();
        let heard = engine.clock().heard_frame_at(now);
        assert!(heard + 1.0 >= last, "clock went backwards: {heard} < {last}");
        last = heard;
        std::thread::sleep(Duration::from_millis(5));
    }
    let c = engine.clock();
    assert!(c.playing && c.callbacks > 10);
    // Generous: a loaded CI machine may fall behind, never run ahead.
    let heard_s = c.heard_frame_at(engine.now_ns()) / 48_000.0;
    assert!(heard_s > 0.1 && heard_s < 1.0, "heard {heard_s} s after ~0.3 s");
    drop(engine);
}
