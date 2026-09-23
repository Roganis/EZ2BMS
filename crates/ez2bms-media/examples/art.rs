//! Cut a disc or an eyecatch from an image, for chart-core's parity tests
//! against EZ2PORT's importer (test/art.oracle.test.ts): a JSON job on stdin,
//! raw RGB on stdout. The image is a PNG/JPEG/BMP, or the tests' raw form -
//! "RGBA", u32 LE width and height, top-down RGBA - which the oracle reads too.

use std::io::{Read, Write};

use ez2bms_media::{decode, render, ArtJob, Rgba};
use serde::Deserialize;

/// The host's job (`ArtJob`) plus the image to cut it from.
#[derive(Deserialize)]
struct Job {
    input: String,
    #[serde(flatten)]
    art: ArtJob,
}

fn load(path: &str) -> Rgba {
    let b = std::fs::read(path).expect("read the image");
    if b.len() >= 12 && &b[..4] == b"RGBA" {
        let w = u32::from_le_bytes(b[4..8].try_into().unwrap());
        let h = u32::from_le_bytes(b[8..12].try_into().unwrap());
        return Rgba { w, h, px: b[12..12 + (w * h * 4) as usize].to_vec() };
    }
    decode(&b).expect("decode the image")
}

fn main() {
    let mut s = String::new();
    std::io::stdin().read_to_string(&mut s).expect("read the job");
    let job: Job = serde_json::from_str(&s).expect("a job");
    let img = load(&job.input);
    let (_, _, rgb) = render(&img, job.art).expect("cut the art");
    std::io::stdout().write_all(&rgb).expect("write the pixels");
}
