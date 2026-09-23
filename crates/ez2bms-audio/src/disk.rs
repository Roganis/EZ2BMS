//! Decoded audio kept on disk between runs, so a song with long stems opens
//! and publishes without decoding them again. A 5-minute OGG stem takes
//! seconds to decode and resample; reading it back takes a tenth of that.
//!
//! An entry is the exact f32 [`Sample`] a decode produced, so a hit is
//! bit-identical to decoding: publishing cuts the same keysound bytes whether
//! the cache had the stem or not. Beside it sit small sidecars (the waveform
//! mipmap, the onset analysis) built from that same decode.
//!
//! Every file names what it was made from (path, size, modification time,
//! rate, this crate's version) in its header and carries a checksum, so a
//! changed source, a colliding name, a truncated write or a bad disk block
//! reads as a miss, and the entry is removed. Space is bounded: the least
//! recently used entries go first once the cap is reached. Nothing here is
//! needed for correctness - every failure falls back to decoding.

use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::sample::Sample;

/// Files shorter than this are decoded every time: keysounds decode in
/// microseconds and a song has thousands of them; stems take seconds.
pub const MIN_SECONDS: f64 = 20.0;
/// No smaller file holds [`MIN_SECONDS`] of audio at any bitrate keysounds
/// come in (8 kbps Vorbis is 20 KB), so the cache is not even asked.
pub const MIN_SOURCE_BYTES: u64 = 16 * 1024;

/// Bump when an entry's layout changes. The crate version is in every key
/// too, so a new build (whose decoder or resampler may round differently)
/// never reads an older build's audio.
const LAYOUT: u32 = 1;
const MAGIC: &[u8; 8] = b"EZ2BMSC\0";
/// A temp file older than this is a crashed write's leftover.
const STALE_TMP: Duration = Duration::from_secs(3600);
/// Read and write in pieces of this many bytes (a multiple of 8, see `Sum`).
const IO_CHUNK: usize = 1 << 16;

/// What a cached entry was made from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Key {
    path: String,
    len: u64,
    secs: u64,
    nanos: u32,
    rate: u32,
}

impl Key {
    /// None when the file system gives no modification time: an edit that
    /// kept the size could not be told apart, so such files are not cached.
    pub fn new(path: &Path, len: u64, modified: Option<SystemTime>, rate: u32) -> Option<Key> {
        let t = modified?.duration_since(UNIX_EPOCH).ok()?;
        Some(Key {
            path: path.to_string_lossy().into_owned(),
            len,
            secs: t.as_secs(),
            nanos: t.subsec_nanos(),
            rate,
        })
    }

    /// Everything the entry must match, as it is written in its header.
    fn ident(&self, kind: &str) -> Vec<u8> {
        let mut v = Vec::with_capacity(64 + self.path.len());
        v.extend_from_slice(&LAYOUT.to_le_bytes());
        for s in [env!("CARGO_PKG_VERSION"), kind, &self.path] {
            v.extend_from_slice(&(s.len() as u32).to_le_bytes());
            v.extend_from_slice(s.as_bytes());
        }
        v.extend_from_slice(&self.len.to_le_bytes());
        v.extend_from_slice(&self.secs.to_le_bytes());
        v.extend_from_slice(&self.nanos.to_le_bytes());
        v.extend_from_slice(&self.rate.to_le_bytes());
        v
    }

    /// The entry's file stem: FNV-1a 64 of what it is made from (the kind
    /// left out, so an entry's files share it and are evicted together).
    fn stem(&self) -> String {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for b in self.ident("") {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
        format!("{h:016x}")
    }
}

/// A fast running checksum over 8-byte words: catches truncation and bad
/// blocks, not tampering. Every piece fed but the last is a multiple of 8.
struct Sum(u64);

impl Sum {
    fn new() -> Sum {
        Sum(0x243f_6a88_85a3_08d3)
    }

    fn feed(&mut self, bytes: &[u8]) {
        let mut words = bytes.chunks_exact(8);
        for w in &mut words {
            self.word(u64::from_le_bytes(w.try_into().unwrap()));
        }
        let rest = words.remainder();
        if !rest.is_empty() {
            let mut w = [0u8; 8];
            w[..rest.len()].copy_from_slice(rest);
            self.word(u64::from_le_bytes(w) ^ ((rest.len() as u64) << 56));
        }
    }

