//! The disc and the eyecatch, cut the way EZ2PORT's importer cuts them.

use crate::Rgba;

pub const DISC: u32 = 256;
pub const EYECATCH_W: u32 = 1024;
pub const EYECATCH_H: u32 = 512;
/// What the song-select exit shows of the eyecatch: it is drawn at its own
/// size into the 640x480 screen (tools/ez2play/select.c), so the top-left
/// 640x480 of the 1024x512 image.
pub const VISIBLE_W: u32 = 640;
pub const VISIBLE_H: u32 = 480;

/// A rectangle of source pixels; it may reach past the image (that part is black).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
pub struct Rect {
    pub x: i64,
    pub y: i64,
    pub w: u32,
    pub h: u32,
}

/// ez2/bmson.c `resize_rgba`: each destination pixel is the plain average of
/// the source pixels its box covers (at least one), RGB only - alpha is not
/// read. Integer arithmetic as the C has it, so the bytes match.
pub fn resize_rgb(src: &Rgba, dw: u32, dh: u32) -> Vec<u8> {
    resize_view(src, Rect { x: 0, y: 0, w: src.w, h: src.h }, dw, dh)
}

/// `resize_rgb` of the part of `src` under `r`, black where `r` reaches past
/// the image - the same bytes as cropping first (the importer copies its
/// square out), without holding the crop.
pub fn resize_view(src: &Rgba, r: Rect, dw: u32, dh: u32) -> Vec<u8> {
    let (sw, sh) = (r.w as i64, r.h as i64);
    let (dwi, dhi) = (dw as i64, dh as i64);
    let (iw, ih) = (src.w as i64, src.h as i64);
    let mut out = vec![0u8; (dw * dh * 3) as usize];
    for y in 0..dhi {
        let sy0 = y * sh / dhi;
        let sy1 = ((y + 1) * sh / dhi).max(sy0 + 1);
        for x in 0..dwi {
            let sx0 = x * sw / dwi;
            let sx1 = ((x + 1) * sw / dwi).max(sx0 + 1);
            let (mut red, mut green, mut blue, mut n) = (0i64, 0i64, 0i64, 0i64);
            for yy in sy0..sy1.min(sh) {
                let iy = r.y + yy;
                let row_in = (0..ih).contains(&iy);
                for xx in sx0..sx1.min(sw) {
                    n += 1;
                    let ix = r.x + xx;
                    if !row_in || !(0..iw).contains(&ix) {
                        continue;
                    }
                    let p = ((iy * iw + ix) * 4) as usize;
                    red += src.px[p] as i64;
                    green += src.px[p + 1] as i64;
                    blue += src.px[p + 2] as i64;
                }
            }
            let n = n.max(1);
            let o = ((y * dwi + x) * 3) as usize;
            out[o] = (red / n) as u8;
            out[o + 1] = (green / n) as u8;
            out[o + 2] = (blue / n) as u8;
        }
    }
    out
}

/// The importer's disc crop: the centred square as large as the image allows.
pub fn centre_square(w: u32, h: u32) -> Rect {
    let s = w.min(h);
    Rect { x: ((w - s) / 2) as i64, y: ((h - s) / 2) as i64, w: s, h: s }
}

/// `disc.abm`'s pixels (RGB, 256x256): `crop` (default: the centred square)
/// fit to 256, black outside the radius-125 circle round (127.5, 127.5), the
/// art's own pure black lifted to (1,1,1) so the port's black key does not
/// punch holes in it (bmson.c `write_disc`). The engine does not mask the
/// disc itself; every shipped one is cut like this.
pub fn disc(src: &Rgba, crop_to: Option<Rect>) -> Vec<u8> {
    let sq = crop_to.unwrap_or_else(|| centre_square(src.w, src.h));
    let mut out = resize_view(src, sq, DISC, DISC);
    for y in 0..DISC {
        for x in 0..DISC {
            let o = ((y * DISC + x) * 3) as usize;
            let (dx, dy) = (x as f64 - 127.5, y as f64 - 127.5);
            if dx * dx + dy * dy > 125.0 * 125.0 {
                out[o..o + 3].fill(0);
            } else if out[o..o + 3] == [0, 0, 0] {
                out[o..o + 3].fill(1);
            }
        }
    }
    out
}

