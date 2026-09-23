//! Keysounds for an export (export.rs): what came from the game goes back
//! bit for bit, everything else is cut as a publish cuts it.

use std::path::PathBuf;

use ez2bms_audio::cache::SampleCache;
use ez2bms_audio::cut::{pcm16_stereo, PUBLISH_RATE};
use ez2bms_audio::decode::decode_file;
use ez2bms_audio::export::{export_sound, how, How, SoundFormat, SoundJob};
use ez2bms_audio::import::{converted, Convert};
use ez2bms_audio::{ssf, wav};

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("ez2bms-export {name} {}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn tone(frames: usize, channels: u16) -> Vec<i16> {
    (0..frames * channels as usize).map(|i| ((i * 53) % 30000) as i16 - 15000).collect()
}

fn job(src: PathBuf, start: u64, end: Option<u64>, format: SoundFormat) -> SoundJob {
    SoundJob { src, start_frame: start, end_frame: end, format }
}

#[test]
fn a_game_keysound_goes_back_bit_for_bit() {
    let d = scratch("roundtrip");
    let cache = SampleCache::new(PUBLISH_RATE);
    for (channels, rate) in [(1u16, 22050u32), (2, 44100), (1, 44100), (2, 32000)] {
        // The game's .ssf, imported as a .wav (import.rs), exported again.
        let game = ssf::encode_pcm16(channels, rate, &tone(3001, channels));
        let src = d.join(format!("g{channels}{rate}.ssf"));
        std::fs::write(&src, &game).unwrap();
        let imported = d.join(format!("g{channels}{rate}.wav"));
        std::fs::write(&imported, converted(&src, Convert::Pcm).unwrap()).unwrap();
        let j = job(imported, 0, None, SoundFormat::Ssf);
        assert_eq!(how(&j).unwrap(), How::Rewrap);
        let (back, h) = export_sound(&cache, &j).unwrap();
        assert_eq!(h, How::Rewrap);
        assert_eq!(back, game, "{channels} ch {rate} Hz");
        assert!(ssf::same_audio(&back, &game));
        // An .ssf in the project goes the same way.
        let (again, h) = export_sound(&cache, &job(src, 0, None, SoundFormat::Ssf)).unwrap();
        assert_eq!((again, h), (game, How::Rewrap));
    }
}

#[test]
fn same_audio_is_format_and_samples() {
    let a = ssf::encode_pcm16(2, 44100, &tone(100, 2));
    let mut tail = a.clone();
    tail.extend_from_slice(&[1, 2, 3, 4]); // a tail the header does not count
    assert!(ssf::same_audio(&a, &tail));
    let mut other = tone(100, 2);
    other[7] ^= 1;
    assert!(!ssf::same_audio(&a, &ssf::encode_pcm16(2, 44100, &other)));
    assert!(!ssf::same_audio(&a, &ssf::encode_pcm16(2, 48000, &tone(100, 2))));
    assert!(!ssf::same_audio(&a, b"not an ssf at all"));
}

#[test]
fn anything_else_is_cut_as_a_publish_cuts_it() {
    let d = scratch("cut");
    let cache = SampleCache::new(PUBLISH_RATE);
    // A 16-bit stereo WAV at 44.1 kHz, sliced: exactly the frames asked for.
    let pcm = tone(5000, 2);
    let src = d.join("stem.wav");
    std::fs::write(&src, wav::encode_pcm16(2, PUBLISH_RATE, &pcm)).unwrap();
    let (bytes, h) =
        export_sound(&cache, &job(src.clone(), 100, Some(500), SoundFormat::Ssf)).unwrap();
    assert_eq!(h, How::Cut);
    let (info, body) = ssf::parse(&bytes).unwrap();
    assert_eq!((info.channels, info.rate, info.bits, info.frames()), (2, PUBLISH_RATE, 16, 400));
    let want: Vec<u8> = pcm[200..1000].iter().flat_map(|s| s.to_le_bytes()).collect();
    assert_eq!(body, &want[..]);
    // The same slice for BMS: a WAV with the same samples.
    let (w, h) = export_sound(&cache, &job(src.clone(), 100, Some(500), SoundFormat::Wav)).unwrap();
    assert_eq!(h, How::Cut);
    assert_eq!(wav::parse_pcm(&w).unwrap().pcm, &want[..]);

    // A 24-bit WAV has no 16-bit PCM to keep: converted, stereo 44.1 kHz.
    let deep: Vec<u8> = (0..300 * 3).map(|i| (i * 7) as u8).collect();
    let src24 = d.join("deep.wav");
    std::fs::write(&src24, wav::wrap_pcm(24, 1, 44100, &deep)).unwrap();
    let j = job(src24.clone(), 0, None, SoundFormat::Ssf);
    assert_eq!(how(&j).unwrap(), How::Cut);
    let (bytes, h) = export_sound(&cache, &j).unwrap();
    assert_eq!(h, How::Cut);
    let (info, _) = ssf::parse(&bytes).unwrap();
    assert_eq!((info.channels, info.rate, info.bits, info.frames()), (2, 44100, 16, 300));
    let s = cache.get(&src24).unwrap();
    let pcm16: Vec<u8> = pcm16_stereo(&s, 0, None).iter().flat_map(|x| x.to_le_bytes()).collect();
    assert_eq!(ssf::parse(&bytes).unwrap().1, &pcm16[..]);
    // An empty range is a short silence, as a publish writes it.
    let (bytes, _) = export_sound(&cache, &job(src, 700, Some(700), SoundFormat::Ssf)).unwrap();
    assert_eq!(ssf::parse(&bytes).unwrap().0.frames(), 64);
}

