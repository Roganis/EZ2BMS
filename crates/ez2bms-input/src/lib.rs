//! Game controllers for EZ2BMS, read the way EZ2PORT reads them.
//!
//! EZ2PORT reads pads through SDL3's joystick layer (platform/common/ezpad.c)
//! and names each by make, `vid:pid[#n]`, in keys.ini. EZ2BMS reads the same
//! devices with the same SDL, so a binding copied between the two programs
//! presses the same button, and a press is timed by SDL's own stamp.
//!
//! - `device`: naming and the port's limits (portable, tested anywhere).
//! - `time`: carrying an event's age from SDL's clock to the host's.
//! - `event`: what goes to the editor, whose InputMapper (chart-core
//!   input/mapper.ts) turns it into channels - one mapping for keyboard and
//!   pads, where the debounce, hats and turntable rules live.
//! - `sdl` (feature `sdl`): the thread that owns SDL.

pub mod device;
pub mod event;
#[cfg(feature = "sdl")]
pub mod sdl;
pub mod time;

pub use device::PadInfo;
pub use event::PadEvent;
