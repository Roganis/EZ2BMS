//! Render a song preview for chart-core's parity test against EZ2PORT's
//! importer (test/preview.oracle.test.ts): a JSON job on stdin - the sample
//! files, the chart's engine events, the window - and the preview's 16-bit
//! stereo PCM on stdout, as `preview.ssf` would hold it.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;

use ez2bms_audio::cache::SampleCache;
use ez2bms_audio::cut::PUBLISH_RATE;
use ez2bms_audio::schedule::frame_at_ms;
use ez2bms_audio::{preview, EventSpec, Schedule};
use serde::Deserialize;

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
struct Job {
    sources: Vec<PathBuf>,
    events: Vec<Ev>,
    from_ms: f64,
    length_ms: f64,
    fade_ms: f64,
}

fn main() {
    let mut s = String::new();
    std::io::stdin().read_to_string(&mut s).expect("read the job");
    let job: Job = serde_json::from_str(&s).expect("a job");
    let cache = SampleCache::new(PUBLISH_RATE);
    let samples = job.sources.iter().map(|p| cache.get(p).expect("a sample")).collect();
    let specs: Vec<EventSpec> = job
        .events
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
    let schedule = Arc::new(Schedule::from_specs(PUBLISH_RATE, samples, &specs).expect("events"));
    let frames = |ms: f64| frame_at_ms(ms, PUBLISH_RATE);
    let pcm = preview::render(
        schedule,
        frames(job.from_ms),
        frames(job.length_ms) as usize,
        frames(job.fade_ms) as usize,
    )
    .expect("render");
    let bytes: Vec<u8> = pcm.iter().flat_map(|v| v.to_le_bytes()).collect();
    std::io::stdout().write_all(&bytes).expect("write the PCM");
}
