//! Onsets and tempo on signals made here, where the right answer is known:
//! every hit found (and nothing else) to within 3 ms, the tempo of a click
//! track to 0.05 BPM and its first beat to 5 ms.

mod common;

use common::Lcg;
use ez2bms_audio::analysis::{analyse, Analysis, DEFAULT_MIN_STRENGTH};
use ez2bms_audio::Sample;

const RATE: u32 = 48_000;

fn stereo(mono: &[f32]) -> Sample {
    Sample::new(RATE, 2, mono.iter().flat_map(|&v| [v, v]).collect())
}

/// Random times at least `gap` apart in [from, to).
fn times(rng: &mut Lcg, n: usize, from: f64, to: f64, gap: f64) -> Vec<f64> {
    let mut out: Vec<f64> = Vec::new();
    while out.len() < n {
        let t = from + (rng.next() as f64 / (1u64 << 31) as f64) * (to - from);
        if out.iter().all(|&o| (o - t).abs() >= gap) {
            out.push(t);
        }
    }
    out.sort_by(|a, b| a.total_cmp(b));
    out
}

/// A noise floor at `floor` peak amplitude.
fn floor(rng: &mut Lcg, seconds: f64, floor: f32) -> Vec<f32> {
    (0..(seconds * RATE as f64) as usize).map(|_| rng.unit() * floor).collect()
}

/// A decaying noise burst (a drum hit) added at `t`.
fn burst(x: &mut [f32], rng: &mut Lcg, t: f64, amp: f32, tau: f64) {
    let s0 = (t * RATE as f64).round() as usize;
    for i in 0..(6.0 * tau * RATE as f64) as usize {
        let Some(v) = x.get_mut(s0 + i) else { break };
        *v += rng.unit() * amp * (-(i as f64) / RATE as f64 / tau).exp() as f32;
    }
}

/// A decaying sine (a plucked note) added at `t`, starting at phase 0.
fn note(x: &mut [f32], t: f64, freq: f64, amp: f32) {
    let s0 = (t * RATE as f64).round() as usize;
    for i in 0..(1.2 * RATE as f64) as usize {
        let Some(v) = x.get_mut(s0 + i) else { break };
        let s = i as f64 / RATE as f64;
        *v += amp * ((2.0 * std::f64::consts::PI * freq * s).sin() * (-s / 0.25).exp()) as f32;
    }
}

/// Found onsets (default strength) against the true times: every true time
/// matched within `tol`, nothing left over.
fn check(a: &Analysis, truth: &[f64], tol: f64) {
    let found: Vec<f64> =
        a.onsets.iter().filter(|o| o.strength >= DEFAULT_MIN_STRENGTH).map(|o| o.sec).collect();
    for &t in truth {
        let best = found.iter().map(|f| (f - t).abs()).fold(f64::INFINITY, f64::min);
        assert!(best <= tol, "hit at {t:.4} s: nearest onset {best:.4} s off; found {found:?}");
    }
    for &f in &found {
        let best = truth.iter().map(|t| (f - t).abs()).fold(f64::INFINITY, f64::min);
        assert!(best <= tol, "onset at {f:.4} s is no hit (nearest {best:.4} s off)");
    }
    assert_eq!(found.len(), truth.len());
}

#[test]
fn drum_hits_over_a_noise_floor_are_all_found_to_three_ms() {
    for seed in 1..=4 {
        let mut rng = Lcg(seed);
        let hits = times(&mut rng, 40, 0.2, 11.5, 0.08);
        // 20 dB and more below the hits.
        let mut x = floor(&mut rng, 12.0, 0.02);
        for &t in &hits {
            let amp = 0.4 + 0.5 * (rng.next() % 1000) as f32 / 1000.0;
            burst(&mut x, &mut rng, t, amp, 0.03);
        }
        let a = analyse(&stereo(&x));
        check(&a, &hits, 0.003);
        // Sorted, inside the file, apart.
        assert!(a.onsets.windows(2).all(|w| w[1].sec - w[0].sec >= 0.03));
        assert!(a.onsets.iter().all(|o| o.sec >= 0.0 && o.sec <= 12.0));
        assert!(a.onsets.iter().all(|o| (0.0..=1.0).contains(&o.strength)));
    }
}

