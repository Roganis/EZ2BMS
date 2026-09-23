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

#[test]
fn a_five_minute_stem_decoded_then_read_back_from_the_disk_cache() {
    use ez2bms_audio::cache::SampleCache;
    use ez2bms_audio::disk::DiskCache;
    let dir = std::env::temp_dir().join(format!("ez2bms-perf-disk {}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    // A stereo 16-bit WAV at 44.1 kHz, opened at a 48 kHz device: the
    // resample is most of a WAV's cost (an OGG adds its decode on top).
    // (Half a minute in a debug build, where this crate's loops are slow.)
    let seconds = if cfg!(debug_assertions) { 30 } else { 300 };
    let src = dir.join("stem.wav");
    let mut rng = Lcg(3);
    let pcm: Vec<i16> = (0..seconds * 44_100 * 2).map(|_| (rng.next() as i16) / 4).collect();
    std::fs::write(&src, ez2bms_audio::wav::encode_pcm16(2, 44_100, &pcm)).unwrap();
    let disk = DiskCache::new(dir.join("cache"), 1 << 30);

    let t = Instant::now();
    let decoded = SampleCache::with_disk(48_000, disk.clone()).get(&src).unwrap();
    let cold = t.elapsed().as_secs_f64() * 1000.0;
    disk.wait();
    let t = Instant::now();
    let cached = SampleCache::with_disk(48_000, disk.clone()).get(&src).unwrap();
    let warm = t.elapsed().as_secs_f64() * 1000.0;
    eprintln!(
        "{seconds} s stereo stem at 48 kHz ({} MB): decoded {cold:.0} ms, from the disk cache {warm:.0} ms",
        disk.info().bytes >> 20
    );
    assert_eq!(cached, decoded);
    assert!(warm < 60_000.0, "{warm} ms");
    let _ = std::fs::remove_dir_all(&dir);
}
