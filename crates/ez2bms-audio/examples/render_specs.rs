//! Renders pairs of engine event lists through the real mixer and reports
//! how far apart they sound. chart-core's tests use it to check its model of
//! the sound (`audible()`) against what the engine actually plays: two charts
//! the model calls equal must render the same, whatever changed on paper.
//!
//! stdin: `{"cases": [{"rate", "samples": [{"frames", "channels", "seed"}],
//!          "a": [event], "b": [event]}]}`, each event in the shape the app
//! sends the engine (`ms, origin_ms, until_ms, sample, voice, level, pan`).
//! stdout: one `{"frames_a", "frames_b", "peak", "max_diff"}` per case, the
//! raw sum (no output stage), so nothing hides a difference.
//!
//! Samples are seeded noise at the render rate: every frame differs from its
//! neighbours, so a sound started a frame late or cut a frame early shows.

use std::io::Read;
use std::sync::Arc;

use ez2bms_audio::{offline, EventSpec, Sample, Schedule};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct SampleSpec {
    frames: usize,
    channels: u16,
    seed: u64,
}

#[derive(Deserialize)]
struct Ev {
    ms: f64,
    origin_ms: f64,
    until_ms: Option<f64>,
    sample: u32,
    voice: u32,
    level: i32,
    pan: i32,
}

#[derive(Deserialize)]
struct Case {
    rate: u32,
    samples: Vec<SampleSpec>,
    a: Vec<Ev>,
    b: Vec<Ev>,
}

#[derive(Deserialize)]
struct Input {
    cases: Vec<Case>,
}

#[derive(Serialize)]
struct Report {
    frames_a: usize,
    frames_b: usize,
    peak: f32,
    max_diff: f32,
}

fn noise(rate: u32, s: &SampleSpec) -> Arc<Sample> {
    let mut x = s.seed.wrapping_mul(2862933555777941757).wrapping_add(3037000493);
    let data = (0..s.frames * s.channels as usize)
        .map(|_| {
            x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            ((x >> 33) as f64 / (1u64 << 31) as f64 - 1.0) as f32 * 0.5
        })
        .collect();
    Arc::new(Sample::new(rate, s.channels, data))
}

fn render(rate: u32, samples: &[Arc<Sample>], events: &[Ev]) -> Vec<f32> {
    let specs: Vec<EventSpec> = events
        .iter()
        .map(|e| EventSpec {
            ms: e.ms,
            origin_ms: e.origin_ms,
            end_ms: e.until_ms,
            sample: e.sample,
            key: e.voice,
            level: e.level,
            pan: e.pan,
        })
        .collect();
    let schedule = Schedule::from_specs(rate, samples.to_vec(), &specs).expect("valid events");
    offline::render_to_end(Arc::new(schedule), 0, false).expect("render")
}

fn main() {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).expect("stdin");
    let input: Input = serde_json::from_str(&text).expect("input JSON");
    let reports: Vec<Report> = input
        .cases
        .iter()
        .map(|c| {
            let samples: Vec<Arc<Sample>> = c.samples.iter().map(|s| noise(c.rate, s)).collect();
            let a = render(c.rate, &samples, &c.a);
            let b = render(c.rate, &samples, &c.b);
            let n = a.len().max(b.len());
            let at = |v: &[f32], i: usize| v.get(i).copied().unwrap_or(0.0);
            let mut peak = 0f32;
            let mut max_diff = 0f32;
            for i in 0..n {
                peak = peak.max(at(&a, i).abs());
                max_diff = max_diff.max((at(&a, i) - at(&b, i)).abs());
            }
            Report { frames_a: a.len() / 2, frames_b: b.len() / 2, peak, max_diff }
        })
        .collect();
    println!("{}", serde_json::to_string(&reports).expect("output JSON"));
}
