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
