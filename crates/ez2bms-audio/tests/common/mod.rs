#![allow(dead_code)]

use std::sync::Arc;

use ez2bms_audio::Sample;

/// A small deterministic generator, so every run tests the same cases.
pub struct Lcg(pub u64);

impl Lcg {
    pub fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }

    pub fn below(&mut self, n: u64) -> u64 {
        self.next() % n.max(1)
    }

    pub fn unit(&mut self) -> f32 {
        (self.next() as f64 / (1u64 << 31) as f64 * 2.0 - 1.0) as f32
    }
}

pub fn noise(rate: u32, channels: u16, frames: usize, seed: u64) -> Arc<Sample> {
    let mut r = Lcg(seed);
    Arc::new(Sample::new(
        rate,
        channels,
        (0..frames * channels as usize).map(|_| r.unit() * 0.5).collect(),
    ))
}

/// 0, 1/n, 2/n ... - shows exactly where a voice (re)started.
pub fn ramp(rate: u32, frames: usize) -> Arc<Sample> {
    Arc::new(Sample::new(rate, 1, (0..frames).map(|i| i as f32 / frames as f32).collect()))
}

pub fn impulse(rate: u32) -> Arc<Sample> {
    let mut d = vec![0.0; 16];
    d[0] = 1.0;
    Arc::new(Sample::new(rate, 1, d))
}

pub fn left(out: &[f32]) -> Vec<f32> {
    out.iter().step_by(2).copied().collect()
}
