//! Title plates: text rendered the way EZ2PORT renders its own (ez2/ttf.c
//! `ez2_ttf_render_box`, ez2/textspec.c `ez2_textspec_render`), transcribed
//! around the same stb_truetype v1.26 (third_party/stb), so a plate made here
//! is byte for byte the plate the port makes from the same spec - the
//! chart-core oracle test renders both.
//!
//! A plate is a small RGB tile (the wheel's is 256x32) holding lines of text.
//! Coverage goes into the colour and black is the game's transparent key: the
//! wheel draws plates additively, where alpha means nothing (TEXT.md s3).

use std::ffi::c_int;
use std::path::Path;
use std::ptr::NonNull;
use std::sync::Arc;

use serde::Deserialize;

mod ffi {
    use std::ffi::{c_float, c_int, c_uchar};

    #[repr(C)]
    pub struct Face {
        _private: [u8; 0],
    }

    extern "C" {
        pub fn ez2bms_stb_face_count(data: *const c_uchar) -> c_int;
        pub fn ez2bms_stb_open(data: *const c_uchar, index: c_int) -> *mut Face;
        pub fn ez2bms_stb_close(f: *mut Face);
        pub fn ez2bms_stb_glyph(f: *const Face, cp: c_int) -> c_int;
        pub fn ez2bms_stb_codepoint_box(
            f: *const Face,
            cp: c_int,
            x0: *mut c_int,
            y0: *mut c_int,
            x1: *mut c_int,
            y1: *mut c_int,
        ) -> c_int;
        pub fn ez2bms_stb_vmetrics(
            f: *const Face,
            ascent: *mut c_int,
            descent: *mut c_int,
            gap: *mut c_int,
        );
        pub fn ez2bms_stb_hmetrics(f: *const Face, cp: c_int, advance: *mut c_int, lsb: *mut c_int);
        pub fn ez2bms_stb_kern(f: *const Face, a: c_int, b: c_int) -> c_int;
        #[allow(clippy::too_many_arguments)]
        pub fn ez2bms_stb_bitmap_box(
            f: *const Face,
            cp: c_int,
            sx: c_float,
            sy: c_float,
            shift_x: c_float,
            shift_y: c_float,
            x0: *mut c_int,
            y0: *mut c_int,
            x1: *mut c_int,
            y1: *mut c_int,
        );
        #[allow(clippy::too_many_arguments)]
        pub fn ez2bms_stb_bitmap(
            f: *const Face,
            out: *mut c_uchar,
            w: c_int,
            h: c_int,
            stride: c_int,
            sx: c_float,
            sy: c_float,
            shift_x: c_float,
            shift_y: c_float,
            cp: c_int,
        );
    }
}

#[derive(Debug, thiserror::Error)]
pub enum TextError {
    #[error("cannot read the font {0}: {1}")]
    Font(String, String),
    #[error("{0} is not a font EZ2BMS can use")]
    NotAFont(String),
    #[error("the text needs a CJK font, and none is installed (run scripts/fetch-fonts.mjs)")]
    NoCjkFont,
    #[error("a {0}x{1} plate cannot be rendered")]
    BadSize(i32, i32),
}

/// A font file's bytes, shared by its faces.
pub struct FontFile {
    name: String,
    bytes: Vec<u8>,
}

impl FontFile {
    pub fn read(path: &Path) -> Result<Arc<FontFile>, TextError> {
        let name = path.display().to_string();
        let bytes =
            std::fs::read(path).map_err(|e| TextError::Font(name.clone(), e.to_string()))?;
        Self::from_bytes(name, bytes)
    }

    pub fn from_bytes(name: String, bytes: Vec<u8>) -> Result<Arc<FontFile>, TextError> {
        // stb reads without range checks: at least the header must be there.
        let tag = bytes.get(..4).unwrap_or_default();
        let known = [b"ttcf".as_slice(), b"OTTO", b"true", &[0, 1, 0, 0]].contains(&tag);
        if bytes.len() < 12 || !known {
            return Err(TextError::NotAFont(name));
        }
        Ok(Arc::new(FontFile { name, bytes }))
    }

    /// How many faces the file holds (a collection has several).
    pub fn faces(&self) -> i32 {
        // SAFETY: the header was checked; stb reads the table directory.
        unsafe { ffi::ez2bms_stb_face_count(self.bytes.as_ptr()) }
    }
}

