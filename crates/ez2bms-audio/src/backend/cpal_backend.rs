//! The system's output device, through cpal (WASAPI on Windows, ALSA on
//! Linux). The stream lives on a thread of its own - cpal streams are not
//! `Send` everywhere - and dies with the engine.
//!
//! The default device comes first. When it does not open, the others are
//! tried, sound servers first: on Linux, ALSA's "default" is whatever the
//! user's ALSA configuration makes it, and a line alsa-lib no longer accepts
//! (the owner's Arch machine: "Unknown field period_size") leaves it
//! unusable while PipeWire's own ALSA device plays fine.

use std::sync::mpsc;
use std::thread::JoinHandle;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample, StreamConfig};

use crate::engine::{Engine, Renderer};
use crate::error::{AudioError, Result};

/// Frames rendered per call; bigger device buffers are filled in pieces.
const MAX_BLOCK: usize = 8192;

struct CpalBackend {
    stop: Option<mpsc::Sender<()>>,
    thread: Option<JoinHandle<()>>,
}

impl Drop for CpalBackend {
    fn drop(&mut self) {
        self.stop.take();
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn dev_err(e: impl std::fmt::Display) -> AudioError {
    AudioError::Device(e.to_string())
}

/// Names tried after the default, in order: the sound servers' own ALSA
/// devices, then the card's default. Any other device follows.
const PREFERRED: [&str; 3] = ["pipewire", "pulse", "sysdefault"];

/// The devices to try: the default, then the rest, preferred names first.
fn candidates(host: &cpal::Host) -> Vec<(String, cpal::Device)> {
    let mut out = Vec::new();
    if let Some(d) = host.default_output_device() {
        out.push((d.name().unwrap_or_else(|_| "default".into()), d));
    }
    let mut rest: Vec<(String, cpal::Device)> = match host.output_devices() {
        Ok(ds) => ds.map(|d| (d.name().unwrap_or_default(), d)).collect(),
        Err(_) => Vec::new(),
    };
    rest.retain(|(n, _)| !n.is_empty() && n != "null" && !out.iter().any(|(m, _)| m == n));
    let rank = |n: &str| PREFERRED.iter().position(|p| n == *p || n.starts_with(&format!("{p}:")));
    rest.sort_by_key(|(n, _)| rank(n).unwrap_or(PREFERRED.len()));
    out.extend(rest);
    out
}

/// Opens and starts a silent stream on the device: proof it plays, before
/// the engine is built at its rate.
fn probe(device: &cpal::Device) -> Result<cpal::SupportedStreamConfig> {
    let supported = device.default_output_config().map_err(dev_err)?;
    let config: StreamConfig = supported.clone().into();
    let stream = match supported.sample_format() {
        SampleFormat::F32 => silent::<f32>(device, &config),
        SampleFormat::I16 => silent::<i16>(device, &config),
        SampleFormat::U16 => silent::<u16>(device, &config),
        SampleFormat::I32 => silent::<i32>(device, &config),
        other => Err(AudioError::Device(format!("unsupported sample format {other}"))),
    }?;
    stream.play().map_err(dev_err)?;
    drop(stream);
    Ok(supported)
}

fn silent<T: SizedSample>(device: &cpal::Device, config: &StreamConfig) -> Result<cpal::Stream> {
    device
        .build_output_stream(
            config,
            |data: &mut [T], _: &cpal::OutputCallbackInfo| data.fill(T::EQUILIBRIUM),
            |_| {},
            None,
        )
        .map_err(dev_err)
}

pub fn start() -> Result<Engine> {
    let (rate_tx, rate_rx) = mpsc::channel::<Result<(u32, String, Vec<String>)>>();
    let (renderer_tx, renderer_rx) = mpsc::channel::<Renderer>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<()>>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let thread = std::thread::Builder::new()
        .name("ez2bms-audio-cpal".into())
        .spawn(move || {
            let host = cpal::default_host();
            let mut failed = Vec::new();
            let mut opened = None;
            for (name, device) in candidates(&host) {
                match probe(&device) {
                    Ok(supported) => {
                        opened = Some((name, device, supported));
                        break;
                    }
                    Err(e) => failed.push(format!("{name}: {e}")),
                }
            }
            let Some((name, device, supported)) = opened else {
                let why = if failed.is_empty() {
                    "no output device".to_string()
                } else {
                    failed.join("; ")
                };
                let _ = rate_tx.send(Err(AudioError::Device(why)));
                return;
            };
            let format = supported.sample_format();
            let config: StreamConfig = supported.into();
            let _ = rate_tx.send(Ok((config.sample_rate.0, name, failed)));
            let Ok(renderer) = renderer_rx.recv() else { return };
            let stream = match format {
                SampleFormat::F32 => build::<f32>(&device, &config, renderer),
                SampleFormat::I16 => build::<i16>(&device, &config, renderer),
                SampleFormat::U16 => build::<u16>(&device, &config, renderer),
                SampleFormat::I32 => build::<i32>(&device, &config, renderer),
                other => Err(AudioError::Device(format!("unsupported sample format {other}"))),
            }
            .and_then(|s| s.play().map(|_| s).map_err(dev_err));
            match stream {
                Ok(stream) => {
                    let _ = ready_tx.send(Ok(()));
                    // Park until the engine goes away, then drop the stream here.
                    let _ = stop_rx.recv();
                    drop(stream);
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                }
            }
        })
        .map_err(dev_err)?;
    let (rate, name, skipped) = rate_rx.recv().map_err(dev_err)??;
    let (mut engine, renderer) = Engine::with_renderer(rate);
    engine.set_device(name, skipped);
    renderer_tx.send(renderer).map_err(dev_err)?;
    ready_rx.recv().map_err(dev_err)??;
    engine.attach_backend(Box::new(CpalBackend { stop: Some(stop_tx), thread: Some(thread) }));
    Ok(engine)
}

fn build<T>(device: &cpal::Device, config: &StreamConfig, mut r: Renderer) -> Result<cpal::Stream>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = config.channels as usize;
    let rate = config.sample_rate.0 as f64;
    let mut scratch = vec![0.0f32; MAX_BLOCK * 2];
    device
        .build_output_stream(
            config,
            move |data: &mut [T], info: &cpal::OutputCallbackInfo| {
                let ts = info.timestamp();
                let latency = ts
                    .playback
                    .duration_since(&ts.callback)
                    .map_or(0, |d| (d.as_secs_f64() * rate) as u32);
                for chunk in data.chunks_mut(MAX_BLOCK * channels) {
                    let n = chunk.len() / channels;
                    let buf = &mut scratch[..n * 2];
                    r.render(buf, latency);
                    for (o, lr) in chunk.chunks_exact_mut(channels).zip(buf.chunks_exact(2)) {
                        if channels == 1 {
                            o[0] = T::from_sample((lr[0] + lr[1]) * 0.5);
                        } else {
                            o[0] = T::from_sample(lr[0]);
                            o[1] = T::from_sample(lr[1]);
                            for x in &mut o[2..] {
                                *x = T::EQUILIBRIUM;
                            }
                        }
                    }
                }
            },
            |e| eprintln!("ez2bms-audio: output stream error: {e}"),
            None,
        )
        .map_err(dev_err)
}
