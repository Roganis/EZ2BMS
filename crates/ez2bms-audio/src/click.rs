//! The metronome's clicks (Record mode's count-in and metronome, the
//! latency test): generated here, so nothing is shipped and every machine
//! clicks the same.
//!
//! A sine burst with a 1 ms attack and a fast exponential decay: 2 kHz for
//! the first beat of a bar (accented), 1 kHz for the others. 2 kHz sits above
//! most of a mix's energy, so it is heard over the chart; the attack is short
//! enough that the click's onset - what a player taps to - is where its event
//! is, and it has died away (below -60 dB) within its 40 ms, so a click never
//! runs into the next at any tempo the editor plays.

use crate::sample::Sample;

/// How long a click lasts.
pub const CLICK_MS: f64 = 40.0;
const ATTACK_MS: f64 = 1.0;
/// The decay's time constant: e^(-40/5) is about -69 dB at the end.
const DECAY_MS: f64 = 5.0;

/// A mono click at `rate`.
pub fn click(rate: u32, accent: bool) -> Sample {
    let r = rate as f64;
    let n = (r * CLICK_MS / 1000.0).round() as usize;
    let (freq, amp) = if accent { (2000.0, 0.8) } else { (1000.0, 0.55) };
    let attack = r * ATTACK_MS / 1000.0;
    let decay = r * DECAY_MS / 1000.0;
    let data = (0..n)
        .map(|i| {
            let t = i as f64;
            let env = (t / attack).min(1.0) * (-t / decay).exp();
            (amp * env * (std::f64::consts::TAU * freq * t / r).sin()) as f32
        })
        .collect();
    Sample::new(rate, 1, data)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn peak(s: &[f32]) -> f32 {
        s.iter().fold(0.0f32, |m, v| m.max(v.abs()))
    }

    #[test]
    fn a_click_is_short_starts_at_once_and_dies_away() {
        for rate in [44_100, 48_000] {
            for accent in [false, true] {
                let c = click(rate, accent);
                assert_eq!(c.channels, 1);
                assert_eq!(c.frames(), (rate as f64 * 0.04).round() as usize);
                assert_eq!(c.data[0], 0.0);
                let p = peak(&c.data);
                assert!(p > 0.3 && p <= 0.8, "{p}");
                // Loudest within its first 2 ms: the onset is the event.
                let head = (rate as usize) / 500;
                assert_eq!(peak(&c.data[..head]), p);
                // Below -60 dB of its peak by the end.
                let tail = &c.data[c.data.len() - rate as usize / 1000..];
                assert!(peak(tail) < p * 1e-3, "{}", peak(tail) / p);
            }
        }
    }

    #[test]
    fn the_accent_is_higher_and_louder_and_both_are_deterministic() {
        let a = click(48_000, true);
        let b = click(48_000, false);
        assert!(peak(&a.data) > peak(&b.data));
        let crossings =
            |s: &Sample| s.data.windows(2).filter(|w| (w[0] < 0.0) != (w[1] < 0.0)).count();
        assert!(crossings(&a) > crossings(&b) * 3 / 2);
        assert_eq!(click(48_000, true).data, a.data);
    }
}
