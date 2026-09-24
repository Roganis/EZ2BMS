//! Song art for EZ2PORT packages: the disc (`disc.abm`, 256x256) and the
//! eyecatch (`eyecatch.abm`, 1024x512), cut from any PNG, JPEG or BMP, and
//! the title plate (`songname.abm`, text.rs).
//!
//! The pixel work follows EZ2PORT's own bmson importer (ez2/bmson.c
//! `resize_rgba`, `write_disc`, `write_eyecatch`) exactly, so a default crop
//! gives the importer's bytes; what EZ2BMS adds - a crop you choose, alpha
//! composited onto black, the camera's orientation - happens before those
//! steps. The `.abm` encoding itself is chart-core's (`encodeAbm`).

use std::io::Cursor;

use image::{DynamicImage, ImageDecoder, ImageReader};

pub mod art;
pub mod text;

pub use art::{disc, eyecatch, render, resize_rgb, resize_view, ArtJob, Eyecatch, Rect};

#[derive(Debug, thiserror::Error)]
pub enum MediaError {
    #[error("not an image EZ2BMS can read (PNG, JPEG or BMP): {0}")]
    Decode(String),
    #[error("{w}x{h} is too large (at most {max} pixels a side)")]
    TooLarge { w: u32, h: u32, max: u32 },
    #[error("a {0} crop cannot be cut")]
    BadCrop(String),
}

pub type Result<T> = std::result::Result<T, MediaError>;

/// Largest side accepted. Bigger art is pointless at 256 and 1024 pixels and
/// would take hundreds of megabytes to hold.
pub const MAX_SIDE: u32 = 8192;

/// Top-down RGBA, 8 bits a channel.
#[derive(Debug, Clone, PartialEq)]
pub struct Rgba {
    pub w: u32,
    pub h: u32,
    pub px: Vec<u8>,
}

impl Rgba {
    /// Straight alpha composited onto black. The port keys exact black as
    /// transparent and ignores alpha, so a transparent PNG corner must come
    /// out black, not whatever colour sits under its alpha.
    pub fn on_black(mut self) -> Rgba {
        for p in self.px.chunks_exact_mut(4) {
            let a = p[3] as u32;
            if a != 255 {
                for c in &mut p[..3] {
                    *c = ((*c as u32 * a + 127) / 255) as u8;
                }
                p[3] = 255;
            }
        }
        self
    }
}

/// Decode a PNG, JPEG or BMP, turned upright as its EXIF orientation says
/// (as a browser shows it), alpha composited onto black.
pub fn decode(bytes: &[u8]) -> Result<Rgba> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| MediaError::Decode(e.to_string()))?;
    let mut decoder = reader.into_decoder().map_err(|e| MediaError::Decode(e.to_string()))?;
    let (w, h) = decoder.dimensions();
    if w > MAX_SIDE || h > MAX_SIDE {
        return Err(MediaError::TooLarge { w, h, max: MAX_SIDE });
    }
    let orientation = decoder.orientation().ok();
    let mut img =
        DynamicImage::from_decoder(decoder).map_err(|e| MediaError::Decode(e.to_string()))?;
    if let Some(o) = orientation {
        img.apply_orientation(o);
    }
    let rgba = img.into_rgba8();
    Ok(Rgba { w: rgba.width(), h: rgba.height(), px: rgba.into_raw() }.on_black())
}
