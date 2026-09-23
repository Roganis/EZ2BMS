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
