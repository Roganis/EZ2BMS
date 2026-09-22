mod common;

use common::{noise, Lcg};
use ez2bms_audio::cut::{cut_ssf, pcm16_stereo, PUBLISH_RATE};
use ez2bms_audio::decode::decode;
use ez2bms_audio::level::{db100_to_gain, ds_gains, output_stage, soft_knee};
use ez2bms_audio::peaks::Peaks;
use ez2bms_audio::resample::{convert_frames, resample};
use ez2bms_audio::{ssf, wav, Sample};

fn pcm(seed: u64, n: usize) -> Vec<i16> {
    let mut r = Lcg(seed);
    (0..n).map(|_| r.next() as i16).collect()
}

#[test]
fn ssf_round_trips_and_validates_like_the_port() {
    let data = pcm(1, 2 * 300);
    let bytes = ssf::encode_pcm16(2, 44_100, &data);
    assert_eq!(bytes.len(), 18 + 1200);
    let (h, body) = ssf::parse(&bytes).unwrap();
    assert_eq!(
        (h.channels, h.rate, h.byte_rate, h.block_align, h.bits),
        (2, 44_100, 176_400, 4, 16)
    );
    assert_eq!(h.frames(), 300);
    assert_eq!(body.len(), 1200);
    assert_eq!(ssf::decode(&bytes).unwrap(), Sample::from_pcm16(44_100, 2, &data));

    assert!(ssf::parse(&bytes[..17]).is_err(), "short");
    let mut bad = bytes.clone();
    bad[0x0a] = 2; // block align no longer channels * bytes
    assert!(ssf::parse(&bad).is_err(), "inconsistent");
    assert!(ssf::parse(&bytes[..bytes.len() - 1]).is_err(), "truncated");
    // .ezw is the same header in the older era; mono is fine too.
    let mono = ssf::encode_pcm16(1, 22_050, &pcm(2, 100));
    assert_eq!(ssf::decode(&mono).unwrap().frames(), 100);
    assert_eq!(decode(mono, Some("ezw")).unwrap().rate, 22_050);
}

#[test]
fn a_16_bit_wav_survives_decode_and_cut_bit_for_bit() {
    for channels in [1u16, 2] {
        let data = pcm(3 + channels as u64, channels as usize * 5000);
        let s = decode(wav::encode_pcm16(channels, PUBLISH_RATE, &data), Some("wav")).unwrap();
        assert_eq!((s.rate, s.channels, s.frames()), (PUBLISH_RATE, channels, 5000));
        let back = pcm16_stereo(&s, 0, None);
        let want: Vec<i16> =
            if channels == 2 { data.clone() } else { data.iter().flat_map(|&x| [x, x]).collect() };
        assert_eq!(back, want);
    }
}

#[test]
fn consecutive_slices_join_into_exactly_the_uncut_sample() {
    let s = noise(PUBLISH_RATE, 2, 20_000, 7);
    let whole = pcm16_stereo(&s, 0, None);
    let mut r = Lcg(11);
    for _ in 0..50 {
        let mut cuts: Vec<u64> = (0..r.below(6) + 1).map(|_| r.below(20_000)).collect();
        cuts.sort_unstable();
        let mut joined = Vec::new();
        let mut at = 0;
        for c in cuts.iter().copied().chain([20_000]) {
            joined.extend(pcm16_stereo(&s, at, Some(c)));
            at = c;
        }
        assert_eq!(joined, whole);
    }
    // The .ssf carries exactly that PCM.
    let bytes = cut_ssf(&s, 100, Some(1100)).unwrap();
    assert_eq!(
        ssf::decode(&bytes).unwrap(),
        Sample::from_pcm16(PUBLISH_RATE, 2, &whole[200..2200])
    );
    // An empty slice still makes a playable (silent) file, and other rates are refused.
    assert_eq!(ssf::parse(&cut_ssf(&s, 50, Some(50)).unwrap()).unwrap().0.frames(), 64);
    assert!(cut_ssf(&noise(48_000, 2, 10, 1), 0, None).is_err());
}

#[test]
fn resampling_keeps_length_timing_and_tone() {
    let from = 44_100;
    let to = 48_000;
    let n = 44_100;
    let tone = |rate: u32, i: usize| {
        0.5 * (2.0 * std::f64::consts::PI * 1000.0 * i as f64 / rate as f64).sin()
    };
    let s = Sample::new(from, 1, (0..n).map(|i| tone(from, i) as f32).collect());
    let r = resample(&s, to).unwrap();
    assert_eq!(r.frames(), 48_000);
    // Away from the edges it is the same 1 kHz tone, in phase: no filter delay left.
    let worst = (2000..46_000).map(|i| (r.data[i] as f64 - tone(to, i)).abs()).fold(0.0, f64::max);
    assert!(worst < 2e-3, "worst error {worst}");
    // Stereo stays interleaved, and down-sampling works too.
    let st = noise(48_000, 2, 4800, 3);
    let d = resample(&st, 22_050).unwrap();
    assert_eq!((d.channels, d.frames()), (2, 2205));
    assert_eq!(convert_frames(441, 44_100, 48_000), 480);
    assert_eq!(convert_frames(1, 48_000, 44_100), 1);
}

#[test]
fn levels_and_pans_follow_directsound() {
    assert_eq!(db100_to_gain(0), 1.0);
    assert_eq!(db100_to_gain(-10_000), 0.0);
    assert!((db100_to_gain(-2000) - 0.1).abs() < 1e-6);
    assert_eq!(ds_gains(0, 0), (1.0, 1.0));
    let (l, r) = ds_gains(-600, 2000);
    assert!((l - db100_to_gain(-600) * 0.1).abs() < 1e-6 && r == db100_to_gain(-600));
    let (l, r) = ds_gains(0, -10_000);
    assert_eq!((l, r), (1.0, 0.0));
    assert_eq!(soft_knee(0.5), 0.5);
    assert!(soft_knee(5.0) < 1.0 && soft_knee(5.0) > 0.99 && soft_knee(-5.0) == -soft_knee(5.0));
    let mut b = [0.95f32, -3.0, 0.2];
    output_stage(&mut b, 1.0);
    assert!(b[0] < 0.95 && b[1] > -1.0 && b[2] == 0.2);
}

#[test]
fn peaks_bracket_the_signal_at_every_level() {
    let s = noise(44_100, 2, 10_000, 5);
    let p = Peaks::build(&s, 32);
    assert_eq!(p.levels[0].len(), 313);
    assert_eq!(p.levels.last().unwrap().len(), 1);
    let lo = s.data.iter().copied().fold(f32::INFINITY, f32::min);
    let hi = s.data.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let top = p.levels.last().unwrap()[0];
    assert_eq!(top, [(lo * 32767.0).round() as i16, (hi * 32767.0).round() as i16]);
    assert_eq!(p.level_for(10.0), 0);
    assert_eq!(p.level_for(64.0), 1);
    assert_eq!(p.bucket_frames(3), 256);
}