/// One face of a font file.
pub struct Face {
    /// Kept for its bytes, which stb reads from.
    _file: Arc<FontFile>,
    raw: NonNull<ffi::Face>,
}

// SAFETY: stb only reads the face and the file's bytes, which the face keeps alive.
unsafe impl Send for Face {}
unsafe impl Sync for Face {}

impl Drop for Face {
    fn drop(&mut self) {
        // SAFETY: opened by ez2bms_stb_open, closed once.
        unsafe { ffi::ez2bms_stb_close(self.raw.as_ptr()) }
    }
}

impl Face {
    /// Face `index`; one out of range is face 0, as the port takes it.
    pub fn open(file: &Arc<FontFile>, index: i32) -> Result<Face, TextError> {
        let index = if index < 0 || index >= file.faces() { 0 } else { index };
        // SAFETY: the bytes live as long as `file`, which the face holds.
        let raw = unsafe { ffi::ez2bms_stb_open(file.bytes.as_ptr(), index) };
        NonNull::new(raw)
            .map(|raw| Face { _file: file.clone(), raw })
            .ok_or_else(|| TextError::NotAFont(file.name.clone()))
    }

    fn p(&self) -> *const ffi::Face {
        self.raw.as_ptr()
    }

    /// The face has a glyph for `c` (else it draws its "missing" box).
    pub fn has(&self, c: char) -> bool {
        // SAFETY: a live face.
        unsafe { ffi::ez2bms_stb_glyph(self.p(), c as c_int) != 0 }
    }

    fn hmetrics(&self, cp: c_int) -> (c_int, c_int) {
        let (mut adv, mut lsb) = (0, 0);
        // SAFETY: a live face, out-pointers to locals.
        unsafe { ffi::ez2bms_stb_hmetrics(self.p(), cp, &mut adv, &mut lsb) };
        (adv, lsb)
    }

    fn kern(&self, a: c_int, b: c_int) -> c_int {
        // SAFETY: a live face.
        unsafe { ffi::ez2bms_stb_kern(self.p(), a, b) }
    }
}

/// Where a line sits against its `x` (ez2/ttf.h `align`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Align {
    /// The ink ends at `x` (0).
    Right,
    /// Centred on `x` (1).
    Center,
    /// Starts at `x` (2).
    Left,
}

/// The code points of `text` as ez2/ttf.c `utf8_next` walks them: the text
/// ends at a NUL, as a C string does.
fn code_points(text: &str) -> impl Iterator<Item = c_int> + '_ {
    text.chars().take_while(|&c| c != '\0').map(|c| c as c_int)
}

