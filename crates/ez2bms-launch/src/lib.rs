//! EZ2BMS's side of "Test in EZ2PORT": find `ez2play`, learn what the build
//! supports without running it, write the song into a songs folder of its own,
//! and run the chart with the log captured.
//!
//! Package bytes come from chart-core (the same compiler as the editor's
//! playback) and keysounds from ez2bms-audio; this crate only puts files in
//! place and starts the process.

pub mod error;
pub mod locate;
pub mod package;
pub mod probe;
pub mod spawn;

pub use error::{LaunchError, Result};
pub use package::{
    inspect, is_valid_song_key, retire_package, write_package, write_package_with, Inspection,
    TempSongs, WriteOptions,
};
pub use probe::{probe, Caps, Probe};
pub use spawn::{launch, LaunchSpec, LogLine, Outcome, Running, Stream};
