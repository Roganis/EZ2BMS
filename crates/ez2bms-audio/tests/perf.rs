//! How long the host's heavier preview work takes, for docs/perf-log.md:
//! the overview the Preview page draws for a 3-minute song. Printed with
//! `--nocapture`; the bound is loose enough for a debug build on CI (the
//! log records a release build).

mod common;

use std::sync::Arc;
use std::time::Instant;

use common::{noise, Lcg};
use ez2bms_audio::preview::overview;
use ez2bms_audio::schedule::keysound_voice;
use ez2bms_audio::{Event, Schedule};

#[test]
fn a_three_minute_song_overview() {
    let rate = 44_100;
    // 40 sounds of 0.1-2 s, struck 16 times a second for 3 minutes: a
    // busy keysound song (2 880 hits), not a single stem.
    let mut rng = Lcg(7);
    let samples: Vec<_> =
        (0..40).map(|i| noise(rate, 2, 4_410 + rng.below(84_000) as usize, i)).collect();
    let frames = 180 * rate as usize;
    let events: Vec<Event> = (0..2_880u64)
        .map(|i| {
            let s = rng.below(40) as u32;
            Event {
                at: i * rate as u64 / 16,
                sample: s,
                from: 0,
                to: u64::MAX,
                key: keysound_voice(s),
                gain_l: 0.7,
                gain_r: 0.7,
            }
        })
        .collect();
    let schedule = Arc::new(Schedule::new(rate, samples, events).unwrap());
    let t = Instant::now();
    let peaks = overview(schedule, frames, 900).unwrap();
    let ms = t.elapsed().as_secs_f64() * 1000.0;
    eprintln!("preview overview, 3 min, 2 880 hits, 900 columns: {ms:.0} ms");
    assert_eq!(peaks.len(), 1800);
    assert!(peaks.iter().any(|&p| p != 0));
    assert!(ms < 60_000.0, "{ms} ms");
}
