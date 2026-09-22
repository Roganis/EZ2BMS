//! Decoded audio held in memory: f32, interleaved, mono or stereo.

/// Full scale for 16-bit PCM, both ways: `i16 / 32768` in, `* 32768` out, so a
/// 16-bit source survives a decode and re-encode bit for bit.
pub const PCM16_SCALE: f32 = 32768.0;

#[derive(Debug, Clone, PartialEq)]
pub struct Sample {
    pub rate: u32,
    /// 1 or 2. Anything wider is folded to its first two channels on decode.
    pub channels: u16,
    /// Interleaved frames.
    pub data: Vec<f32>,
}

impl Sample {
    pub fn new(rate: u32, channels: u16, data: Vec<f32>) -> Self {
        assert!(channels == 1 || channels == 2, "a Sample is mono or stereo");
        assert_eq!(data.len() % channels as usize, 0, "a partial frame");
        Sample { rate, channels, data }
    }

    pub fn silence(rate: u32, channels: u16, frames: usize) -> Self {
        Sample::new(rate, channels, vec![0.0; frames * channels as usize])
    }

    pub fn from_pcm16(rate: u32, channels: u16, pcm: &[i16]) -> Self {
        Sample::new(rate, channels, pcm.iter().map(|&s| s as f32 / PCM16_SCALE).collect())
    }

    pub fn frames(&self) -> usize {
        self.data.len() / self.channels as usize
    }

    pub fn seconds(&self) -> f64 {
        self.frames() as f64 / self.rate as f64
    }

    /// Frame `i` as (left, right); mono plays on both sides.
    #[inline]
    pub fn frame(&self, i: usize) -> (f32, f32) {
        if self.channels == 1 {
            let x = self.data[i];
            (x, x)
        } else {
            (self.data[2 * i], self.data[2 * i + 1])
        }
    }

    /// Bytes of sample data held.
    pub fn bytes(&self) -> usize {
        self.data.len() * std::mem::size_of::<f32>()
    }
}

/// One f32 sample to 16-bit PCM: the exact inverse of `i16 / 32768`, clamped.
#[inline]
pub fn to_pcm16(x: f32) -> i16 {
    (x * PCM16_SCALE).round().clamp(-32768.0, 32767.0) as i16
}
