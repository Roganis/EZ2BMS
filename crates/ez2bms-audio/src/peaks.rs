//! Waveform overviews: min/max per bucket of frames, in a mipmap that halves
//! per level, so any zoom draws from the level nearest its frames per pixel.

use crate::sample::Sample;

#[derive(Debug, Clone, PartialEq)]
pub struct Peaks {
    /// Frames per bucket at level 0.
    pub base: u32,
    pub frames: u64,
    /// `levels[k][i]` = [min, max] over bucket i of `base << k` frames, both
    /// channels, scaled to i16.
    pub levels: Vec<Vec<[i16; 2]>>,
}

fn q(x: f32) -> i16 {
    (x * 32767.0).round().clamp(-32767.0, 32767.0) as i16
}

impl Peaks {
    pub fn build(s: &Sample, base: u32) -> Peaks {
        let base = base.max(1);
        let n = s.frames();
        let ch = s.channels as usize;
        let mut level0 = Vec::with_capacity(n.div_ceil(base as usize));
        for chunk in s.data.chunks(base as usize * ch) {
            let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
            for &x in chunk {
                lo = lo.min(x);
                hi = hi.max(x);
            }
            level0.push([q(lo), q(hi)]);
        }
        let mut levels = vec![level0];
        while levels.last().is_some_and(|l| l.len() > 1) {
            let prev = levels.last().unwrap();
            let next = prev
                .chunks(2)
                .map(|p| {
                    let lo = p.iter().map(|b| b[0]).min().unwrap_or(0);
                    let hi = p.iter().map(|b| b[1]).max().unwrap_or(0);
                    [lo, hi]
                })
                .collect();
            levels.push(next);
        }
        Peaks { base, frames: n as u64, levels }
    }

    /// The coarsest level whose buckets are no wider than `frames_per_px`.
    pub fn level_for(&self, frames_per_px: f64) -> usize {
        let mut k = 0;
        while k + 1 < self.levels.len() && ((self.base as u64) << (k + 1)) as f64 <= frames_per_px {
            k += 1;
        }
        k
    }

    pub fn bucket_frames(&self, level: usize) -> u64 {
        (self.base as u64) << level
    }

    /// The whole sample in `width` columns: per column, min/max over the
    /// buckets (at the finest level no wider than a column) that its frames
    /// fall in - a thumbnail. Covers a column's frames and at most one bucket
    /// either side; a sample shorter than `width` buckets repeats buckets.
    pub fn overview(&self, width: usize) -> Vec<[i16; 2]> {
        if width == 0 {
            return Vec::new();
        }
        if self.frames == 0 || self.levels.is_empty() {
            return vec![[0, 0]; width];
        }
        let fpp = self.frames as f64 / width as f64;
        let k = self.level_for(fpp);
        let level = &self.levels[k];
        let bucket = self.bucket_frames(k);
        (0..width)
            .map(|i| {
                let from = self.frames * i as u64 / width as u64;
                let to = (self.frames * (i as u64 + 1) / width as u64).max(from + 1);
                let b0 = ((from / bucket) as usize).min(level.len() - 1);
                let b1 = (to.div_ceil(bucket) as usize).clamp(b0 + 1, level.len());
                let mut lo = i16::MAX;
                let mut hi = i16::MIN;
                for b in &level[b0..b1] {
                    lo = lo.min(b[0]);
                    hi = hi.max(b[1]);
                }
                [lo, hi]
            })
            .collect()
    }
}