/// ez2/ttf.c `ez2_ttf_render_box`: `text` in white on black into the top-down
/// RGB buffer `rgb` (`w` x `h`), capitals `cap_px` tall on row `baseline`,
/// placed against `x` by `align`. A line wider than `max_width` is condensed
/// sideways to it; with `max_width` 0, a line too wide for the tile is
/// scaled down both ways. Each pixel keeps the brighter of what it had and
/// the glyph's coverage. The arithmetic is the C's, in f32, step for step.
#[allow(clippy::too_many_arguments)]
pub fn render_box(
    face: &Face,
    text: &str,
    rgb: &mut [u8],
    w: i32,
    h: i32,
    x: i32,
    baseline: i32,
    cap_px: f32,
    align: Align,
    max_width: i32,
) {
    let right_x = x;
    // The scale that makes a capital `cap_px` tall.
    let (mut x0, mut y0, mut x1, mut y1) = (0, 0, 0, 0);
    // SAFETY: a live face, out-pointers to locals.
    let boxed = unsafe {
        ffi::ez2bms_stb_codepoint_box(face.p(), 'H' as c_int, &mut x0, &mut y0, &mut x1, &mut y1)
    };
    if boxed == 0 || y1 <= y0 {
        let (mut asc, mut desc, mut gap) = (0, 0, 0);
        // SAFETY: as above.
        unsafe { ffi::ez2bms_stb_vmetrics(face.p(), &mut asc, &mut desc, &mut gap) };
        y0 = 0;
        y1 = (asc as f32 * 0.72f32) as c_int;
    }
    let mut scale: f32 = cap_px / (y1 - y0) as f32;

    // Measure, and squeeze a long title into the plate.
    let mut width: f32 = 0.0;
    let mut prev: c_int = 0;
    for cp in code_points(text) {
        let (adv, _) = face.hmetrics(cp);
        if prev != 0 {
            width += face.kern(prev, cp) as f32 * scale;
        }
        width += adv as f32 * scale;
        prev = cp;
    }
    let mut scale_x = scale;
    if max_width > 0 {
        // Condensed: only the x scale shrinks; the capitals keep cap_px.
        if width > max_width as f32 && width > 0.0 {
            scale_x = scale * max_width as f32 / width;
            width = max_width as f32;
        }
    } else {
        let room = match align {
            Align::Right => (right_x - 6) as f32,
            Align::Center => w as f32 - 6.0,
            Align::Left => (w - right_x - 6) as f32,
        };
        if width > room && width > 0.0 {
            scale *= room / width;
            width = room;
        }
        scale_x = scale;
    }
    let mut pen: f32 = match align {
        Align::Right => right_x as f32 - width,
        Align::Center => right_x as f32 - width / 2.0,
        Align::Left => right_x as f32,
    };
    prev = 0;
    let mut bmp: Vec<u8> = Vec::new();
    for cp in code_points(text) {
        if prev != 0 {
            pen += face.kern(prev, cp) as f32 * scale_x;
        }
        let (adv, _) = face.hmetrics(cp);
        let xshift = pen - (pen as c_int) as f32;
        let (mut gx0, mut gy0, mut gx1, mut gy1) = (0, 0, 0, 0);
        // SAFETY: a live face, out-pointers to locals.
        unsafe {
            ffi::ez2bms_stb_bitmap_box(
                face.p(),
                cp,
                scale_x,
                scale,
                xshift,
                0.0,
                &mut gx0,
                &mut gy0,
                &mut gx1,
                &mut gy1,
            )
        };
        let (gw, gh) = (gx1 - gx0, gy1 - gy0);
        if gw > 0 && gh > 0 {
            bmp.clear();
            bmp.resize((gw * gh) as usize, 0);
            // SAFETY: `bmp` holds gw*gh bytes with stride gw.
            unsafe {
                ffi::ez2bms_stb_bitmap(
                    face.p(),
                    bmp.as_mut_ptr(),
                    gw,
                    gh,
                    gw,
                    scale_x,
                    scale,
                    xshift,
                    0.0,
                    cp,
                )
            };
            for gy in 0..gh {
                for gx in 0..gw {
                    let px = pen as c_int + gx0 + gx;
                    let py = baseline + gy0 + gy;
                    let v = bmp[(gy * gw + gx) as usize];
                    if px < 0 || px >= w || py < 0 || py >= h || v == 0 {
                        continue;
                    }
                    let p = ((py * w + px) * 3) as usize;
                    if v > rgb[p] {
                        rgb[p..p + 3].fill(v);
                    }
                }
            }
        }
        pen += adv as f32 * scale_x;
        prev = cp;
    }
}

/// A face a line asks for (textspec.c's faces; the plates use the bold ones).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FaceName {
    /// Roboto Bold; a line with CJK text in it is set in `cjkbold` instead.
    Bold,
    /// Noto Sans CJK Bold, in the plate's regional forms.
    Cjkbold,
}

/// Which forms of the shared ideographs a CJK line takes: Noto Sans CJK keeps
/// them as faces 0..4 of one collection (EZ2PORT's `@cjk`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CjkForms {
    Jp,
    Kr,
    Sc,
    Tc,
    Hk,
}

impl CjkForms {
    fn face(self) -> i32 {
        self as i32
    }
}

/// An RGB colour as the manifest writes it, `rrggbb`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgb(pub u32);

impl<'de> Deserialize<'de> for Rgb {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        let ok = s.len() == 6 && s.bytes().all(|b| b.is_ascii_hexdigit());
        if !ok {
            return Err(serde::de::Error::custom(format!("{s:?} is not an rrggbb colour")));
        }
        Ok(Rgb(u32::from_str_radix(&s, 16).map_err(serde::de::Error::custom)?))
    }
}

/// One line of a plate: a manifest `line` (TEXT.md s3), its words given.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlateLine {
    pub text: String,
    pub x: i32,
    pub baseline: i32,
    pub cap: f32,
    pub face: FaceName,
    pub ink: Rgb,
    /// A three-pixel halo of this colour round the ink.
    #[serde(default)]
    pub glow: Option<Rgb>,
    pub align: Align,
    /// Condense a wider line to this many pixels (0: no cap).
    #[serde(default)]
    pub max_width: i32,
    /// Sheared 12 degrees about the baseline.
    #[serde(default)]
    pub oblique: bool,
}

