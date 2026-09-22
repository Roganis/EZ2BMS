mod common;

use std::sync::Arc;

use common::{impulse, left, noise, ramp, Lcg};
use ez2bms_audio::offline::{render, render_blocks, render_to_end};
use ez2bms_audio::schedule::{keysound_voice, lane_voice, EventSpec, NO_CHOKE};
use ez2bms_audio::{Event, Sample, Schedule};

fn ev(at: u64, sample: u32, from: u64, to: u64, key: u32) -> Event {
    Event { at, sample, from, to, key, gain_l: 1.0, gain_r: 1.0 }
}

#[test]
fn every_sound_starts_on_its_exact_frame_whatever_the_buffer_size() {
    let rate = 48_000;
    let ats = [0u64, 1, 63, 64, 65, 511, 512, 1000, 4095];
    let events = ats.iter().map(|&a| ev(a, 0, 0, u64::MAX, NO_CHOKE)).collect();
    let s = Arc::new(Schedule::new(rate, vec![impulse(rate)], events).unwrap());
    let reference = render_blocks(s.clone(), 0, 5000, false, 512).unwrap();
    let l = left(&reference);
    for (i, &x) in l.iter().enumerate() {
        assert_eq!(x, if ats.contains(&(i as u64)) { 1.0 } else { 0.0 }, "frame {i}");
    }
    for block in [1, 7, 64, 333, 4096] {
        assert_eq!(
            render_blocks(s.clone(), 0, 5000, false, block).unwrap(),
            reference,
            "block {block}"
        );
    }
}

#[test]
fn a_retrigger_on_the_same_voice_cuts_and_restarts() {
    let rate = 44_100;
    let r = ramp(rate, 1000);
    let at = |i: usize, out: &[f32]| left(out)[i];
    // Keysound voice: the second hit restarts the ramp.
    let s = Arc::new(
        Schedule::new(rate, vec![r.clone()], vec![ev(0, 0, 0, 1000, 5), ev(300, 0, 0, 1000, 5)])
            .unwrap(),
    );
    let out = render(s, 0, 1400, false).unwrap();
    assert_eq!(at(299, &out), 0.299);
    assert_eq!(at(300, &out), 0.0);
    assert_eq!(at(1299, &out), 0.999);
    assert_eq!(at(1300, &out), 0.0);
    // No choke: they layer.
    let s = Arc::new(
        Schedule::new(
            rate,
            vec![r.clone()],
            vec![ev(0, 0, 0, 1000, NO_CHOKE), ev(300, 0, 0, 1000, NO_CHOKE)],
        )
        .unwrap(),
    );
    assert_eq!(at(310, &render(s, 0, 1400, false).unwrap()), 0.31 + 0.01);
    // A lane voice and the sample's own voice are different voices (EZ2PORT's
    // press channel vs the backing/autoplay voice), so they layer too.
    let s = Arc::new(
        Schedule::new(
            rate,
            vec![r.clone()],
            vec![ev(0, 0, 0, 1000, keysound_voice(0)), ev(300, 0, 0, 1000, lane_voice(0))],
        )
        .unwrap(),
    );
    assert_eq!(at(310, &render(s, 0, 1400, false).unwrap()), 0.31 + 0.01);
    // Two hits on one voice at one frame: the later one given wins, once.
    let s = Arc::new(
        Schedule::new(
            rate,
            vec![r.clone(), r],
            vec![ev(10, 0, 0, 1000, 9), ev(10, 1, 500, 1000, 9)],
        )
        .unwrap(),
    );
    assert_eq!(at(10, &render(s, 0, 20, false).unwrap()), 0.5);
}

#[test]
fn an_empty_sound_on_a_voice_silences_it() {
    let rate = 44_100;
    let s = Arc::new(
        Schedule::new(
            rate,
            vec![ramp(rate, 1000)],
            vec![ev(0, 0, 0, 1000, 3), ev(100, 0, 40, 40, 3)],
        )
        .unwrap(),
    );
    let out = left(&render(s, 0, 300, false).unwrap());
    assert!(out[99] > 0.0 && out[100..].iter().all(|&x| x == 0.0));
}

