//! The song's preview (`preview.ssf`): what EZ2PORT's song wheel loops while
//! the song is highlighted - 16-bit stereo, played with a hard restart and no
//! fades of its own, so the fades are baked in.
//!
//! The mix is the chart as the engine plays it (the same schedule and mixer
//! as playback, voices cutting as EZ2PORT's do), summed without the output
//! stage. What happens to that sum follows the port's bmson importer
//! (ez2/bmson.c `write_preview`) step for step, in its integer arithmetic:
//! linear fades in and out, then the peak brought down to 32000 - only when
//! it is over, a quiet song stays quiet. chart-core's preview.oracle test
//! checks the bytes against the importer's.

use std::sync::Arc;

use crate::error::Result;
use crate::offline;
use crate::sample::Sample;
use crate::schedule::Schedule;

/// The loudest sample a preview may hold (the importer's normalising target).
pub const PEAK: i64 = 32000;

/// The raw f32 sum as the integers the importer sums its 16-bit samples into:
/// a decoded 16-bit sample is exactly `v / 32768`, so a sum of them at unity
/// gain comes back exact.
pub fn to_sum(mix: &[f32]) -> Vec<i64> {
    mix.iter().map(|&v| (v as f64 * 32768.0).round() as i64).collect()
}

/// ez2/bmson.c `write_preview` from the summed mix on: `fade` frames faded in
/// and out, linearly, each value truncated as the C's `(long)` does; then,
/// if the peak (at least 1) is over 32000, every value scaled by
/// 32000/peak and truncated. Interleaved stereo in and out.
pub fn finish(mut mix: Vec<i64>, fade: usize) -> Vec<i16> {
    let total = mix.len() / 2;
    let fade = fade.min(total);
    if fade > 0 {
        for (i, v) in mix[..fade * 2].iter_mut().enumerate() {
            *v = (*v as f64 * ((i / 2) as f64 / fade as f64)) as i64;
        }
        for i in 0..fade * 2 {
            let k = (total - fade) * 2 + i;
            mix[k] = (mix[k] as f64 * (1.0 - (i / 2) as f64 / fade as f64)) as i64;
        }
    }
    let peak = mix.iter().map(|v| v.abs()).max().unwrap_or(0).max(1);
    mix.iter()
        .map(|&v| {
            let v = if peak > PEAK { (v as f64 * (PEAK as f64 / peak as f64)) as i64 } else { v };
            v as i16
        })
        .collect()
}

/// `frames` of the schedule from timeline frame `from`, sounds already under
/// way picked up mid-sample, faded and normalised.
pub fn render(schedule: Arc<Schedule>, from: u64, frames: usize, fade: usize) -> Result<Vec<i16>> {
    let mix = offline::render(schedule, from, frames, false)?;
    Ok(finish(to_sum(&mix), fade))
}

/// A preview cut from a supplied file (a sample at the render rate), faded and
/// normalised like a mix. Past the file's end is silence.
pub fn from_sample(s: &Sample, from: u64, frames: usize, fade: usize) -> Vec<i16> {
    let mut mix = Vec::with_capacity(frames * 2);
    for i in 0..frames {
        let f = from as usize + i;
        let (l, r) = if f < s.frames() { s.frame(f) } else { (0.0, 0.0) };
        mix.push(l);
        mix.push(r);
    }
    finish(to_sum(&mix), fade)
}

/// The song's loudness for picking a window: its first `frames`, as `width`
/// [min, max] pairs of the raw mix (both sides), 16-bit values, clamped.
pub fn overview(schedule: Arc<Schedule>, frames: usize, width: usize) -> Result<Vec<i16>> {
    let mix = offline::render(schedule, 0, frames, false)?;
    let frames = mix.len() / 2;
    let width = width.max(1);
    let mut out = vec![0i16; width * 2];
    if frames == 0 {
        return Ok(out);
    }
    for (b, pair) in out.chunks_exact_mut(2).enumerate() {
        let a = b * frames / width;
        let z = ((b + 1) * frames / width).max(a + 1).min(frames);
        let (mut lo, mut hi) = (0f32, 0f32);
        for f in a..z {
            for v in [mix[f * 2], mix[f * 2 + 1]] {
                lo = lo.min(v);
                hi = hi.max(v);
            }
        }
        let q = |v: f32| (v * 32767.0).round().clamp(-32768.0, 32767.0) as i16;
        pair[0] = q(lo);
        pair[1] = q(hi);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fades_are_linear_and_truncated_as_the_importer_has_them() {
        // Four frames of 1000 on both sides, fading over two.
        let out = finish(vec![1000; 8], 2);
        // In: frame 0 x 0/2, frame 1 x 1/2; out: frame 2 x 1, frame 3 x 1/2.
        assert_eq!(out, vec![0, 0, 500, 500, 1000, 1000, 500, 500]);
        // Truncated toward zero, not rounded, on both signs.
        let six: Vec<i64> = [-999, 999].repeat(6);
        assert_eq!(finish(six, 3)[2..4], [-333, 333]);
    }

    #[test]
    fn only_a_peak_over_32000_is_brought_down() {
        assert_eq!(finish(vec![100, -200], 0), vec![100, -200], "a quiet mix stays quiet");
        let loud = finish(vec![64000, -32000, 16000, 0], 0);
        assert_eq!(loud, vec![32000, -16000, 8000, 0]);
        // A sum over the 16-bit range is not clipped first: it is scaled.
        assert_eq!(finish(vec![40000, 40000], 0), vec![32000, 32000]);
    }

    #[test]
    fn the_sum_of_16_bit_samples_is_exact() {
        let vals = [12345i64, -32768, 32767, 1, -1];
        let f: Vec<f32> = vals.iter().map(|&v| v as f32 / 32768.0).collect();
        assert_eq!(to_sum(&f), vals);
        let two: Vec<f32> = vec![f[0] + f[2], f[1] + f[1]];
        assert_eq!(to_sum(&two), vec![12345 + 32767, -65536]);
    }

    #[test]
    fn the_overview_brackets_every_column() {
        let data: Vec<f32> = (0..1000)
            .flat_map(|i| {
                let v = ((i as f32) * 0.05).sin() * 0.5;
                [v, -v]
            })
            .collect();
        let s = Arc::new(Sample::new(1000, 2, data.clone()));
        let ev = crate::EventSpec {
            ms: 0.0,
            origin_ms: 0.0,
            end_ms: None,
            sample: 0,
            key: 0,
            level: 0,
            pan: 0,
        };
        let sched = Arc::new(Schedule::from_specs(1000, vec![s], &[ev]).unwrap());
        let ov = overview(sched, 1000, 10).unwrap();
        for b in 0..10 {
            let frames = &data[b * 100 * 2..(b + 1) * 100 * 2];
            let lo = frames.iter().cloned().fold(0f32, f32::min);
            let hi = frames.iter().cloned().fold(0f32, f32::max);
            assert_eq!(ov[b * 2], (lo * 32767.0).round() as i16);
            assert_eq!(ov[b * 2 + 1], (hi * 32767.0).round() as i16);
        }
    }
}