#[test]
fn bms_gets_wavs_copied_game_files_rewrapped() {
    let d = scratch("bms");
    let cache = SampleCache::new(PUBLISH_RATE);
    let w = wav::encode_pcm16(1, 22050, &tone(800, 1));
    let src = d.join("kick.WAV");
    std::fs::write(&src, &w).unwrap();
    let (bytes, h) = export_sound(&cache, &job(src, 0, None, SoundFormat::Wav)).unwrap();
    assert_eq!((bytes, h), (w, How::Copy));
    let game = ssf::encode_pcm16(2, 22050, &tone(800, 2));
    let s = d.join("snare.ssf");
    std::fs::write(&s, &game).unwrap();
    let (bytes, h) = export_sound(&cache, &job(s.clone(), 0, None, SoundFormat::Wav)).unwrap();
    assert_eq!(h, How::Rewrap);
    let p = wav::parse_pcm(&bytes).unwrap();
    assert_eq!((p.channels, p.rate, p.bits), (2, 22050, 16));
    assert_eq!(p.pcm, ssf::parse(&game).unwrap().1);
    // And it decodes to the same thing the .ssf does.
    let out = d.join("snare.wav");
    std::fs::write(&out, &bytes).unwrap();
    assert_eq!(decode_file(&out).unwrap(), decode_file(&s).unwrap());
}

#[test]
fn wav_pcm_is_found_past_other_chunks() {
    let pcm: Vec<u8> = (0..20u8).collect();
    let plain = wav::wrap_pcm(16, 2, 8000, &pcm);
    assert_eq!(
        wav::parse_pcm(&plain),
        Some(wav::WavPcm { bits: 16, channels: 2, rate: 8000, pcm: &pcm })
    );
    // A LIST chunk of odd size (padded) before the data.
    let mut listed = plain[..36].to_vec();
    listed.extend_from_slice(b"LIST");
    listed.extend_from_slice(&3u32.to_le_bytes());
    listed.extend_from_slice(b"abc\0");
    listed.extend_from_slice(&plain[36..]);
    assert_eq!(wav::parse_pcm(&listed).unwrap().pcm, &pcm[..]);
    // WAVE_FORMAT_EXTENSIBLE with the PCM sub-format.
    let mut ext = b"RIFF\0\0\0\0WAVEfmt ".to_vec();
    ext.extend_from_slice(&40u32.to_le_bytes());
    ext.extend_from_slice(&0xfffeu16.to_le_bytes());
    ext.extend_from_slice(&2u16.to_le_bytes());
    ext.extend_from_slice(&8000u32.to_le_bytes());
    ext.extend_from_slice(&32000u32.to_le_bytes());
    ext.extend_from_slice(&4u16.to_le_bytes());
    ext.extend_from_slice(&16u16.to_le_bytes());
    ext.extend_from_slice(&22u16.to_le_bytes());
    ext.extend_from_slice(&16u16.to_le_bytes());
    ext.extend_from_slice(&3u32.to_le_bytes());
    ext.extend_from_slice(&1u16.to_le_bytes()); // KSDATAFORMAT_SUBTYPE_PCM's first word
    ext.extend_from_slice(&[0; 14]);
    ext.extend_from_slice(b"data");
    ext.extend_from_slice(&(pcm.len() as u32).to_le_bytes());
    ext.extend_from_slice(&pcm);
    assert_eq!(wav::parse_pcm(&ext).unwrap().pcm, &pcm[..]);
    // Float is not PCM to keep.
    let mut float = plain.clone();
    float[20] = 3;
    assert_eq!(wav::parse_pcm(&float), None);
    assert_eq!(wav::parse_pcm(b"RIFF"), None);
}

/// With a real install (EZ2_ROOT): every shipped `.ssf`, imported as a WAV and
/// exported again, is the same audio - byte for byte where the file has no
/// tail past its declared data. Skipped without one.
#[test]
fn every_shipped_keysound_goes_back_as_it_was() {
    let Some(root) = std::env::var_os("EZ2_ROOT").map(PathBuf::from) else {
        return;
    };
    let sound = root.join("sound");
    let Ok(dirs) = std::fs::read_dir(&sound) else {
        return;
    };
    let d = scratch("shipped");
    let cache = SampleCache::new(PUBLISH_RATE);
    let (mut files, mut exact, mut tail, mut cut) = (0, 0, 0, 0);
    for dir in dirs.flatten() {
        let Ok(list) = std::fs::read_dir(dir.path()) else { continue };
        for f in list.flatten() {
            let p = f.path();
            if !p.extension().is_some_and(|e| e.eq_ignore_ascii_case("ssf")) {
                continue;
            }
            let Ok(orig) = std::fs::read(&p) else { continue };
            let Ok(as_wav) = converted(&p, Convert::Pcm) else { continue }; // not a valid .ssf
            files += 1;
            let w = d.join("k.wav");
            std::fs::write(&w, &as_wav).unwrap();
            let (back, h) = export_sound(&cache, &job(w, 0, None, SoundFormat::Ssf)).unwrap();
            if h != How::Rewrap {
                cut += 1; // 8/24/32-bit: converted, as for any other source
                continue;
            }
            assert!(ssf::same_audio(&back, &orig), "{}", p.display());
            if back == orig {
                exact += 1;
            } else {
                tail += 1;
            }
        }
    }
    println!("{files} .ssf: {exact} byte for byte, {tail} with a tail, {cut} not 16-bit");
}