#[test]
fn level_and_pan_turn_each_side_down() {
    let rate = 44_100;
    let one = Arc::new(Sample::new(rate, 2, vec![1.0; 20]));
    let play = |level, pan| {
        let spec =
            EventSpec { ms: 0.0, origin_ms: 0.0, end_ms: None, sample: 0, key: 0, level, pan };
        let s = Arc::new(Schedule::from_specs(rate, vec![one.clone()], &[spec]).unwrap());
        let out = render(s, 0, 4, false).unwrap();
        (out[0], out[1])
    };
    let (l, r) = play(-2000, 2000);
    assert!((l - 0.01).abs() < 1e-7 && (r - 0.1).abs() < 1e-7);
    // Hard right is -100 dB on the left: DirectSound's floor, silence.
    assert_eq!(play(0, 10_000), (0.0, 1.0));
}

/// A random, choke-heavy schedule.
fn busy(rate: u32, seed: u64) -> Arc<Schedule> {
    let mut r = Lcg(seed);
    let samples: Vec<_> =
        (0..6).map(|i| noise(rate, 1 + (i % 2) as u16, 200 + 500 * i, seed + i as u64)).collect();
    let events = (0..400)
        .map(|_| {
            let sample = r.below(6) as u32;
            let len = samples[sample as usize].frames() as u64;
            let from = r.below(len);
            let key = if r.below(3) == 0 { NO_CHOKE } else { r.below(8) as u32 };
            Event {
                at: r.below(40_000),
                sample,
                from,
                to: from + r.below(len - from) + 1,
                key,
                gain_l: r.unit().abs(),
                gain_r: r.unit().abs(),
            }
        })
        .collect();
    Arc::new(Schedule::new(rate, samples, events).unwrap())
}

#[test]
fn playing_from_anywhere_picks_up_every_sound_mid_sample() {
    for seed in 1..6 {
        let s = busy(48_000, seed);
        let full = render_to_end(s.clone(), 0, false).unwrap();
        let mut r = Lcg(seed * 31);
        for _ in 0..8 {
            let from = r.below(s.end());
            let part = render_to_end(s.clone(), from, false).unwrap();
            let tail = &full[2 * from as usize..];
            assert_eq!(part.len(), tail.len());
            // Same sounds at the same offsets; only the order voices are summed
            // in may differ, so allow float rounding.
            let worst = part.iter().zip(tail).map(|(a, b)| (a - b).abs()).fold(0.0, f32::max);
            assert!(worst < 1e-5, "seed {seed} from {from}: {worst}");
        }
    }
}

#[test]
fn a_chain_of_slices_plays_exactly_like_the_uncut_sample_at_any_rate() {
    for rate in [44_100u32, 48_000, 96_000] {
        let src = noise(rate, 2, rate as usize, 9);
        // A fresh hit at 250 ms and continuations at awkward times, on
        // different keysounds (each slice is its own keysound).
        let t0 = 250.0;
        let times = [t0, 250.7, 301.3, 333.333, 500.01, 777.7];
        let mut specs: Vec<EventSpec> = times
            .iter()
            .enumerate()
            .map(|(k, &ms)| EventSpec {
                ms,
                origin_ms: t0,
                end_ms: times.get(k + 1).copied(),
                sample: 0,
                key: k as u32,
                level: 0,
                pan: 0,
            })
            .collect();
        let chain = Arc::new(Schedule::from_specs(rate, vec![src.clone()], &specs).unwrap());
        specs.truncate(1);
        specs[0].end_ms = None;
        let whole = Arc::new(Schedule::from_specs(rate, vec![src], &specs).unwrap());
        let a = render_to_end(chain, 0, false).unwrap();
        let b = render_to_end(whole, 0, false).unwrap();
        assert_eq!(a, b, "{rate} Hz");
    }
}