/// A plate to render: its size and lines.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct PlateSpec {
    pub w: i32,
    pub h: i32,
    pub lines: Vec<PlateLine>,
    /// The forms CJK lines take (absent: the collection's first face, JP,
    /// as the port takes it without `@cjk`).
    #[serde(default)]
    pub cjk: Option<CjkForms>,
}

/// The fonts plates are set in (fonts/README.md).
#[derive(Clone)]
pub struct Fonts {
    pub bold: Arc<FontFile>,
    /// Absent when the CJK collection has not been fetched.
    pub cjk_bold: Option<Arc<FontFile>>,
}

impl Fonts {
    /// `Roboto-Bold.ttf` and, when present, `NotoSansCJK-Bold.ttc` in `dir`.
    pub fn from_dir(dir: &Path) -> Result<Fonts, TextError> {
        let cjk = dir.join("NotoSansCJK-Bold.ttc");
        Ok(Fonts {
            bold: FontFile::read(&dir.join("Roboto-Bold.ttf"))?,
            cjk_bold: if cjk.is_file() { Some(FontFile::read(&cjk)?) } else { None },
        })
    }
}

/// A rendered plate.
#[derive(Debug, Clone, PartialEq)]
pub struct Plate {
    pub w: i32,
    pub h: i32,
    /// Top-down RGBA, as `ez2_textspec_render` returns it: the ink's coverage
    /// in the colour, alpha 255 where there is ink. The `.abm` takes the RGB.
    pub rgba: Vec<u8>,
    /// Characters the face a line was set in has no glyph for (drawn as its
    /// "missing" box), in order, each once.
    pub missing: Vec<char>,
}

impl Plate {
    pub fn rgb(&self) -> Vec<u8> {
        self.rgba.chunks_exact(4).flat_map(|p| [p[0], p[1], p[2]]).collect()
    }
}

/// textspec.c `has_cjk`: a character the Latin faces do not have - CJK
/// ideographs, kana, hangul, the CJK punctuation and full-width forms.
pub fn has_cjk(text: &str) -> bool {
    code_points(text).any(|c| {
        let cp = c as u32;
        (0x1100..0x1200).contains(&cp)
            || (0x2e80..0xa000).contains(&cp)
            || (0xac00..0xd7b0).contains(&cp)
            || (0xf900..0xfb00).contains(&cp)
            || (0xff00..0xfff0).contains(&cp)
            || cp >= 0x20000
    })
}

/// textspec.c `shear_rows`: every row slides right by a fifth of its height
/// above the baseline (tan 12 degrees is 0.21), the fraction split between
/// two columns.
fn shear_rows(rgb: &mut [u8], w: i32, h: i32, baseline: i32) {
    let mut row = vec![0u8; w as usize];
    for y in 0..h {
        let shift = (baseline - y) as f32 * 0.21f32;
        let whole = shift.floor() as i32;
        let frac = shift - whole as f32;
        let src = &mut rgb[(y * w * 3) as usize..((y + 1) * w * 3) as usize];
        for x in 0..w as usize {
            row[x] = src[x * 3];
        }
        for x in 0..w {
            let (a, b) = (x - whole, x - whole - 1);
            let mut v: f32 = 0.0;
            if (0..w).contains(&a) {
                v += row[a as usize] as f32 * (1.0f32 - frac);
            }
            if (0..w).contains(&b) {
                v += row[b as usize] as f32 * frac;
            }
            src[(x * 3) as usize..(x * 3 + 3) as usize].fill((v + 0.5f32) as u8);
        }
    }
}

