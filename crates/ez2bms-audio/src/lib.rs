//! EZ2BMS audio: everything that touches samples.
//!
//! - [`decode`] any keysound (WAV, OGG, FLAC, MP3, `.ssf`/`.ezw`) and
//!   [`resample`] it; a [`cache::SampleCache`] keeps them decoded, and a
//!   [`disk::DiskCache`] keeps long ones decoded across runs.
//! - [`schedule::Schedule`]: the timed sounds of a chart, on voices that follow
//!   EZ2PORT's rule (a retrigger cuts: one voice per keysound, one per lane).
//! - [`engine::Engine`] plays a schedule live, from any point, picking up
//!   sounds already under way mid-sample; its [`clock`] says what is being
//!   heard. [`offline`] renders through the same mixer.
//! - [`cut`] and [`ssf`] write published keysounds: 16-bit 44.1 kHz stereo,
//!   sliced sample-exactly.
//!
//! Timing and voice assignment come from chart-core (TypeScript), which
//! compiles the chart exactly as it will be published; this crate only plays
//! what it is given.

pub mod backend;
pub mod cache;
pub mod clock;
pub mod cut;
pub mod decode;
pub mod disk;
pub mod engine;
pub mod error;
pub mod level;
pub mod mixer;
pub mod offline;
pub mod peaks;
pub mod preview;
pub mod resample;
pub mod sample;
pub mod schedule;
pub mod ssf;
pub mod wav;

pub use engine::{Engine, Renderer};
pub use error::{AudioError, Result};
pub use sample::Sample;
pub use schedule::{Event, EventSpec, Schedule, VoiceKey, VoiceStart};
