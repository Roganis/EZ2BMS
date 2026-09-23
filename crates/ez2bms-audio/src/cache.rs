//! Decoded samples, resampled to one rate and kept while their file is
//! unchanged (size and modification time). Decoding happens outside the lock,
//! and `load_many` decodes on every core. With a [`DiskCache`], long files
//! also survive the app: read back instead of decoded, bit for bit the same.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use crate::decode::decode_file;
use crate::disk::{DiskCache, Key};
use crate::error::{AudioError, Result};
use crate::resample::resample;
use crate::sample::Sample;

#[derive(Clone, Copy, PartialEq, Eq)]
struct Stamp {
    len: u64,
    modified: Option<SystemTime>,
}

fn stamp(path: &Path) -> Result<Stamp> {
    let m = std::fs::metadata(path)
        .map_err(|source| AudioError::Io { path: path.to_path_buf(), source })?;
    Ok(Stamp { len: m.len(), modified: m.modified().ok() })
}

pub struct SampleCache {
    rate: u32,
    entries: Mutex<HashMap<PathBuf, (Stamp, Arc<Sample>)>>,
    disk: Option<DiskCache>,
}

impl SampleCache {
    pub fn new(rate: u32) -> Self {
        SampleCache { rate, entries: Mutex::new(HashMap::new()), disk: None }
    }

    /// Also keep long files decoded on disk, across runs.
    pub fn with_disk(rate: u32, disk: DiskCache) -> Self {
        SampleCache { rate, entries: Mutex::new(HashMap::new()), disk: Some(disk) }
    }

    pub fn disk(&self) -> Option<&DiskCache> {
        self.disk.as_ref()
    }

    /// The disk key of the sample held for `path` - of the file as it was
    /// when decoded, so sidecars stored under it describe that decode. None
    /// without a disk cache, for a file not loaded, or one too short to keep.
    pub fn disk_key(&self, path: &Path) -> Option<Key> {
        self.disk.as_ref()?;
        let entries = self.entries.lock().unwrap();
        let (st, s) = entries.get(path)?;
        if s.seconds() < crate::disk::MIN_SECONDS {
            return None;
        }
        Key::new(path, st.len, st.modified, self.rate)
    }

    pub fn rate(&self) -> u32 {
        self.rate
    }

    /// The sample at the cache's rate, decoding it if it is new or changed.
    pub fn get(&self, path: &Path) -> Result<Arc<Sample>> {
        let st = stamp(path)?;
        if let Some((s, sample)) = self.entries.lock().unwrap().get(path) {
            if *s == st {
                return Ok(sample.clone());
            }
        }
        // Too small to hold MIN_SECONDS of audio: not worth a look on disk.
        let key = self
            .disk
            .as_ref()
            .filter(|_| st.len >= crate::disk::MIN_SOURCE_BYTES)
            .and_then(|_| Key::new(path, st.len, st.modified, self.rate));
        if let (Some(d), Some(k)) = (&self.disk, &key) {
            if let Some(s) = d.load_sample(k) {
                let sample = Arc::new(s);
                self.entries.lock().unwrap().insert(path.to_path_buf(), (st, sample.clone()));
                return Ok(sample);
            }
        }
        let sample = Arc::new(resample(&decode_file(path)?, self.rate)?);
        self.entries.lock().unwrap().insert(path.to_path_buf(), (st, sample.clone()));
        if let (Some(d), Some(k)) = (&self.disk, key) {
            d.store_sample_later(k, sample.clone());
        }
        Ok(sample)
    }

    /// Many at once, spread over the machine's cores; results in input order.
    pub fn load_many(&self, paths: &[PathBuf]) -> Vec<Result<Arc<Sample>>> {
        let workers = std::thread::available_parallelism().map_or(4, |n| n.get()).min(paths.len());
        let next = AtomicUsize::new(0);
        let mut out: Vec<Option<Result<Arc<Sample>>>> = (0..paths.len()).map(|_| None).collect();
        let slots = Mutex::new(&mut out);
        std::thread::scope(|scope| {
            for _ in 0..workers {
                scope.spawn(|| loop {
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    if i >= paths.len() {
                        break;
                    }
                    let r = self.get(&paths[i]);
                    slots.lock().unwrap()[i] = Some(r);
                });
            }
        });
        out.into_iter().map(|r| r.expect("every path is loaded")).collect()
    }

    pub fn evict(&self, path: &Path) {
        self.entries.lock().unwrap().remove(path);
    }

    pub fn clear(&self) {
        self.entries.lock().unwrap().clear();
    }

    /// Memory held by cached sample data.
    pub fn bytes(&self) -> usize {
        self.entries.lock().unwrap().values().map(|(_, s)| s.bytes()).sum()
    }
}
