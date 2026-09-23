//! Keysounds for an export (M6): a cabinet's `.ssf`, a BMS folder's `.wav`.
//!
//! What goes to the game as it came from it is never decoded: a whole 16-bit
//! PCM file - the `.wav` an imported `.ssf` became, or an `.ssf` itself - is
//! rewrapped with its samples, rate and channels untouched, so a song sent
//! back sounds as it did and a keysound already in the game's folder is seen
//! to be the same file (ssf::same_audio). Anything else - a slice, another
//! format, another bit depth - is cut exactly as a publish cuts it: 16-bit
//! stereo at 44.1 kHz, sample-exact (cut.rs). EZ2PORT's mixer plays 16-bit
//! files only, and nothing says the original plays more.
//!
//! For BMS: whole WAVs are copied, whole `.ssf`/`.ezw` rewrapped as WAV,
//! other whole files decoded to 16-bit WAV at their own rate; slices cut at
//! 44.1 kHz like the cabinet's.

use std::path::{Path, PathBuf};

use crate::cache::SampleCache;
use crate::cut::{self, PUBLISH_RATE};
use crate::decode;
use crate::error::{AudioError, Result};
use crate::sample::to_pcm16;
use crate::{ssf, wav};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SoundFormat {
    /// The cabinet's `.ssf`.
    Ssf,
    /// A BMS folder's `.wav`.
    Wav,
}

/// How a keysound is made.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum How {
    /// Its PCM, untouched, under the other header.
    Rewrap,
    /// The file as it is.
    Copy,
    /// Cut (or converted) at 44.1 kHz, 16-bit stereo.
    Cut,
    /// Decoded to 16-bit at its own rate and channels.
    Decode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SoundJob {
    pub src: PathBuf,
    /// Frames at 44.1 kHz, as chart-core's keysound table counts them.
    pub start_frame: u64,
    pub end_frame: Option<u64>,
    pub format: SoundFormat,
}

impl SoundJob {
    fn whole(&self) -> bool {
        self.start_frame == 0 && self.end_frame.is_none()
    }
}

fn ext(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

fn read(p: &Path) -> Result<Vec<u8>> {
    std::fs::read(p).map_err(|source| AudioError::Io { path: p.to_path_buf(), source })
}

/// A whole file's 16-bit PCM as stored (mono or stereo), when it has that.
fn pcm16_of(bytes: &[u8], ext: &str) -> Option<(u16, u32, Vec<u8>)> {
    if ext == "ssf" || ext == "ezw" {
        let (h, pcm) = ssf::parse(bytes).ok()?;
        (h.bits == 16 && h.channels <= 2).then(|| (h.channels, h.rate, pcm.to_vec()))
    } else if ext == "wav" {
        let w = wav::parse_pcm(bytes)?;
        (w.bits == 16 && w.channels <= 2 && w.pcm.len() % (w.channels as usize * 2) == 0)
            .then(|| (w.channels, w.rate, w.pcm.to_vec()))
    } else {
        None
    }
}

/// How a job would be made, reading only the file itself (no decoding).
pub fn how(job: &SoundJob) -> Result<How> {
    if !job.whole() {
        return Ok(How::Cut);
    }
    let e = ext(&job.src);
    Ok(match job.format {
        SoundFormat::Ssf => {
            if pcm16_of(&read(&job.src)?, &e).is_some() {
                How::Rewrap
            } else {
                How::Cut
            }
        }
        SoundFormat::Wav => match e.as_str() {
            "wav" => How::Copy,
            "ssf" | "ezw" => How::Rewrap,
            _ => How::Decode,
        },
    })
}

/// The bytes of one keysound. `publish` is a cache at [`PUBLISH_RATE`] (the
/// one publish cuts from), used only when a sound has to be cut.
pub fn export_sound(publish: &SampleCache, job: &SoundJob) -> Result<(Vec<u8>, How)> {
    let e = ext(&job.src);
    let cut_pcm = |job: &SoundJob| -> Result<Vec<i16>> {
        if publish.rate() != PUBLISH_RATE {
            return Err(AudioError::Schedule(format!(
                "an export cuts from a {PUBLISH_RATE} Hz cache, not {}",
                publish.rate()
            )));
        }
        let s = publish.get(&job.src)?;
        let mut pcm = cut::pcm16_stereo(&s, job.start_frame, job.end_frame);
        if pcm.is_empty() {
            pcm = vec![0; 64 * 2]; // as a publish cuts an empty range
        }
        Ok(pcm)
    };
    match job.format {
        SoundFormat::Ssf => {
            if job.whole() {
                if let Some((channels, rate, pcm)) = pcm16_of(&read(&job.src)?, &e) {
                    return Ok((ssf::wrap_pcm(16, channels, rate, &pcm), How::Rewrap));
                }
            }
            Ok((ssf::encode_pcm16(2, PUBLISH_RATE, &cut_pcm(job)?), How::Cut))
        }
        SoundFormat::Wav => {
            if !job.whole() {
                return Ok((wav::encode_pcm16(2, PUBLISH_RATE, &cut_pcm(job)?), How::Cut));
            }
            match e.as_str() {
                "wav" => Ok((read(&job.src)?, How::Copy)),
                "ssf" | "ezw" => {
                    let bytes = read(&job.src)?;
                    let (h, pcm) = ssf::parse(&bytes)?;
                    Ok((wav::wrap_pcm(h.bits, h.channels, h.rate, pcm), How::Rewrap))
                }
                _ => {
                    let s = decode::decode_file(&job.src)?;
                    let pcm: Vec<i16> = s.data.iter().map(|&x| to_pcm16(x)).collect();
                    Ok((wav::encode_pcm16(s.channels, s.rate, &pcm), How::Decode))
                }
            }
        }
    }
}
