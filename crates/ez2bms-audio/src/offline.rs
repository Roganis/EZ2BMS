//! Rendering without a device, through the same renderer and mixer as live
//! playback: previews, bounces, and the tests that pin the mixer down.

use std::sync::Arc;

use crate::engine::Engine;
use crate::error::Result;
use crate::schedule::Schedule;

const BLOCK: usize = 512;

/// `frames` of interleaved stereo from timeline frame `from`. With `limiter`
/// the output passes EZ2PORT's output stage; without, it is the raw sum.
pub fn render(
    schedule: Arc<Schedule>,
    from: u64,
    frames: usize,
    limiter: bool,
) -> Result<Vec<f32>> {
    render_blocks(schedule, from, frames, limiter, BLOCK)
}

/// As [`render`], in buffers of `block` frames (what a device would ask for).
pub fn render_blocks(
    schedule: Arc<Schedule>,
    from: u64,
    frames: usize,
    limiter: bool,
    block: usize,
) -> Result<Vec<f32>> {
    let (engine, mut r) = Engine::with_renderer(schedule.rate());
    r.limiter = limiter;
    engine.set_schedule(schedule)?;
    engine.play_from(from);
    let mut out = vec![0.0; frames * 2];
    for chunk in out.chunks_mut(block.max(1) * 2) {
        r.render(chunk, 0);
    }
    Ok(out)
}

/// From `from` to the end of the last sound.
pub fn render_to_end(schedule: Arc<Schedule>, from: u64, limiter: bool) -> Result<Vec<f32>> {
    let frames = schedule.end().saturating_sub(from) as usize;
    render(schedule, from, frames, limiter)
}