#[test]
fn plucked_notes_ringing_into_each_other_are_found() {
    // A note under older ones still ringing can only be placed to within a
    // few of its cycles where they cancel: 95 % within 3 ms, all within 15
    // (over 60 seeds: 1.6 ms and 14 ms).
    let freqs = [110.0, 164.8, 220.0, 329.6, 440.0, 659.3, 880.0];
    let mut errs = Vec::new();
    for seed in 0..8 {
        let mut rng = Lcg(9 + seed * 101);
        let starts = times(&mut rng, 24, 0.3, 11.0, 0.15);
        let mut x = floor(&mut rng, 12.0, 0.003);
        for (i, &t) in starts.iter().enumerate() {
            note(&mut x, t, freqs[i % freqs.len()], 0.35);
        }
        let a = analyse(&stereo(&x));
        check(&a, &starts, 0.015);
        for t in &starts {
            errs.push(a.onsets.iter().map(|o| (o.sec - t).abs()).fold(f64::INFINITY, f64::min));
        }
    }
    errs.sort_by(|a, b| a.total_cmp(b));
    let p95 = errs[errs.len() * 19 / 20];
    assert!(p95 <= 0.003, "95th percentile {p95}");
}

#[test]
fn silence_and_a_steady_tone_have_no_onsets() {
    let silent = analyse(&Sample::silence(RATE, 2, RATE as usize * 5));
    assert_eq!(silent, Analysis::default());
    // A tone fading in over a second, then held: nothing after the fade.
    let x: Vec<f32> = (0..RATE as usize * 8)
        .map(|i| {
            let s = i as f64 / RATE as f64;
            (0.3 * s.min(1.0) * (2.0 * std::f64::consts::PI * 330.0 * s).sin()) as f32
        })
        .collect();
    let a = analyse(&stereo(&x));
    let late: Vec<_> =
        a.onsets.iter().filter(|o| o.sec > 1.2 && o.strength >= DEFAULT_MIN_STRENGTH).collect();
    assert!(late.is_empty(), "{late:?}");
}

#[test]
fn a_click_track_gives_its_tempo_and_first_beat() {
    // 88 with its eighths could be 176, and 230 could be 115: the strong
    // beats and the off-beats decide.
    for (i, bpm) in [128.0, 150.0, 174.0, 95.0, 88.0, 200.0, 230.0, 64.0].into_iter().enumerate() {
        let mut rng = Lcg(20 + i as u64);
        let period = 60.0 / bpm;
        let phase = (rng.next() % 1000) as f64 / 1000.0 * period;
        let mut x = floor(&mut rng, 30.0, 0.01);
        let mut k = 0;
        loop {
            let t = phase + k as f64 * period / 2.0;
            if t > 29.5 {
                break;
            }
            // Beats loud, the eighths between them softer.
            let amp = if k % 2 == 0 { 0.8 } else { 0.25 };
            burst(&mut x, &mut rng, t, amp, 0.012);
            k += 1;
        }
        let a = analyse(&stereo(&x));
        let t = a.tempo.first().unwrap_or_else(|| panic!("{bpm}: no tempo"));
        assert!((t.bpm - bpm).abs() < 0.05, "{bpm}: found {:?}", a.tempo);
        let off = (t.first_beat - phase).rem_euclid(period);
        let off = off.min(period - off);
        assert!(off < 0.005, "{bpm}: first beat {} vs {phase}", t.first_beat);
        assert!(t.confidence > 0.4, "{bpm}: {t:?}");
        assert!(a.tempo.len() <= 3);
    }
}

#[test]
fn the_analysis_is_deterministic_and_round_trips() {
    let mut rng = Lcg(33);
    let hits = times(&mut rng, 20, 0.1, 9.0, 0.1);
    let mut x = floor(&mut rng, 10.0, 0.01);
    for &t in &hits {
        burst(&mut x, &mut rng, t, 0.7, 0.02);
    }
    let s = stereo(&x);
    let a = analyse(&s);
    assert_eq!(analyse(&s), a);
    let b = a.to_bytes();
    assert_eq!(Analysis::from_bytes(&b), Some(a.clone()));
    assert_eq!(Analysis::from_bytes(&b[..b.len() - 1]), None);
    let mut other = b.clone();
    other[0] ^= 1;
    assert_eq!(Analysis::from_bytes(&other), None, "another version");
}