/// textspec.c `halo_from`: the coverage (channel 0 of `gray`) box-blurred
/// twice at `radius`, then tripled and clamped - solid against the letters'
/// edge, fading over the radius, as the game's own glowing plates are.
fn halo_from(gray: &[u8], w: i32, h: i32, radius: i32) -> Vec<u8> {
    let (wu, hu) = (w as usize, h as usize);
    let px = wu * hu;
    let mut a: Vec<u32> = (0..px).map(|k| gray[k * 3] as u32 * 256).collect();
    let mut b = vec![0u32; px];
    let n = (2 * radius + 1) as u64;
    let clampi = |v: i32, hi: i32| v.clamp(0, hi - 1) as usize;
    for _ in 0..2 {
        for y in 0..hu {
            let row = &a[y * wu..(y + 1) * wu];
            let dst = &mut b[y * wu..(y + 1) * wu];
            let mut sum: u64 = (-radius..=radius).map(|x| row[clampi(x, w)] as u64).sum();
            for x in 0..w {
                dst[x as usize] = (sum / n) as u32;
                sum += row[clampi(x + radius + 1, w)] as u64;
                sum -= row[clampi(x - radius, w)] as u64;
            }
        }
        for x in 0..wu {
            let at = |y: i32| clampi(y, h) * wu + x;
            let mut sum: u64 = (-radius..=radius).map(|y| b[at(y)] as u64).sum();
            for y in 0..h {
                a[y as usize * wu + x] = (sum / n) as u32;
                sum += b[at(y + radius + 1)] as u64;
                sum -= b[at(y - radius)] as u64;
            }
        }
    }
    // /256 for the scale, x3 for the gain.
    a.iter().map(|&v| (v / 85).min(255) as u8).collect()
}

/// Plates larger than this are refused (the wheel's is 256x32).
pub const MAX_PLATE: i32 = 4096;

