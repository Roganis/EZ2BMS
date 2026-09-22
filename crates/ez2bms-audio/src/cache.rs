//! Decoded samples, resampled to one rate and kept while their file is
//! unchanged (size and modification time). Decoding happens outside the lock,
//! and `load_many` decodes on every core.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use crate::decode::decode_file;
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
}

impl SampleCache {
    pub fn new(rate: u32) -> Self {
        SampleCache { rate, entries: Mutex::new(HashMap::new()) }
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
        let sample = Arc::new(resample(&decode_file(path)?, self.rate)?);
        self.entries.lock().unwrap().insert(path.to_path_buf(), (st, sample.clone()));
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
