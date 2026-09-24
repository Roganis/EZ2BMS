//! Render title plates or single lines for chart-core's parity tests against
//! EZ2PORT (test/plate.oracle.test.ts). JSON on stdin, raw pixels on stdout:
//!
//! `{"fonts": DIR, "plate": PlateSpec, "scale": 1}` -> RGBA (ez2_textspec_render)
//! `{"font": FILE, "index": 0, "line": {...}}`       -> RGB (ez2_ttf_render_box)

use std::io::{Read, Write};
use std::path::PathBuf;

use ez2bms_media::text::{render_box, render_plate, Align, Face, FontFile, Fonts, PlateSpec};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Line {
    text: String,
    w: i32,
    h: i32,
    x: i32,
    baseline: i32,
    cap: f32,
    align: Align,
    max_width: i32,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Job {
    Plate { fonts: PathBuf, plate: PlateSpec, scale: Option<i32> },
    Line { font: PathBuf, index: Option<i32>, line: Line },
}

fn main() {
    let mut s = String::new();
    std::io::stdin().read_to_string(&mut s).expect("read the job");
    let out = match serde_json::from_str::<Job>(&s).expect("a job") {
        Job::Plate { fonts, plate, scale } => {
            let fonts = Fonts::from_dir(&fonts).expect("the fonts");
            render_plate(&plate, &fonts, scale.unwrap_or(1)).expect("the plate").rgba
        }
        Job::Line { font, index, line: l } => {
            let file = FontFile::read(&font).expect("the font");
            let face = Face::open(&file, index.unwrap_or(0)).expect("the face");
            let mut rgb = vec![0u8; (l.w * l.h * 3) as usize];
            render_box(
                &face,
                &l.text,
                &mut rgb,
                l.w,
                l.h,
                l.x,
                l.baseline,
                l.cap,
                l.align,
                l.max_width,
            );
            rgb
        }
    };
    std::io::stdout().write_all(&out).expect("write the pixels");
}
