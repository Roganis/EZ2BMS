//! Naming game controllers the way EZ2PORT names them (reference/ezpad.c).
//!
//! A binding in keys.ini names its device by make, `vid:pid` in lowercase
//! hex, not by a path or an SDL instance id: a path isn't stable across a
//! reboot and can't be typed into a file. A second board of the same make is
//! `vid:pid#1`, the third `#2`, counted in the order SDL lists the opened
//! joysticks. So two identical cabinet bridges swap names if SDL lists them
//! the other way round - the port accepts that, and EZ2BMS must number them
//! the same or a binding written for one program presses the other's pad.

use serde::{Deserialize, Serialize};

/// ezpad.c MAX_PADS: joysticks past the eighth are not opened.
pub const MAX_PADS: usize = 8;
/// ezpad.c MAX_BUTTONS: a button at or past this index is ignored.
pub const MAX_BUTTONS: usize = 64;
/// ezpad.c MAX_AXES.
pub const MAX_AXES: usize = 16;
/// ezpad.c MAX_HATS.
pub const MAX_HATS: usize = 8;
/// ezpad.c `name[128]`: the name is cut to 127 bytes.
const NAME_BYTES: usize = 127;

/// One opened controller, as the editor lists and binds it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PadInfo {
    /// The device part of a binding: `0810:e501`, `0810:e501#1`.
    pub key: String,
    /// SDL's name for it, or the key when it has none.
    pub name: String,
    pub vid: u16,
    pub pid: u16,
    /// Counts as the port uses them: clamped to its limits.
    pub buttons: u32,
    pub axes: u32,
    pub hats: u32,
}

/// ezpad.c key_for: `vid:pid`, or `vid:pid#n` for the n-th earlier board of that make.
pub fn key_for(vid: u16, pid: u16, seen: usize) -> String {
    if seen == 0 {
        format!("{vid:04x}:{pid:04x}")
    } else {
        format!("{vid:04x}:{pid:04x}#{seen}")
    }
}

/// ezpad.c count_same: how many already-named pads are this make - a key
/// equal to `vid:pid` or starting `vid:pid#`.
pub fn count_same<'a>(keys: impl IntoIterator<Item = &'a str>, vid: u16, pid: u16) -> usize {
    let base = key_for(vid, pid, 0);
    keys.into_iter()
        .filter(|k| {
            k.strip_prefix(base.as_str())
                .is_some_and(|rest| rest.is_empty() || rest.starts_with('#'))
        })
        .count()
}

/// The keys a rescan gives joysticks opened in this order (ezPadRescan).
pub fn keys_for(makes: &[(u16, u16)]) -> Vec<String> {
    let mut keys: Vec<String> = Vec::with_capacity(makes.len());
    for &(vid, pid) in makes {
        let seen = count_same(keys.iter().map(String::as_str), vid, pid);
        keys.push(key_for(vid, pid, seen));
    }
    keys
}

/// ezpad.c: `snprintf(name, 128, "%s", nm ? nm : key)`. The port cuts at a
/// byte; a Rust string can't hold half a character, so the cut moves back to
/// the character's start - a name only differs where the port's would have
/// ended in a broken sequence.
pub fn pad_name(name: Option<&str>, key: &str) -> String {
    let s = name.unwrap_or(key);
    if s.len() <= NAME_BYTES {
        return s.to_owned();
    }
    let mut end = NAME_BYTES;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_owned()
}

/// A count SDL reports (negative on error), clamped as ezPadRescan does.
pub fn clamp_count(n: i32, max: usize) -> u32 {
    n.clamp(0, max as i32) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_the_make_in_lowercase_hex() {
        assert_eq!(key_for(0x0810, 0xE501, 0), "0810:e501");
        assert_eq!(key_for(0x2341, 0x8036, 2), "2341:8036#2");
        assert_eq!(key_for(0, 0, 0), "0000:0000");
    }

    #[test]
    fn a_second_board_of_a_make_is_numbered() {
        let keys =
            keys_for(&[(0x0810, 0xe501), (0x045e, 0x028e), (0x0810, 0xe501), (0x0810, 0xe501)]);
        assert_eq!(keys, ["0810:e501", "045e:028e", "0810:e501#1", "0810:e501#2"]);
    }

    #[test]
    fn counting_matches_the_whole_make_only() {
        // `0810:e5011` is not `0810:e501` - count_same checks what follows.
        let keys = ["0810:e501", "0810:e5011", "0810:e501#1", "x0810:e501"];
        assert_eq!(count_same(keys, 0x0810, 0xe501), 2);
        assert_eq!(count_same([], 0x0810, 0xe501), 0);
    }

    #[test]
    fn names_fall_back_to_the_key_and_are_cut_like_the_port() {
        assert_eq!(pad_name(None, "0810:e501"), "0810:e501");
        assert_eq!(pad_name(Some("EZ2 bridge"), "k"), "EZ2 bridge");
        let long = "a".repeat(200);
        assert_eq!(pad_name(Some(&long), "k").len(), 127);
        // 126 ASCII bytes then a 3-byte character: the port's cut would split
        // it, ours drops it whole.
        let cjk = format!("{}한", "a".repeat(126));
        assert_eq!(pad_name(Some(&cjk), "k"), "a".repeat(126));
    }

    #[test]
    fn counts_are_clamped_to_the_limits() {
        assert_eq!(clamp_count(100, MAX_BUTTONS), 64);
        assert_eq!(clamp_count(-1, MAX_AXES), 0);
        assert_eq!(clamp_count(4, MAX_HATS), 4);
    }
}
