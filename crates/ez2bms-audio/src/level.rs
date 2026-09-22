//! Velocity and pan, as EZ2PORT's mixer applies them
//! (platform/common/ezaudio.c: ezSoundVolume, then ezSoundPan).
//!
//! The chart's velocity and pan become DirectSound units first - that
//! arithmetic lives in chart-core (`ez2data/mixparam.ts`, oracle-tested) and
//! arrives here as a level in hundredths of a dB and a pan of -10000..10000.

/// Hundredths of a decibel to a linear gain; -10000 and below is silence.
pub fn db100_to_gain(db100: i32) -> f32 {
    if db100 <= -10000 {
        return 0.0;
    }
    10f32.powf(db100 as f32 / 2000.0)
}

/// Left and right gains for a DirectSound level and pan. Pan turns ONE side
/// down and leaves the other at the level: a centred stereo sample keeps its
/// own stereo image.
pub fn ds_gains(level: i32, pan: i32) -> (f32, f32) {
    let g = db100_to_gain(level);
    let (l, r) = if pan > 0 {
        (db100_to_gain(-pan), 1.0)
    } else if pan < 0 {
        (1.0, db100_to_gain(pan))
    } else {
        (1.0, 1.0)
    };
    (g * l, g * r)
}

/// EZ2PORT's output stage: unity up to 0.9, then a curve that approaches 1.0
/// and never passes it, so a loud peak loses its point and keeps its shape.
#[inline]
pub fn soft_knee(x: f32) -> f32 {
    const KNEE: f32 = 0.9;
    const ROOM: f32 = 1.0 - 0.9;
    let a = x.abs();
    if a <= KNEE {
        return x;
    }
    let over = (a - KNEE) / ROOM;
    let y = KNEE + ROOM * (over / (1.0 + over));
    if x < 0.0 {
        -y
    } else {
        y
    }
}

/// Master gain, knee, then a hard clamp (a wrapped sample would click).
pub fn output_stage(buf: &mut [f32], master: f32) {
    for v in buf {
        *v = soft_knee(*v * master).clamp(-1.0, 1.0);
    }
}
