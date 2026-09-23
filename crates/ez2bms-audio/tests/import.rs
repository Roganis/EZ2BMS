//! An imported song's folder (import.rs): all or nothing, keysounds
//! converted without touching a sample.

use std::path::PathBuf;

use ez2bms_audio::decode::decode_file;
use ez2bms_audio::import::{import_song, Convert, ImportCopy, ImportJob};
use ez2bms_audio::ssf;
use ez2bms_audio::wav::wrap_pcm;

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("ez2bms-import {name} {}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn tone(frames: usize, channels: u16) -> Vec<i16> {
    (0..frames * channels as usize).map(|i| ((i * 37) % 20000) as i16 - 10000).collect()
}

#[test]
fn an_ssf_becomes_a_wav_with_the_same_samples() {
    let d = scratch("convert");
    for (channels, rate) in [(1u16, 44100u32), (2, 22050), (2, 48000)] {
        let pcm = tone(1234, channels);
        let src = d.join(format!("k{channels}{rate}.ssf"));
        std::fs::write(&src, ssf::encode_pcm16(channels, rate, &pcm)).unwrap();
        let dest = d.join(format!("song{channels}{rate}"));
        let job = ImportJob {
            files: vec![],
            copies: vec![ImportCopy {
                from: src.clone(),
                to: "k.wav".into(),
                convert: Convert::Pcm,
            }],
        };
        let r = import_song(&dest, &job, &mut |_, _| {}).unwrap();
        assert_eq!(r.copied, 1);
        let wav = std::fs::read(dest.join("k.wav")).unwrap();
        // The PCM bytes are the .ssf's, as they were.
        let ssf_bytes = std::fs::read(&src).unwrap();
        assert_eq!(&wav[44..], &ssf_bytes[18..]);
        // And any reader gets the same samples from both.
        let a = decode_file(&src).unwrap();
        let b = decode_file(&dest.join("k.wav")).unwrap();
        assert_eq!(a.channels, b.channels);
        assert_eq!(a.rate, b.rate);
        assert_eq!(a.data, b.data);
    }
}

#[test]
fn wraps_odd_widths_and_lengths() {
    let w = wrap_pcm(8, 1, 11025, &[1, 2, 3]);
    assert_eq!(&w[0..4], b"RIFF");
    assert_eq!(u32::from_le_bytes(w[4..8].try_into().unwrap()) as usize, w.len() - 8);
    assert_eq!(u16::from_le_bytes([w[34], w[35]]), 8);
    assert_eq!(u32::from_le_bytes(w[40..44].try_into().unwrap()), 3);
    assert_eq!(w.len(), 44 + 4); // the pad byte
    let w24 = wrap_pcm(24, 2, 44100, &[0; 12]);
    assert_eq!(u16::from_le_bytes([w24[32], w24[33]]), 6); // block align
    assert_eq!(u32::from_le_bytes(w24[28..32].try_into().unwrap()), 44100 * 6);
}

#[test]
fn writes_the_charts_and_keysounds_in_subfolders_and_reports_what_is_missing() {
    let d = scratch("song");
    let src = d.join("in.ssf");
    std::fs::write(&src, ssf::encode_pcm16(1, 44100, &tone(100, 1))).unwrap();
    std::fs::write(d.join("plain.ogg"), b"not really ogg").unwrap();
    let dest = d.join("New Song");
    let job = ImportJob {
        files: vec![
            ("streetmix1p-new.bmson".into(), b"{}".to_vec()),
            ("ez2bms.song.json".into(), b"{\"key\":\"new\"}".to_vec()),
        ],
        copies: vec![
            ImportCopy { from: src.clone(), to: "kick.wav".into(), convert: Convert::Pcm },
            ImportCopy { from: src.clone(), to: "beta/bass.wav".into(), convert: Convert::Pcm },
            ImportCopy {
                from: d.join("plain.ogg"),
                to: "plain.ogg".into(),
                convert: Convert::Copy,
            },
            ImportCopy { from: d.join("gone.ssf"), to: "gone.wav".into(), convert: Convert::Pcm },
            ImportCopy { from: d.join("plain.ogg"), to: "bad.wav".into(), convert: Convert::Pcm },
        ],
    };
    let mut seen = vec![];
    let r = import_song(&dest, &job, &mut |done, total| seen.push((done, total))).unwrap();
    assert_eq!(seen.last(), Some(&(7, 7)));
    assert_eq!(r.copied, 3);
    assert_eq!(r.failed.iter().map(|f| f.0.as_str()).collect::<Vec<_>>(), ["gone.wav", "bad.wav"]);
    for f in ["streetmix1p-new.bmson", "ez2bms.song.json", "kick.wav", "beta/bass.wav", "plain.ogg"]
    {
        assert!(dest.join(f).is_file(), "{f}");
    }
    assert_eq!(std::fs::read(dest.join("plain.ogg")).unwrap(), b"not really ogg");
    // Nothing left beside it.
    let left: Vec<_> = std::fs::read_dir(&d)
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.contains("ez2bms-import"))
        .collect();
    assert!(left.is_empty(), "{left:?}");
}

#[test]
fn refuses_a_folder_that_is_not_empty_and_leaves_nothing_on_failure() {
    let d = scratch("refuse");
    let dest = d.join("taken");
    std::fs::create_dir_all(&dest).unwrap();
    std::fs::write(dest.join("x"), b"x").unwrap();
    let job = ImportJob { files: vec![("a.bmson".into(), b"{}".to_vec())], copies: vec![] };
    assert!(import_song(&dest, &job, &mut |_, _| {}).is_err());
    assert_eq!(std::fs::read_dir(&dest).unwrap().count(), 1);

    // An empty folder is fine.
    let empty = d.join("empty");
    std::fs::create_dir_all(&empty).unwrap();
    import_song(&empty, &job, &mut |_, _| {}).unwrap();
    assert!(empty.join("a.bmson").is_file());

    // A path leaving the folder fails the whole job: no destination.
    let bad = d.join("bad");
    let job = ImportJob {
        files: vec![
            ("ok.bmson".into(), b"{}".to_vec()),
            ("../escape.bmson".into(), b"{}".to_vec()),
        ],
        copies: vec![],
    };
    assert!(import_song(&bad, &job, &mut |_, _| {}).is_err());
    assert!(!bad.exists());
    assert!(!d.join("escape.bmson").exists());
    let left = std::fs::read_dir(&d)
        .unwrap()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().contains("ez2bms-import"))
        .count();
    assert_eq!(left, 0);
}
