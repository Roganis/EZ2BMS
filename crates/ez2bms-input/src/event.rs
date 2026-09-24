//! What the controller thread tells the editor, as JSON over the host's
//! stream. The editor's InputMapper (chart-core input/mapper.ts) takes the
//! same fields as its RawInput: a button's level, a hat's SDL_HAT_* mask, an
//! axis's raw -32768..32767 - the mapping to channels, the debounce and the
//! turntable all happen there, once, for keyboard and pads alike.

use serde::{Deserialize, Serialize};

use crate::device::PadInfo;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PadEvent {
    /// The opened pads changed (a rescan: plugged, unplugged, opened, closed).
    /// Every held button of every pad is released by it, as a rescan clears
    /// the port's pad state.
    Devices { devices: Vec<PadInfo> },
    #[serde(rename_all = "camelCase")]
    Button { device: String, index: u8, down: bool, host_ns: u64 },
    #[serde(rename_all = "camelCase")]
    Hat { device: String, index: u8, value: u8, host_ns: u64 },
    #[serde(rename_all = "camelCase")]
    Axis { device: String, index: u8, value: i16, host_ns: u64 },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_are_tagged_camel_case_json() {
        let ev =
            PadEvent::Button { device: "0810:e501#1".into(), index: 3, down: true, host_ns: 12 };
        let json = serde_json::to_string(&ev).unwrap();
        assert_eq!(
            json,
            r#"{"kind":"button","device":"0810:e501#1","index":3,"down":true,"hostNs":12}"#
        );
        assert_eq!(serde_json::from_str::<PadEvent>(&json).unwrap(), ev);

        let hat = PadEvent::Hat { device: "a".into(), index: 0, value: 9, host_ns: 1 };
        assert_eq!(
            serde_json::to_string(&hat).unwrap(),
            r#"{"kind":"hat","device":"a","index":0,"value":9,"hostNs":1}"#
        );
        let axis = PadEvent::Axis { device: "a".into(), index: 1, value: -32768, host_ns: 2 };
        assert_eq!(
            serde_json::to_string(&axis).unwrap(),
            r#"{"kind":"axis","device":"a","index":1,"value":-32768,"hostNs":2}"#
        );
        let devs = PadEvent::Devices {
            devices: vec![PadInfo {
                key: "0810:e501".into(),
                name: "bridge".into(),
                vid: 0x810,
                pid: 0xe501,
                buttons: 25,
                axes: 2,
                hats: 0,
            }],
        };
        assert_eq!(
            serde_json::to_string(&devs).unwrap(),
            r#"{"kind":"devices","devices":[{"key":"0810:e501","name":"bridge","vid":2064,"pid":58625,"buttons":25,"axes":2,"hats":0}]}"#
        );
    }
}