/// How the eyecatch is framed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum Eyecatch {
    /// The whole image squeezed to 1024x512, as the port's importer does.
    Stretch,
    /// `crop` (4:3) fills what the screen shows - the top-left 640x480 - and
    /// the image carries on, at the same scale, right and down to 1024x512.
    Visible { crop: Rect },
}

/// `eyecatch.abm`'s pixels (RGB, 1024x512).
pub fn eyecatch(src: &Rgba, how: Eyecatch) -> Vec<u8> {
    match how {
        Eyecatch::Stretch => resize_rgb(src, EYECATCH_W, EYECATCH_H),
        Eyecatch::Visible { crop: c } => {
            let full = Rect {
                x: c.x,
                y: c.y,
                w: ((c.w as u64 * EYECATCH_W as u64 + VISIBLE_W as u64 / 2) / VISIBLE_W as u64)
                    as u32,
                h: ((c.h as u64 * EYECATCH_H as u64 + VISIBLE_H as u64 / 2) / VISIBLE_H as u64)
                    as u32,
            };
            resize_view(src, full, EYECATCH_W, EYECATCH_H)
        }
    }
}

/// One cut, as the editor asks for it (ez2bms.song.json's `disc` and
/// `eyecatch`): `{"kind":"disc","crop":{..}}`, `{"kind":"eyecatch","mode":"stretch"}`,
/// `{"kind":"eyecatch","mode":"visible","crop":{..}}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ArtJob {
    Disc {
        #[serde(default)]
        crop: Option<Rect>,
    },
    Eyecatch(Eyecatch),
}

/// A crop side larger than this is refused: nothing sensible needs it, and
/// the cut visits every pixel it covers.
pub const MAX_CROP: u32 = 2 * crate::MAX_SIDE;

