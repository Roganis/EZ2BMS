//! EZ2AC `.ssf` (and the older `.ezw`) keysounds: raw PCM behind an 18-byte
//! header that is the tail of a WAVEFORMATEX plus a byte count, no magic.
//!
//! ```text
//! 0x00 u16 channels      0x02 u32 sample rate
//! 0x06 u32 byte rate     0x0a u16 block align
//! 0x0c u16 bits          0x0e u32 data bytes
//! 0x12 PCM
//! ```
//!
//! Validation follows EZ2PORT's `ez2_ssf_parse` exactly: with no magic number,
//! the two redundant fields (block align, byte rate) must agree with the rest.
//! EZ2PORT's mixer plays 16-bit files only, so that is all EZ2BMS writes.

use crate::error::{AudioError, Result};
use crate::sample::Sample;

pub const SSF_HEADER: usize = 18;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SsfInfo {
    pub channels: u16,
    pub rate: u32,
    pub byte_rate: u32,
    pub block_align: u16,
    pub bits: u16,
    pub data_bytes: u32,
}

impl SsfInfo {
    pub fn frames(&self) -> usize {
        if self.block_align == 0 {
            0
        } else {
            self.data_bytes as usize / self.block_align as usize
        }
    }
}

fn rd16(b: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([b[at], b[at + 1]])
}

fn rd32(b: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}

/// Parse and validate a header; returns it and the PCM it declares.
pub fn parse(bytes: &[u8]) -> Result<(SsfInfo, &[u8])> {
    if bytes.len() < SSF_HEADER {
        return Err(AudioError::Ssf("shorter than the 18-byte header"));
    }
    let h = SsfInfo {
        channels: rd16(bytes, 0x00),
        rate: rd32(bytes, 0x02),
        byte_rate: rd32(bytes, 0x06),
        block_align: rd16(bytes, 0x0a),
        bits: rd16(bytes, 0x0c),
        data_bytes: rd32(bytes, 0x0e),
    };
    let consistent = (1..=8).contains(&h.channels)
        && matches!(h.bits, 8 | 16 | 24 | 32)
        && (1000..=192_000).contains(&h.rate)
        && h.block_align as u32 == h.channels as u32 * (h.bits as u32 / 8)
        && h.byte_rate as u64 == h.rate as u64 * h.block_align as u64;
    if !consistent {
        return Err(AudioError::Ssf("header is not self-consistent"));
    }
    if h.data_bytes as usize > bytes.len() - SSF_HEADER {
        return Err(AudioError::Ssf("declares more PCM than the file holds"));
    }
    Ok((h, &bytes[SSF_HEADER..SSF_HEADER + h.data_bytes as usize]))
}

/// A 16-bit `.ssf`/`.ezw` from interleaved PCM.
pub fn encode_pcm16(channels: u16, rate: u32, pcm: &[i16]) -> Vec<u8> {
    assert!(channels >= 1 && pcm.len() % channels as usize == 0);
    let block = channels as u32 * 2;
    let data = pcm.len() as u32 * 2;
    let mut out = Vec::with_capacity(SSF_HEADER + data as usize);
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * block).to_le_bytes());
    out.extend_from_slice(&(block as u16).to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(&data.to_le_bytes());
    for s in pcm {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

/// An `.ssf` around PCM exactly as it is: the inverse of the import's
/// `wav::wrap_pcm`, so a keysound that came from the game goes back to it with
/// the same samples, rate and channels - a cabinet export rewraps a 16-bit
/// WAV rather than decoding and resampling it (export.rs).
pub fn wrap_pcm(bits: u16, channels: u16, rate: u32, pcm: &[u8]) -> Vec<u8> {
    let block = channels as u32 * (bits as u32 / 8);
    let mut out = Vec::with_capacity(SSF_HEADER + pcm.len());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * block).to_le_bytes());
    out.extend_from_slice(&(block as u16).to_le_bytes());
    out.extend_from_slice(&bits.to_le_bytes());
    out.extend_from_slice(&(pcm.len() as u32).to_le_bytes());
    out.extend_from_slice(pcm);
    out
}

/// Whether two `.ssf` files hold the same audio: the same format and the same
/// PCM, whatever follows the declared data (the game's files sometimes carry
/// a tail the header does not count).
pub fn same_audio(a: &[u8], b: &[u8]) -> bool {
    match (parse(a), parse(b)) {
        (Ok((ha, pa)), Ok((hb, pb))) => {
            ha.channels == hb.channels && ha.rate == hb.rate && ha.bits == hb.bits && pa == pb
        }
        _ => false,
    }
}

/// Decode a `.ssf`/`.ezw` into a Sample (8-bit is unsigned, as in WAV; wider
/// than stereo keeps the first two channels).
pub fn decode(bytes: &[u8]) -> Result<Sample> {
    let (h, pcm) = parse(bytes)?;
    let ch = h.channels as usize;
    let width = h.bits as usize / 8;
    let frames = h.frames();
    let keep = ch.min(2);
    let mut data = Vec::with_capacity(frames * keep);
    for f in 0..frames {
        for c in 0..keep {
            let at = (f * ch + c) * width;
            let s = &pcm[at..at + width];
            let x = match h.bits {
                8 => (s[0] as f32 - 128.0) / 128.0,
                16 => i16::from_le_bytes([s[0], s[1]]) as f32 / 32768.0,
                24 => (i32::from_le_bytes([0, s[0], s[1], s[2]]) >> 8) as f32 / 8_388_608.0,
                _ => i32::from_le_bytes([s[0], s[1], s[2], s[3]]) as f32 / 2_147_483_648.0,
            };
            data.push(x);
        }
    }
    Ok(Sample::new(h.rate, keep as u16, data))
}