/// ez2/textspec.c `ez2_textspec_render` for one plate, `scale` times its
/// size (1..8): every line into its own coverage, then composed by colour -
/// the halo first, then the ink, each channel keeping the brighter value.
/// A line with CJK text is set in the CJK face; without one the plate is
/// refused (the Latin face would draw boxes), as the port refuses it.
pub fn render_plate(spec: &PlateSpec, fonts: &Fonts, scale: i32) -> Result<Plate, TextError> {
    let scale = scale.clamp(1, 8);
    if spec.w <= 0 || spec.h <= 0 || spec.w > MAX_PLATE || spec.h > MAX_PLATE {
        return Err(TextError::BadSize(spec.w, spec.h));
    }
    let (w, h) = (spec.w * scale, spec.h * scale);
    let px = (w * h) as usize;
    let bold = Face::open(&fonts.bold, 0)?;
    // A line is set in the CJK face when it asks for it or its words need it
    // (textspec.c run_face). Without the collection, CJK words are refused -
    // the Latin face would draw boxes - and a Latin line that asked for the
    // CJK face gets the Latin one, as the port's face finder falls back.
    let wants_cjk = |l: &PlateLine| l.face == FaceName::Cjkbold || has_cjk(&l.text);
    let cjk = match &fonts.cjk_bold {
        Some(f) if spec.lines.iter().any(wants_cjk) => {
            Some(Face::open(f, spec.cjk.map_or(0, CjkForms::face))?)
        }
        Some(_) => None,
        None if spec.lines.iter().any(|l| has_cjk(&l.text)) => return Err(TextError::NoCjkFont),
        None => None,
    };
    let mut rgba = vec![0u8; px * 4];
    let mut gray = vec![0u8; px * 3];
    let mut missing: Vec<char> = Vec::new();
    for line in &spec.lines {
        let face = match (&cjk, wants_cjk(line)) {
            (Some(c), true) => c,
            _ => &bold,
        };
        for c in line.text.chars().take_while(|&c| c != '\0') {
            if !c.is_whitespace() && !face.has(c) && !missing.contains(&c) {
                missing.push(c);
            }
        }
        gray.fill(0);
        render_box(
            face,
            &line.text,
            &mut gray,
            w,
            h,
            line.x * scale,
            line.baseline * scale,
            line.cap * scale as f32,
            line.align,
            line.max_width * scale,
        );
        if line.oblique {
            shear_rows(&mut gray, w, h, line.baseline * scale);
        }
        let mut put = |k: usize, v: u32, c: Rgb| {
            let o = &mut rgba[k * 4..k * 4 + 4];
            let ch = [(c.0 >> 16) & 0xff, (c.0 >> 8) & 0xff, c.0 & 0xff];
            for i in 0..3 {
                let x = (ch[i] * v / 255) as u8;
                if x > o[i] {
                    o[i] = x;
                }
            }
            o[3] = 255;
        };
        if let Some(glow) = line.glow {
            let halo = halo_from(&gray, w, h, 3 * scale);
            for (k, &v) in halo.iter().enumerate() {
                if v != 0 {
                    put(k, v as u32, glow);
                }
            }
        }
        for k in 0..px {
            let v = gray[k * 3] as u32;
            if v != 0 {
                put(k, v, line.ink);
            }
        }
    }
    Ok(Plate { w, h, rgba, missing })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fonts() -> Fonts {
        Fonts::from_dir(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fonts")).unwrap()
    }

    fn line(text: &str) -> PlateLine {
        PlateLine {
            text: text.into(),
            x: 246,
            baseline: 22,
            cap: 9.0,
            face: FaceName::Bold,
            ink: Rgb(0xffffff),
            glow: None,
            align: Align::Right,
            max_width: 236,
            oblique: false,
        }
    }

    fn plate(lines: Vec<PlateLine>) -> Plate {
        render_plate(&PlateSpec { w: 256, h: 32, lines, cjk: None }, &fonts(), 1).unwrap()
    }

    /// The ink's bounding box: (x0, y0, x1, y1), inclusive.
    fn ink(p: &Plate) -> (i32, i32, i32, i32) {
        let mut b = (i32::MAX, i32::MAX, -1, -1);
        for y in 0..p.h {
            for x in 0..p.w {
                if p.rgba[((y * p.w + x) * 4) as usize] > 60 {
                    b = (b.0.min(x), b.1.min(y), b.2.max(x), b.3.max(y));
                }
            }
        }
        b
    }

    #[test]
    fn a_title_sits_where_the_shipped_plates_put_it() {
        // TEXT.md s7: ink ending at column 246, capitals nine tall on
        // baseline 22 (the capitals' last solid row is just above it). The
        // exact pixels are the oracle test's; this is the shape.
        let p = plate(vec![line("NEON PARADE")]);
        let (_, y0, x1, y1) = ink(&p);
        assert!((245..=246).contains(&x1), "right edge {x1}");
        assert!((21..=22).contains(&y1), "bottom {y1}");
        assert!((12..=14).contains(&y0), "cap top {y0}");
        assert!(p.missing.is_empty());
    }

    #[test]
    fn a_long_title_is_condensed_into_236_pixels() {
        let p = plate(vec![line("THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG AGAIN")]);
        let (x0, y0, x1, _) = ink(&p);
        assert!(x1 - x0 <= 237, "{x0}..{x1}");
        assert!((13..=14).contains(&y0), "the capitals keep their height");
    }

    #[test]
    fn colour_and_halo_go_into_the_pixels() {
        let mut l = line("I");
        l.ink = Rgb(0x00f283);
        let p = plate(vec![l.clone()]);
        let lit: Vec<_> = p.rgba.chunks(4).filter(|c| c[3] == 255).collect();
        assert!(lit.iter().all(|c| c[0] == 0 && c[1] >= c[2]), "green ink only");
        l.ink = Rgb(0xffffff);
        l.glow = Some(Rgb(0xeb4800));
        let g = plate(vec![l]);
        let orange = g.rgba.chunks(4).filter(|c| c[0] > 0 && c[2] == 0).count();
        assert!(orange > 0, "the halo round white letters is orange");
        assert!(ink(&g).2 >= ink(&p).2, "and reaches past the ink");
    }

    #[test]
    fn cjk_text_needs_the_cjk_face_and_says_what_is_missing() {
        let f = fonts();
        let spec =
            PlateSpec { w: 256, h: 32, lines: vec![line("노래 ★")], cjk: Some(CjkForms::Kr) };
        match f.cjk_bold {
            Some(_) => {
                let p = render_plate(&spec, &f, 1).unwrap();
                assert!(ink(&p).2 > 0);
            }
            None => {
                let e = render_plate(&spec, &f, 1).unwrap_err();
                assert!(matches!(e, TextError::NoCjkFont));
            }
        }
        // Roboto has no glyph for this private-use character.
        assert_eq!(plate(vec![line("A\u{e000}")]).missing, vec!['\u{e000}']);
    }

    #[test]
    fn has_cjk_follows_the_port() {
        assert!(has_cjk("노래"));
        assert!(has_cjk("うた"));
        assert!(has_cjk("歌"));
        assert!(has_cjk("ＡＢ")); // full-width
        assert!(!has_cjk("Éclair ★ déjà-vu"));
    }

    #[test]
    fn not_a_font_is_refused_before_stb_reads_it() {
        assert!(FontFile::from_bytes("x".into(), b"hello world!".to_vec()).is_err());
    }
}
