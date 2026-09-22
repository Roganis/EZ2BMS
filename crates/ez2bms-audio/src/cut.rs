//! Keysound cutting for publish: a frame range of a 44.1 kHz sample to a
//! 16-bit stereo `.ssf` - EZ2PORT's own keysound format (its importer writes
//! the same: 2 channels, 44.1 kHz, 16-bit).
//!
//! Conversion is per sample and the ranges are half-open, so consecutive
//! slices [a, b) [b, c) concatenate to exactly the uncut [a, c): the engine
//! plays them back to back without a click.

use crate::error::{AudioError, Result};
use crate::sample::{to_pcm16, Sample};
use crate::ssf;

/// EZ2PORT's mixing rate, and the rate every published keysound is cut at.
pub const PUBLISH_RATE: u32 = 44_100;

/// Interleaved 16-bit stereo for frames `[start, end)` (`end` None = to the
/// end); mono is doubled to both sides. Out-of-range bounds are clamped.
pub fn pcm16_stereo(s: &Sample, start: u64, end: Option<u64>) -> Vec<i16> {
    let n = s.frames() as u64;
    let a = start.min(n) as usize;
    let b = end.unwrap_or(n).clamp(a as u64, n) as usize;
    let mut out = Vec::with_capacity((b - a) * 2);
    for i in a..b {
        let (l, r) = s.frame(i);
        out.push(to_pcm16(l));
        out.push(to_pcm16(r));
    }
    out
}

/// One published keysound: `.ssf` bytes for `[start, end)` of a sample that is
/// already at [`PUBLISH_RATE`]. An empty range gives a short silent file
/// rather than an empty one (EZ2PORT's importer writes 64 frames of silence).
pub fn cut_ssf(s: &Sample, start: u64, end: Option<u64>) -> Result<Vec<u8>> {
    if s.rate != PUBLISH_RATE {
        return Err(AudioError::Schedule(format!(
            "cut needs a {PUBLISH_RATE} Hz sample, got {}",
            s.rate
        )));
    }
    let mut pcm = pcm16_stereo(s, start, end);
    if pcm.is_empty() {
        pcm = vec![0; 64 * 2];
    }
    Ok(ssf::encode_pcm16(2, PUBLISH_RATE, &pcm))
}
