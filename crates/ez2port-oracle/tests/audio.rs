//! EZ2BMS's published keysounds, read back by EZ2PORT's own `.ssf` parser.

use std::process::Command;
use std::sync::Arc;

use ez2bms_audio::cut::{cut_ssf, PUBLISH_RATE};
use ez2bms_audio::{ssf, Sample};

fn fnv1a64(b: &[u8]) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for &x in b {
        h ^= x as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

#[test]
fn every_cut_is_a_valid_ssf_to_the_engine() {
    let dir = std::env::temp_dir().join(format!("ez2oracle-ssf-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut seed = 12345u64;
    let mut noise = || {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        ((seed >> 33) as f64 / (1u64 << 31) as f64 * 1.6 - 0.8) as f32
    };
    let stereo = Arc::new(Sample::new(PUBLISH_RATE, 2, (0..2 * 9000).map(|_| noise()).collect()));
    let mono = Arc::new(Sample::new(PUBLISH_RATE, 1, (0..9000).map(|_| noise()).collect()));
    for (i, (s, a, b)) in [
        (&stereo, 0, None),
        (&stereo, 1234, Some(5678)),
        (&mono, 17, Some(18)),
        (&mono, 500, Some(500)),
    ]
    .into_iter()
    .enumerate()
    {
        let bytes = cut_ssf(s, a, b).unwrap();
        let path = dir.join(format!("k{i}.ssf"));
        std::fs::write(&path, &bytes).unwrap();
        let out = Command::new(env!("CARGO_BIN_EXE_ez2port-oracle"))
            .args(["ssf", path.to_str().unwrap()])
            .output()
            .unwrap();
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
        let v: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
        let (h, pcm) = ssf::parse(&bytes).unwrap();
        assert_eq!(v["channels"], 2);
        assert_eq!(v["sample_rate"], 44_100);
        assert_eq!(v["bits"], 16);
        assert_eq!(v["block_align"], 4);
        assert_eq!(v["byte_rate"], 176_400);
        assert_eq!(v["frames"], h.frames());
        assert_eq!(v["pcm_fnv1a64"], fnv1a64(pcm));
    }
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_cabinet_exports_keysounds_are_valid_to_the_engine() {
    use ez2bms_audio::cache::SampleCache;
    use ez2bms_audio::export::{export_sound, How, SoundFormat, SoundJob};
    use ez2bms_audio::wav;

    let dir = std::env::temp_dir().join(format!("ez2oracle-export-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let cache = SampleCache::new(PUBLISH_RATE);
    // A game keysound brought in as a WAV (mono, 22.05 kHz) goes back rewrapped
    // with its own format; a slice of a stereo stem is cut at 44.1 kHz.
    let pcm: Vec<i16> = (0..2 * 4001).map(|i| ((i * 97) % 40000 - 20000) as i16).collect();
    let mono = dir.join("mono.wav");
    std::fs::write(&mono, wav::encode_pcm16(1, 22050, &pcm[..4001])).unwrap();
    let stem = dir.join("stem.wav");
    std::fs::write(&stem, wav::encode_pcm16(2, PUBLISH_RATE, &pcm)).unwrap();
    for (i, (src, a, b, want)) in [
        (&mono, 0, None, (How::Rewrap, 1, 22_050, 4001usize)),
        (&stem, 1000, Some(2500), (How::Cut, 2, 44_100, 1500usize)),
    ]
    .into_iter()
    .enumerate()
    {
        let job =
            SoundJob { src: src.clone(), start_frame: a, end_frame: b, format: SoundFormat::Ssf };
        let (bytes, how) = export_sound(&cache, &job).unwrap();
        assert_eq!(how, want.0);
        let path = dir.join(format!("e{i}.ssf"));
        std::fs::write(&path, &bytes).unwrap();
        let out = Command::new(env!("CARGO_BIN_EXE_ez2port-oracle"))
            .args(["ssf", path.to_str().unwrap()])
            .output()
            .unwrap();
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
        let v: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
        let (_, body) = ssf::parse(&bytes).unwrap();
        assert_eq!(
            (v["channels"].as_u64().unwrap(), v["sample_rate"].as_u64().unwrap()),
            (want.1, want.2)
        );
        assert_eq!(v["bits"], 16);
        assert_eq!(v["frames"], want.3);
        assert_eq!(v["pcm_fnv1a64"], fnv1a64(body));
    }
    std::fs::remove_dir_all(&dir).ok();
}
