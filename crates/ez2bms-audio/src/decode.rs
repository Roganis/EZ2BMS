//! Any supported audio file to a [`Sample`] at its own rate: WAV (PCM, float,
//! ADPCM), OGG Vorbis, FLAC, MP3 - what BMS keysounds come in - plus EZ2's
//! own `.ssf`/`.ezw`, which have no magic and are recognised by extension.

use std::io::Cursor;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::error::{AudioError, Result};
use crate::sample::Sample;
use crate::ssf;

pub fn decode_file(path: &Path) -> Result<Sample> {
    let bytes = std::fs::read(path)
        .map_err(|source| AudioError::Io { path: path.to_path_buf(), source })?;
    let ext = path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase);
    decode(bytes, ext.as_deref())
}

/// Decode a whole file held in memory. `ext` (lowercase, no dot) is a hint.
pub fn decode(bytes: Vec<u8>, ext: Option<&str>) -> Result<Sample> {
    if matches!(ext, Some("ssf" | "ezw")) {
        return ssf::decode(&bytes);
    }
    let mss = MediaSourceStream::new(Box::new(Cursor::new(bytes)), Default::default());
    let mut hint = Hint::new();
    if let Some(e) = ext {
        hint.with_extension(e);
    }
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| AudioError::Decode(e.to_string()))?;
    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| AudioError::Decode("no audio track".into()))?;
    let track_id = track.id;
    let mut rate = track.codec_params.sample_rate;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| AudioError::Decode(e.to_string()))?;

    let mut out: Vec<f32> = Vec::new();
    let mut channels = 0usize;
    let mut buf: Option<SampleBuffer<f32>> = None;
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(SymError::ResetRequired) => break,
            Err(e) => return Err(AudioError::Decode(e.to_string())),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            // A damaged packet: skip it, as players do.
            Err(SymError::DecodeError(_)) => continue,
            Err(SymError::IoError(_)) => break,
            Err(e) => return Err(AudioError::Decode(e.to_string())),
        };
        let spec = *decoded.spec();
        rate.get_or_insert(spec.rate);
        let n = spec.channels.count();
        if n == 0 {
            continue;
        }
        if channels == 0 {
            channels = n;
        }
        let cap = decoded.capacity() as u64;
        let sb = match &mut buf {
            Some(b) if b.capacity() as u64 >= cap * n as u64 => b,
            _ => buf.insert(SampleBuffer::new(cap, spec)),
        };
        sb.copy_interleaved_ref(decoded);
        // The first packet's layout rules; a chained stream that changes
        // channel count mid-way is folded to it frame by frame.
        let two = channels >= 2;
        for frame in sb.samples().chunks_exact(n) {
            match (two, n) {
                (false, _) => out.push(frame[0]),
                (true, 1) => out.extend_from_slice(&[frame[0], frame[0]]),
                (true, _) => out.extend_from_slice(&frame[..2]),
            }
        }
    }
    let rate = rate.ok_or_else(|| AudioError::Decode("unknown sample rate".into()))?;
    let channels = channels.clamp(1, 2) as u16;
    if out.len() % channels as usize != 0 {
        out.pop();
    }
    Ok(Sample::new(rate, channels, out))
}
