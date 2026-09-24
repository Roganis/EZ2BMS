//! How long the song art takes, for docs/perf-log.md: a phone photo decoded
//! and cut to a disc and an eyecatch (what the cropper asks for on every
//! committed crop), and plates - the fonts read cold, a Latin plate, then a
//! Korean one in the CJK collection (skipped when it has not been fetched).
//! Printed with `--nocapture`; the bounds are loose enough for a debug
//! build on CI (the log records a release build).

use std::path::Path;
use std::time::Instant;

use ez2bms_media::text::{render_plate, Fonts, PlateSpec};
use ez2bms_media::{decode, render, ArtJob, Eyecatch, Rect};

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

#[test]
fn a_big_photo_is_cut_quickly() {
    let (w, h) = (4000u32, 3000u32);
    let img = image::RgbImage::from_fn(w, h, |x, y| {
        image::Rgb([(x % 251) as u8, (y % 241) as u8, ((x ^ y) % 256) as u8])
    });
    let mut png = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png).unwrap();
    let t = Instant::now();
    let src = decode(&png).unwrap();
    let decoded = ms(t);
    let t = Instant::now();
    let d = render(&src, ArtJob::Disc { crop: Some(Rect { x: 500, y: 0, w: 3000, h: 3000 }) });
    let disc = ms(t);
    let t = Instant::now();
    let e = render(
        &src,
        ArtJob::Eyecatch(Eyecatch::Visible { crop: Rect { x: 0, y: 0, w: 4000, h: 3000 } }),
    );
    let eye = ms(t);
    eprintln!(
        "4000x3000 PNG: decoded {decoded:.0} ms, cut to the disc {disc:.0} ms, to the eyecatch {eye:.0} ms"
    );
    assert_eq!((d.unwrap().0, e.unwrap().0), (256, 1024));
    assert!(decoded + disc + eye < 60_000.0);
}

fn spec(title: &str, sub: &str) -> PlateSpec {
    serde_json::from_value(serde_json::json!({
        "w": 256, "h": 32,
        "lines": [
            { "text": title, "x": 246, "baseline": 15, "cap": 7.0, "face": "bold",
              "ink": "ffffff", "glow": "42d3ef", "align": "right", "maxWidth": 236 },
            { "text": sub, "x": 246, "baseline": 27, "cap": 6.0, "face": "bold",
              "ink": "c5c5c5", "align": "right", "maxWidth": 236 }
        ]
    }))
    .unwrap()
}

#[test]
fn plates_render_quickly() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fonts");
    let t = Instant::now();
    let fonts = Fonts::from_dir(&dir).unwrap();
    let load = t.elapsed().as_secs_f64() * 1000.0;
    let time = |s: &PlateSpec| {
        let t = Instant::now();
        let p = render_plate(s, &fonts, 1).unwrap();
        assert!(p.missing.is_empty());
        t.elapsed().as_secs_f64() * 1000.0
    };
    let latin = spec("NEON PARADE", "EXTENDED MIX");
    let first = time(&latin);
    let again = (0..20).map(|_| time(&latin)).fold(0.0, f64::max);
    eprintln!(
        "fonts read: {load:.1} ms (CJK {}); Latin plate with halo: first {first:.2} ms, then at most {again:.2} ms",
        if fonts.cjk_bold.is_some() { "included" } else { "not fetched" }
    );
    assert!(first < 2_000.0 && again < 2_000.0);
    if fonts.cjk_bold.is_none() {
        return;
    }
    let korean = spec("네온 퍼레이드", "EXTENDED MIX");
    let first = time(&korean);
    let again = (0..20).map(|_| time(&korean)).fold(0.0, f64::max);
    eprintln!("Korean plate: first {first:.2} ms (opens the CJK face), then at most {again:.2} ms");
    assert!(first < 5_000.0 && again < 5_000.0);
}
