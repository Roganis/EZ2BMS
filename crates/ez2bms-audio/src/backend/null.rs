//! No device: a thread that renders in real time and throws the audio away,
//! so the clock runs (CI, machines without sound, the browser build's twin).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crate::engine::Renderer;

pub struct NullBackend {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl NullBackend {
    pub fn spawn(mut r: Renderer, block: usize) -> NullBackend {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let rate = r.rate_hz();
        let thread = std::thread::Builder::new()
            .name("ez2bms-audio-null".into())
            .spawn(move || {
                let mut buf = vec![0.0f32; block * 2];
                let start = Instant::now();
                let mut done: u64 = 0;
                while !flag.load(Ordering::Relaxed) {
                    r.render(&mut buf, 0);
                    done += block as u64;
                    let due = start + Duration::from_secs_f64(done as f64 / rate as f64);
                    if let Some(wait) = due.checked_duration_since(Instant::now()) {
                        std::thread::sleep(wait);
                    }
                }
            })
            .expect("spawn the null audio thread");
        NullBackend { stop, thread: Some(thread) }
    }
}

impl Drop for NullBackend {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}
