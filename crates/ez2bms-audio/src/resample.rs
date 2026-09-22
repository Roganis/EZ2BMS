//! Sample-rate conversion (rubato's FFT resampler) with the filter delay
//! removed, so a resampled sample starts exactly where the original does and
//! is exactly `ceil(frames * to / from)` long.

use rubato::{FftFixedIn, Resampler};

use crate::error::{AudioError, Result};
use crate::sample::Sample;

const CHUNK: usize = 1024;

/// Frames at `to` for `frames` at `from`, rounded to nearest - how EZ2BMS maps
/// a position (a slice point, an event time) between rates, everywhere.
pub fn convert_frames(frames: u64, from: u32, to: u32) -> u64 {
    if from == to {
        return frames;
    }
    ((frames as u128 * to as u128 + from as u128 / 2) / from as u128) as u64
}

pub fn resample(s: &Sample, to: u32) -> Result<Sample> {
    if s.rate == to {
        return Ok(s.clone());
    }
    let ch = s.channels as usize;
    let frames = s.frames();
    let want = ((frames as u128 * to as u128).div_ceil(s.rate as u128)) as usize;
    if frames == 0 {
        return Ok(Sample::new(to, s.channels, Vec::new()));
    }
    let err = |e: &dyn std::fmt::Display| AudioError::Resample(e.to_string());
    let mut r =
        FftFixedIn::<f32>::new(s.rate as usize, to as usize, CHUNK, 2, ch).map_err(|e| err(&e))?;
    let planar: Vec<Vec<f32>> =
        (0..ch).map(|c| s.data.iter().skip(c).step_by(ch).copied().collect()).collect();
    let delay = r.output_delay();
    let mut out: Vec<Vec<f32>> = vec![Vec::with_capacity(want + delay + 2 * CHUNK); ch];
    let mut tmp = r.output_buffer_allocate(true);
    let mut pos = 0;
    while pos < frames || out[0].len() < want + delay {
        let need = r.input_frames_next();
        let (_, produced) = if pos + need <= frames {
            let input: Vec<&[f32]> = planar.iter().map(|c| &c[pos..pos + need]).collect();
            pos += need;
            r.process_into_buffer(&input, &mut tmp, None).map_err(|e| err(&e))?
        } else if pos < frames {
            let input: Vec<&[f32]> = planar.iter().map(|c| &c[pos..]).collect();
            pos = frames;
            r.process_partial_into_buffer(Some(&input), &mut tmp, None).map_err(|e| err(&e))?
        } else {
            r.process_partial_into_buffer(None::<&[&[f32]]>, &mut tmp, None).map_err(|e| err(&e))?
        };
        for (o, t) in out.iter_mut().zip(&tmp) {
            o.extend_from_slice(&t[..produced]);
        }
    }
    let mut data = Vec::with_capacity(want * ch);
    for i in delay..delay + want {
        for o in &out {
            data.push(o[i]);
        }
    }
    Ok(Sample::new(to, s.channels, data))
}
