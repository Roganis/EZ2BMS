//! Carrying an event's time from SDL's clock to the editor's.
//!
//! SDL stamps each event when it happened, on its own clock (SDL_GetTicksNS;
//! on Linux evdev the kernel's time, converted). The editor judges and
//! records on the audio engine's host clock, a different epoch. The two are
//! read back to back once per batch of events, and each event keeps its AGE:
//! `host = host_now - (sdl_now - stamp)`. An age is what EZ2PORT uses too - it
//! backdates a press by how long it waited (`press = now - age`, ignoring
//! ages over 200 ms), so a press is placed when the player pressed, not when
//! the next frame read it. The error is the gap between the two clock reads,
//! well under a microsecond.

/// SDL's clock and the host's, read together.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClockPair {
    pub sdl_ns: u64,
    pub host_ns: u64,
}

impl ClockPair {
    /// The host time of an event SDL stamped `stamp_ns`. A stamp after the
    /// read (it can't be, but a driver's clock may disagree by a tick) is
    /// age 0; an age reaching before the host epoch is the epoch.
    pub fn host_at(&self, stamp_ns: u64) -> u64 {
        let age = self.sdl_ns.saturating_sub(stamp_ns);
        self.host_ns.saturating_sub(age)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_event_keeps_its_age() {
        let p = ClockPair { sdl_ns: 5_000_000_000, host_ns: 900_000_000 };
        assert_eq!(p.host_at(5_000_000_000), 900_000_000);
        assert_eq!(p.host_at(4_996_500_000), 896_500_000);
        // Order is kept: an older event maps earlier.
        assert!(p.host_at(4_990_000_000) < p.host_at(4_995_000_000));
    }

    #[test]
    fn stamps_out_of_range_saturate() {
        let p = ClockPair { sdl_ns: 1_000, host_ns: 500 };
        assert_eq!(p.host_at(2_000), 500);
        assert_eq!(p.host_at(0), 0);
    }
}
