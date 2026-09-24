//! The disk cache: a hit is the very sample a decode gives (so publishing
//! cuts the same bytes either way), anything that no longer matches its
//! source is a miss and goes, and the folder stays under its cap by dropping
//! what was used least recently.

mod common;

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use common::Lcg;
use ez2bms_audio::cache::SampleCache;
use ez2bms_audio::decode::decode_file;
use ez2bms_audio::disk::{DiskCache, Key, MIN_SECONDS};
use ez2bms_audio::peaks::Peaks;
use ez2bms_audio::resample::resample;
use ez2bms_audio::wav;

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("ez2bms-disk {name} {}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

/// A stereo 16-bit WAV of noise, `seconds` long at `rate`.
fn write_wav(path: &Path, rate: u32, seconds: f64, seed: u64) {
    let mut r = Lcg(seed);
    let n = (rate as f64 * seconds) as usize * 2;
    let pcm: Vec<i16> = (0..n).map(|_| (r.next() as i16) / 4).collect();
    fs::write(path, wav::encode_pcm16(2, rate, &pcm)).unwrap();
}

fn set_time(path: &Path, t: SystemTime) {
    fs::File::options().write(true).open(path).unwrap().set_modified(t).unwrap();
}

fn entries(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(dir)
        .map(|rd| rd.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect())
        .unwrap_or_default();
    v.sort();
    v
}

const BIG: u64 = 1 << 30;

#[test]
fn a_hit_is_the_decode_bit_for_bit_at_any_rate() {
    let d = scratch("identity");
    let src = d.join("stem.wav");
    write_wav(&src, 44_100, MIN_SECONDS + 1.0, 1);
    let disk = DiskCache::new(d.join("cache"), BIG);
    for rate in [44_100, 48_000] {
        let fresh = resample(&decode_file(&src).unwrap(), rate).unwrap();
        let first = SampleCache::with_disk(rate, disk.clone());
        assert_eq!(*first.get(&src).unwrap(), fresh);
        disk.wait();
        let before = disk.info();
        // A new run: nothing in memory, the entry on disk.
        let again = SampleCache::with_disk(rate, disk.clone());
        assert_eq!(*again.get(&src).unwrap(), fresh, "{rate} Hz");
        assert_eq!(disk.info().hits, before.hits + 1);
    }
    // One entry per rate.
    assert_eq!(disk.info().entries, 2);
}

#[test]
fn a_changed_file_misses_and_is_decoded_again() {
    let d = scratch("changed");
    let src = d.join("stem.wav");
    write_wav(&src, 44_100, MIN_SECONDS + 1.0, 2);
    let t0 = SystemTime::now() - Duration::from_secs(600);
    set_time(&src, t0);
    let disk = DiskCache::new(d.join("cache"), BIG);
    SampleCache::with_disk(44_100, disk.clone()).get(&src).unwrap();
    disk.wait();
    // Same size, other audio, another time: the old entry does not answer.
    write_wav(&src, 44_100, MIN_SECONDS + 1.0, 3);
    set_time(&src, t0 + Duration::from_secs(5));
    let hits = disk.info().hits;
    let got = SampleCache::with_disk(44_100, disk.clone()).get(&src).unwrap();
    assert_eq!(*got, decode_file(&src).unwrap());
    assert_eq!(disk.info().hits, hits);
}

#[test]
fn a_damaged_entry_is_a_miss_and_is_removed() {
    let d = scratch("damaged");
    let src = d.join("stem.wav");
    write_wav(&src, 44_100, MIN_SECONDS + 1.0, 4);
    let disk = DiskCache::new(d.join("cache"), BIG);
    let fresh = decode_file(&src).unwrap();
    let load = || SampleCache::with_disk(44_100, disk.clone()).get(&src).unwrap();
    load();
    disk.wait();
    let pcm = d.join("cache").join(&entries(&d.join("cache"))[0]);
    let good = fs::read(&pcm).unwrap();

    // One flipped bit deep in the audio.
    let mut bad = good.clone();
    let at = bad.len() - 12_345;
    bad[at] ^= 0x10;
    fs::write(&pcm, &bad).unwrap();
    let hits = disk.info().hits;
    assert_eq!(*load(), fresh);
    assert_eq!(disk.info().hits, hits);
    disk.wait();
    assert_eq!(fs::read(&pcm).unwrap(), good, "written again after the miss");

    // Cut short, as by a crash or a full disk.
    fs::write(&pcm, &good[..good.len() / 2]).unwrap();
    assert_eq!(*load(), fresh);
    disk.wait();
    assert_eq!(fs::read(&pcm).unwrap(), good);

    // Someone else's file under the name.
    let mut other = good.clone();
    other[20] ^= 1;
    fs::write(&pcm, &other).unwrap();
    assert_eq!(*load(), fresh);
}

#[test]
fn short_files_are_not_kept_and_a_cap_of_zero_keeps_nothing() {
    let d = scratch("short");
    let short = d.join("kick.wav");
    write_wav(&short, 44_100, 1.0, 5);
    let disk = DiskCache::new(d.join("cache"), BIG);
    SampleCache::with_disk(44_100, disk.clone()).get(&short).unwrap();
    disk.wait();
    assert_eq!(disk.info().entries, 0);

    let long = d.join("stem.wav");
    write_wav(&long, 44_100, MIN_SECONDS + 1.0, 6);
    let off = DiskCache::new(d.join("off"), 0);
    SampleCache::with_disk(44_100, off.clone()).get(&long).unwrap();
    off.wait();
    assert!(entries(&d.join("off")).is_empty());
}

#[test]
fn the_cap_drops_the_least_recently_used_entry_and_its_sidecars() {
    let d = scratch("lru");
    let cache_dir = d.join("cache");
    let frames = (8_000.0 * (MIN_SECONDS + 1.0)) as usize;
    let srcs: Vec<PathBuf> = (0..3).map(|i| d.join(format!("stem{i}.wav"))).collect();
    for (i, s) in srcs.iter().enumerate() {
        // Mono 8 kHz: small entries.
        let mut r = Lcg(10 + i as u64);
        let pcm: Vec<i16> = (0..frames).map(|_| r.next() as i16).collect();
        fs::write(s, wav::encode_pcm16(1, 8_000, &pcm)).unwrap();
    }
    // Room for two entries with their sidecars, not three.
    let one = frames as u64 * 4 + 300;
    let disk = DiskCache::new(&cache_dir, 2 * one + 1_000);
    let key = |p: &Path| {
        let m = fs::metadata(p).unwrap();
        Key::new(p, m.len(), m.modified().ok(), 8_000).unwrap()
    };
    // stem0 last used an hour ago, stem1 a minute ago.
    let now = SystemTime::now();
    for (s, age) in [(&srcs[0], 3600), (&srcs[1], 60)] {
        let old = entries(&cache_dir);
        SampleCache::with_disk(8_000, disk.clone()).get(s).unwrap();
        disk.wait();
        disk.store(&key(s), "peaks", b"sidecar");
        for f in entries(&cache_dir).into_iter().filter(|f| !old.contains(f)) {
            set_time(&cache_dir.join(f), now - Duration::from_secs(age));
        }
    }
    assert_eq!(disk.info().entries, 2);

    SampleCache::with_disk(8_000, disk.clone()).get(&srcs[2]).unwrap();
    disk.wait();
    assert!(disk.load(&key(&srcs[0]), "peaks").is_none(), "stem0 went, sidecar and all");
    assert!(disk.load(&key(&srcs[1]), "peaks").is_some());
    let info = disk.info();
    assert_eq!(info.entries, 2);
    assert!(info.bytes <= info.cap, "{info:?}");
    assert!(!entries(&cache_dir).iter().any(|f| f.contains(".tmp-")));
}

#[test]
fn two_loads_of_one_file_at_once_leave_one_good_entry() {
    let d = scratch("race");
    let src = d.join("stem.wav");
    write_wav(&src, 44_100, MIN_SECONDS + 1.0, 7);
    let disk = DiskCache::new(d.join("cache"), BIG);
    let fresh = decode_file(&src).unwrap();
    std::thread::scope(|s| {
        for _ in 0..4 {
            s.spawn(|| {
                let got = SampleCache::with_disk(44_100, disk.clone()).get(&src).unwrap();
                assert_eq!(*got, fresh);
            });
        }
    });
    disk.wait();
    assert_eq!(entries(&d.join("cache")).len(), 1);
    assert_eq!(*SampleCache::with_disk(44_100, disk.clone()).get(&src).unwrap(), fresh);
}

#[test]
fn sidecars_round_trip_and_clear_empties_the_folder() {
    let d = scratch("sidecars");
    let src = d.join("stem.wav");
    write_wav(&src, 44_100, MIN_SECONDS + 1.0, 8);
    let disk = DiskCache::new(d.join("cache"), BIG);
    let cache = SampleCache::with_disk(44_100, disk.clone());
    let s = cache.get(&src).unwrap();
    let key = cache.disk_key(&src).expect("a long file has a key");
    let peaks = Peaks::build(&s, 64);
    disk.store(&key, "peaks", &peaks.to_bytes());
    assert_eq!(Peaks::from_bytes(&disk.load(&key, "peaks").unwrap()).unwrap(), peaks);
    assert!(Peaks::from_bytes(&peaks.to_bytes()[..10]).is_none());
    disk.wait();
    assert_eq!(disk.info().entries, 1, "the sample and its sidecar are one entry");
    disk.clear();
    assert_eq!(disk.info().entries, 0);
    assert!(entries(&d.join("cache")).is_empty());
    // Short files have no key: nothing is kept for them.
    let short = d.join("kick.wav");
    write_wav(&short, 44_100, 1.0, 9);
    cache.get(&short).unwrap();
    assert!(cache.disk_key(&short).is_none());
}