    fn word(&mut self, w: u64) {
        let h = (self.0 ^ w).wrapping_mul(0x9e37_79b9_7f4a_7c15);
        self.0 = h ^ (h >> 29);
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CacheInfo {
    /// Entries (a decoded file and its sidecars count once).
    pub entries: u64,
    pub bytes: u64,
    /// The limit, bytes; 0 = the cache is off.
    pub cap: u64,
    /// Since this cache was opened.
    pub hits: u64,
    pub misses: u64,
}

struct Inner {
    dir: PathBuf,
    cap: AtomicU64,
    hits: AtomicU64,
    misses: AtomicU64,
    /// Eviction and the rename that follows it, one writer at a time.
    room: Mutex<()>,
    pending: Mutex<Vec<JoinHandle<()>>>,
    tmp_seq: AtomicU64,
}

/// A folder of cached entries. Cloning shares it.
#[derive(Clone)]
pub struct DiskCache {
    inner: Arc<Inner>,
}

impl DiskCache {
    /// Entries under `dir` (made on the first write), at most `cap` bytes.
    pub fn new(dir: impl Into<PathBuf>, cap: u64) -> DiskCache {
        DiskCache {
            inner: Arc::new(Inner {
                dir: dir.into(),
                cap: AtomicU64::new(cap),
                hits: AtomicU64::new(0),
                misses: AtomicU64::new(0),
                room: Mutex::new(()),
                pending: Mutex::new(Vec::new()),
                tmp_seq: AtomicU64::new(0),
            }),
        }
    }

    pub fn dir(&self) -> &Path {
        &self.inner.dir
    }

    /// A new limit; entries over it go at the next write (or now, with 0).
    pub fn set_cap(&self, cap: u64) {
        self.inner.cap.store(cap, Ordering::Relaxed);
        if cap == 0 {
            self.clear();
        }
    }

    pub fn cap(&self) -> u64 {
        self.inner.cap.load(Ordering::Relaxed)
    }

    fn file(&self, key: &Key, kind: &str) -> PathBuf {
        self.inner.dir.join(format!("{}.{kind}", key.stem()))
    }

    // ---- reading

    /// Open an entry and check its header; the reader is left at the payload.
    fn open(&self, key: &Key, kind: &str) -> Option<(BufReader<File>, u64, u64, PathBuf)> {
        if self.cap() == 0 {
            return None;
        }
        let path = self.file(key, kind);
        let f = File::open(&path).ok()?;
        let size = f.metadata().ok()?.len();
        let mut r = BufReader::with_capacity(IO_CHUNK, f);
        let ok = (|| {
            let mut magic = [0u8; 8];
            r.read_exact(&mut magic).ok()?;
            let ident_len = read_u32(&mut r)? as usize;
            let want = key.ident(kind);
            if magic != *MAGIC || ident_len != want.len() {
                return None;
            }
            let mut ident = vec![0u8; ident_len];
            r.read_exact(&mut ident).ok()?;
            if ident != want {
                return None;
            }
            let payload = read_u64(&mut r)?;
            let sum = read_u64(&mut r)?;
            let header = 8 + 4 + ident_len as u64 + 16;
            (size == header + payload).then_some((payload, sum))
        })();
        match ok {
            Some((payload, sum)) => Some((r, payload, sum, path)),
            None => {
                // Another source's entry under a colliding name, an older
                // build's, or a cut-short write: it will never be read.
                let _ = fs::remove_file(&path);
                None
            }
        }
    }

    /// A read went through: count it, and mark the entry as recently used.
    fn hit(&self, path: &Path) {
        self.inner.hits.fetch_add(1, Ordering::Relaxed);
        if let Ok(f) = File::options().write(true).open(path) {
            let _ = f.set_modified(SystemTime::now());
        }
    }

    fn miss(&self, bad: Option<&Path>) {
        self.inner.misses.fetch_add(1, Ordering::Relaxed);
        if let Some(p) = bad {
            let _ = fs::remove_file(p);
        }
    }

    /// A small entry (a sidecar), if there is a valid one.
    pub fn load(&self, key: &Key, kind: &str) -> Option<Vec<u8>> {
        let Some((mut r, payload, sum, path)) = self.open(key, kind) else {
            self.miss(None);
            return None;
        };
        let mut bytes = vec![0u8; payload as usize];
        let mut s = Sum::new();
        if r.read_exact(&mut bytes).is_err() || {
            s.feed(&bytes);
            s.0 != sum
        } {
            self.miss(Some(&path));
            return None;
        }
        self.hit(&path);
        Some(bytes)
    }

    /// A decoded sample, if there is a valid one: exactly what was stored.
    pub fn load_sample(&self, key: &Key) -> Option<Sample> {
        let Some((mut r, payload, sum, path)) = self.open(key, "pcm") else {
            self.miss(None);
            return None;
        };
        let got = (|| {
            let mut head = [0u8; 8];
            r.read_exact(&mut head).ok()?;
            let channels = u16::from_le_bytes([head[0], head[1]]);
            let rate = u32::from_le_bytes(head[4..8].try_into().unwrap());
            let values = (payload.checked_sub(8)? / 4) as usize;
            if !(channels == 1 || channels == 2)
                || rate != key.rate
                || payload != 8 + values as u64 * 4
                || values % channels as usize != 0
            {
                return None;
            }
            let mut s = Sum::new();
            s.feed(&head);
            let mut data = Vec::with_capacity(values);
            let mut buf = vec![0u8; IO_CHUNK];
            while data.len() < values {
                let n = ((values - data.len()) * 4).min(IO_CHUNK);
                r.read_exact(&mut buf[..n]).ok()?;
                s.feed(&buf[..n]);
                data.extend(
                    buf[..n].chunks_exact(4).map(|b| f32::from_le_bytes(b.try_into().unwrap())),
                );
            }
            (s.0 == sum).then(|| Sample::new(rate, channels, data))
        })();
        match got {
            Some(sample) => {
                self.hit(&path);
                Some(sample)
            }
            None => {
                self.miss(Some(&path));
                None
            }
        }
    }

    // ---- writing

    /// Store a small entry (a sidecar) now.
    pub fn store(&self, key: &Key, kind: &str, bytes: &[u8]) {
        let _ = self.write(key, kind, bytes.len() as u64, |w, s| {
            s.feed(bytes);
            w.write_all(bytes)
        });
    }

    /// Store a decoded sample now. Samples under [`MIN_SECONDS`] are not kept.
    pub fn store_sample(&self, key: &Key, sample: &Sample) {
        if sample.seconds() < MIN_SECONDS {
            return;
        }
        let payload = 8 + sample.data.len() as u64 * 4;
        let _ = self.write(key, "pcm", payload, |w, s| {
            let mut head = [0u8; 8];
            head[..2].copy_from_slice(&sample.channels.to_le_bytes());
            head[4..].copy_from_slice(&sample.rate.to_le_bytes());
            s.feed(&head);
            w.write_all(&head)?;
            let mut buf = Vec::with_capacity(IO_CHUNK);
            for part in sample.data.chunks(IO_CHUNK / 4) {
                buf.clear();
                for x in part {
                    buf.extend_from_slice(&x.to_le_bytes());
                }
                s.feed(&buf);
                w.write_all(&buf)?;
            }
            Ok(())
        });
    }

    /// Store a decoded sample on another thread (a load should not wait for
    /// the disk); [`DiskCache::wait`] waits for every such write.
    pub fn store_sample_later(&self, key: Key, sample: Arc<Sample>) {
        if sample.seconds() < MIN_SECONDS || self.cap() == 0 {
            return;
        }
        let me = self.clone();
        let job = std::thread::spawn(move || me.store_sample(&key, &sample));
        let mut pending = self.inner.pending.lock().unwrap();
        pending.retain(|j| !j.is_finished());
        pending.push(job);
    }

    /// Wait for background writes.
    pub fn wait(&self) {
        let jobs = std::mem::take(&mut *self.inner.pending.lock().unwrap());
        for j in jobs {
            let _ = j.join();
        }
    }

    /// Header, payload (streamed by `body`, which feeds the checksum), then
    /// the checksum patched in; written to a temp name and renamed into place
    /// once there is room, so a reader never sees half an entry.
    fn write(
        &self,
        key: &Key,
        kind: &str,
        payload: u64,
        body: impl FnOnce(&mut BufWriter<File>, &mut Sum) -> std::io::Result<()>,
    ) -> std::io::Result<()> {
        let cap = self.cap();
        let ident = key.ident(kind);
        let total = 8 + 4 + ident.len() as u64 + 16 + payload;
        if cap == 0 || total > cap {
            return Ok(());
        }
        fs::create_dir_all(&self.inner.dir)?;
        let seq = self.inner.tmp_seq.fetch_add(1, Ordering::Relaxed);
        let tmp =
            self.inner.dir.join(format!("{}.{kind}.tmp-{}-{seq}", key.stem(), std::process::id()));
        let done = (|| {
            let mut w = BufWriter::with_capacity(IO_CHUNK, File::create(&tmp)?);
            w.write_all(MAGIC)?;
            w.write_all(&(ident.len() as u32).to_le_bytes())?;
            w.write_all(&ident)?;
            w.write_all(&payload.to_le_bytes())?;
            let sum_at = w.stream_position()?;
            w.write_all(&0u64.to_le_bytes())?;
            let mut s = Sum::new();
            body(&mut w, &mut s)?;
            w.seek(SeekFrom::Start(sum_at))?;
            w.write_all(&s.0.to_le_bytes())?;
            let f = w.into_inner().map_err(|e| e.into_error())?;
            if f.metadata()?.len() != total {
                return Err(std::io::Error::other("short write"));
            }
            let _room = self.inner.room.lock().unwrap();
            self.make_room(total, &self.file(key, kind))?;
            fs::rename(&tmp, self.file(key, kind))
        })();
        if done.is_err() {
            let _ = fs::remove_file(&tmp);
        }
        done
    }

    // ---- space

    /// Entries in the folder: per stem, its files, total size and when it
    /// was last used. Crashed writes' temp files are removed on the way.
    fn scan(&self) -> Vec<(String, Vec<PathBuf>, u64, SystemTime)> {
        let mut groups: std::collections::HashMap<String, (Vec<PathBuf>, u64, SystemTime)> =
            Default::default();
        let Ok(rd) = fs::read_dir(&self.inner.dir) else { return Vec::new() };
        let now = SystemTime::now();
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let Some((stem, rest)) = name.split_once('.') else { continue };
            if stem.len() != 16 || !stem.bytes().all(|b| b.is_ascii_hexdigit()) {
                continue;
            }
            let Ok(meta) = e.metadata() else { continue };
            let modified = meta.modified().unwrap_or(UNIX_EPOCH);
            if rest.contains(".tmp-") {
                if now.duration_since(modified).is_ok_and(|age| age > STALE_TMP) {
                    let _ = fs::remove_file(e.path());
                }
                continue;
            }
            let g = groups.entry(stem.to_owned()).or_insert((Vec::new(), 0, UNIX_EPOCH));
            g.0.push(e.path());
            g.1 += meta.len();
            g.2 = g.2.max(modified);
        }
        groups.into_iter().map(|(k, (files, size, used))| (k, files, size, used)).collect()
    }

    /// Evict least recently used entries until `incoming` more bytes fit
    /// (`replacing`, about to be overwritten, does not count).
    fn make_room(&self, incoming: u64, replacing: &Path) -> std::io::Result<()> {
        let cap = self.cap();
        let mut groups = self.scan();
        let mut total: u64 = groups.iter().map(|g| g.2).sum();
        if let Ok(m) = fs::metadata(replacing) {
            total = total.saturating_sub(m.len());
        }
        groups.sort_by(|a, b| a.3.cmp(&b.3).then_with(|| a.0.cmp(&b.0)));
        let keep = replacing.file_name().and_then(|n| n.to_str()).and_then(|n| n.split_once('.'));
        for (stem, files, size, _) in groups {
            if total + incoming <= cap {
                break;
            }
            // The entry being written keeps its other files (its sidecars).
            if keep.is_some_and(|(s, _)| s == stem) {
                continue;
            }
            for f in files {
                let _ = fs::remove_file(f);
            }
            total -= size;
        }
        Ok(())
    }

    pub fn info(&self) -> CacheInfo {
        let groups = self.scan();
        CacheInfo {
            entries: groups.len() as u64,
            bytes: groups.iter().map(|g| g.2).sum(),
            cap: self.cap(),
            hits: self.inner.hits.load(Ordering::Relaxed),
            misses: self.inner.misses.load(Ordering::Relaxed),
        }
    }

    /// Remove every entry (the folder stays).
    pub fn clear(&self) {
        self.wait();
        let _room = self.inner.room.lock().unwrap();
        for (_, files, _, _) in self.scan() {
            for f in files {
                let _ = fs::remove_file(f);
            }
        }
    }
}

fn read_u32(r: &mut impl Read) -> Option<u32> {
    let mut b = [0u8; 4];
    r.read_exact(&mut b).ok()?;
    Some(u32::from_le_bytes(b))
}

fn read_u64(r: &mut impl Read) -> Option<u64> {
    let mut b = [0u8; 8];
    r.read_exact(&mut b).ok()?;
    Some(u64::from_le_bytes(b))
}
