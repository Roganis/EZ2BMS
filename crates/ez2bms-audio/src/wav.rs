//! 16-bit PCM RIFF/WAVE, for BMS export and for handing a cut to other tools.

pub fn encode_pcm16(channels: u16, rate: u32, pcm: &[i16]) -> Vec<u8> {
    assert!(channels >= 1 && pcm.len() % channels as usize == 0);
    let block = channels as u32 * 2;
    let data = pcm.len() as u32 * 2;
    let mut out = Vec::with_capacity(44 + data as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * block).to_le_bytes());
    out.extend_from_slice(&(block as u16).to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data.to_le_bytes());
    for s in pcm {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

/// A RIFF/WAVE around PCM exactly as it is: `bits` 8 (unsigned, as WAV and
/// `.ssf` both store it), 16, 24 or 32 (signed little-endian). What an
/// imported `.ssf`/`.ezw` becomes: the samples are not decoded or touched,
/// only given the header every other tool reads. An odd-length data chunk
/// gets RIFF's pad byte.
pub fn wrap_pcm(bits: u16, channels: u16, rate: u32, pcm: &[u8]) -> Vec<u8> {
    let block = channels as u32 * (bits as u32 / 8);
    let data = pcm.len() as u32;
    let pad = data & 1;
    let mut out = Vec::with_capacity(44 + (data + pad) as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data + pad).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * block).to_le_bytes());
    out.extend_from_slice(&(block as u16).to_le_bytes());
    out.extend_from_slice(&bits.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data.to_le_bytes());
    out.extend_from_slice(pcm);
    if pad == 1 {
        out.push(0);
    }
    out
}

/// A RIFF/WAVE's integer PCM as it is stored, when that is what it holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WavPcm<'a> {
    pub bits: u16,
    pub channels: u16,
    pub rate: u32,
    pub pcm: &'a [u8],
}

/// The PCM of a WAV file whose format is plain integer PCM (format tag 1, or
/// WAVE_FORMAT_EXTENSIBLE with the PCM sub-format), found by walking its
/// chunks (RIFF pads odd sizes). None for anything else - float, ADPCM, a
/// broken header - which has to be decoded instead. A data chunk cut short
/// by the end of the file gives what is there.
pub fn parse_pcm(b: &[u8]) -> Option<WavPcm<'_>> {
    if b.len() < 12 || &b[0..4] != b"RIFF" || &b[8..12] != b"WAVE" {
        return None;
    }
    let rd16 = |at: usize| u16::from_le_bytes([b[at], b[at + 1]]);
    let rd32 = |at: usize| u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]]);
    let mut fmt: Option<(u16, u16, u32)> = None;
    let mut p = 12usize;
    while p + 8 <= b.len() {
        let id = &b[p..p + 4];
        let size = rd32(p + 4) as usize;
        let body = p + 8;
        if id == b"fmt " {
            if size < 16 || body + 16 > b.len() {
                return None;
            }
            let tag = rd16(body);
            let channels = rd16(body + 2);
            let rate = rd32(body + 4);
            let block = rd16(body + 12);
            let bits = rd16(body + 14);
            let pcm_tag = tag == 1
                || (tag == 0xfffe && size >= 40 && body + 26 <= b.len() && rd16(body + 24) == 1);
            if !pcm_tag
                || channels == 0
                || !matches!(bits, 8 | 16 | 24 | 32)
                || block as u32 != channels as u32 * (bits as u32 / 8)
            {
                return None;
            }
            fmt = Some((bits, channels, rate));
        } else if id == b"data" {
            let (bits, channels, rate) = fmt?;
            let end = body.saturating_add(size).min(b.len());
            return Some(WavPcm { bits, channels, rate, pcm: &b[body..end] });
        }
        p = body.saturating_add(size).saturating_add(size & 1);
    }
    None
}