/// The cut's size and its RGB pixels.
pub fn render(src: &Rgba, job: ArtJob) -> crate::Result<(u32, u32, Vec<u8>)> {
    let crop = match job {
        ArtJob::Disc { crop } => crop,
        ArtJob::Eyecatch(Eyecatch::Visible { crop }) => Some(crop),
        ArtJob::Eyecatch(Eyecatch::Stretch) => None,
    };
    if let Some(c) = crop {
        if c.w == 0 || c.h == 0 || c.w > MAX_CROP || c.h > MAX_CROP {
            return Err(crate::MediaError::BadCrop(format!("{}x{}", c.w, c.h)));
        }
    }
    Ok(match job {
        ArtJob::Disc { crop } => (DISC, DISC, disc(src, crop)),
        ArtJob::Eyecatch(how) => (EYECATCH_W, EYECATCH_H, eyecatch(src, how)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(w: u32, h: u32, c: [u8; 4]) -> Rgba {
        Rgba { w, h, px: c.iter().copied().cycle().take((w * h * 4) as usize).collect() }
    }

    #[test]
    fn a_box_averages_what_it_covers() {
        let mut src = solid(4, 2, [0, 0, 0, 255]);
        // left half white: halving the width averages pairs
        for y in 0..2 {
            for x in 0..2 {
                let p = ((y * 4 + x) * 4) as usize;
                src.px[p..p + 3].copy_from_slice(&[200, 100, 50]);
            }
        }
        assert_eq!(resize_rgb(&src, 2, 1), vec![200, 100, 50, 0, 0, 0]);
        assert_eq!(resize_rgb(&src, 1, 1), vec![100, 50, 25]);
        // up-scaling repeats pixels
        assert_eq!(resize_rgb(&solid(1, 1, [9, 8, 7, 255]), 2, 2), [9, 8, 7].repeat(4));
    }

    #[test]
    fn the_disc_is_a_keyed_circle_with_no_holes() {
        let d = disc(&solid(300, 200, [0, 0, 0, 255]), None);
        assert_eq!(&d[0..3], &[0, 0, 0], "a corner is the key colour");
        let c = ((128 * DISC + 128) * 3) as usize;
        assert_eq!(&d[c..c + 3], &[1, 1, 1], "black art inside is lifted off the key");
        // radius 125 round (127.5, 127.5): (2, 127) is outside, (3, 127) inside
        let at = |x: u32, y: u32| ((y * DISC + x) * 3) as usize;
        let lit = disc(&solid(10, 10, [50, 60, 70, 255]), None);
        assert_eq!(&lit[at(2, 127)..at(2, 127) + 3], &[0, 0, 0]);
        assert_eq!(&lit[at(3, 127)..at(3, 127) + 3], &[50, 60, 70]);
    }

    #[test]
    fn a_crop_past_the_edge_is_black() {
        let src = solid(2, 2, [9, 9, 9, 255]);
        assert_eq!(
            resize_view(&src, Rect { x: -1, y: 0, w: 2, h: 1 }, 2, 1),
            vec![0, 0, 0, 9, 9, 9]
        );
        // Averaged in: half of this box is off the image.
        assert_eq!(resize_view(&src, Rect { x: -1, y: 0, w: 2, h: 1 }, 1, 1), vec![4, 4, 4]);
    }

    #[test]
    fn jobs_read_as_the_editor_writes_them() {
        let job = |s: &str| serde_json::from_str::<ArtJob>(s).unwrap();
        assert_eq!(job(r#"{"kind":"disc"}"#), ArtJob::Disc { crop: None });
        assert_eq!(
            job(r#"{"kind":"disc","crop":{"x":-3,"y":4,"w":5,"h":5}}"#),
            ArtJob::Disc { crop: Some(Rect { x: -3, y: 4, w: 5, h: 5 }) }
        );
        assert_eq!(
            job(r#"{"kind":"eyecatch","mode":"stretch"}"#),
            ArtJob::Eyecatch(Eyecatch::Stretch)
        );
        assert_eq!(
            job(r#"{"kind":"eyecatch","mode":"visible","crop":{"x":0,"y":0,"w":4,"h":3}}"#),
            ArtJob::Eyecatch(Eyecatch::Visible { crop: Rect { x: 0, y: 0, w: 4, h: 3 } })
        );
        let src = solid(8, 8, [1, 2, 3, 255]);
        let bad = ArtJob::Disc { crop: Some(Rect { x: 0, y: 0, w: 0, h: 0 }) };
        assert!(render(&src, bad).is_err());
        let (w, h, px) = render(&src, ArtJob::Eyecatch(Eyecatch::Stretch)).unwrap();
        assert_eq!((w, h, px.len()), (1024, 512, 1024 * 512 * 3));
    }

    #[test]
    fn the_visible_eyecatch_keeps_the_crop_in_the_top_left_640x480() {
        // A 1600x1200 image whose left 1000 columns are red, the rest blue.
        let mut src = solid(1600, 1200, [0, 0, 255, 255]);
        for y in 0..1200 {
            for x in 0..1000 {
                let p = ((y * 1600 + x) * 4) as usize;
                src.px[p..p + 3].copy_from_slice(&[255, 0, 0]);
            }
        }
        // Crop the left 1000x750 (4:3): the visible 640 columns are all red.
        let out = eyecatch(&src, Eyecatch::Visible { crop: Rect { x: 0, y: 0, w: 1000, h: 750 } });
        let px = |x: u32, y: u32| &out[((y * 1024 + x) * 3) as usize..][..3];
        assert_eq!(px(639, 479), &[255, 0, 0]);
        assert_eq!(px(700, 10), &[0, 0, 255], "the image carries on to the right");
        assert_eq!(out.len(), (1024 * 512 * 3) as usize);
    }

    #[test]
    fn alpha_is_composited_onto_black() {
        let r = Rgba { w: 1, h: 2, px: vec![200, 100, 50, 0, 200, 100, 50, 128] }.on_black();
        assert_eq!(r.px, vec![0, 0, 0, 255, 100, 50, 25, 255]);
    }
}
