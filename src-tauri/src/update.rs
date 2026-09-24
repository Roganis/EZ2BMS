//! Updating EZ2BMS from the newest published release (tauri-plugin-updater).
//!
//! The release workflow adds the updater's settings - the update key's
//! public half and this repository's address - only when the key exists
//! (scripts/release-config.mjs, docs/releasing.md). The plugin refuses to
//! start without them, so a build that has none has no updater at all and
//! says why (`no-key`). An update is only installed after its signature is
//! checked against that key. A Linux package is its package manager's to
//! update: only the AppImage updates itself (`package`).

use std::sync::Mutex;

use serde::Serialize;
use tauri::utils::config::PluginConfig;
use tauri_plugin_updater::Update;

/// Where the releases are, for a build that cannot update itself.
pub const RELEASES_PAGE: &str = "https://github.com/Roganis/EZ2BMS/releases/latest";

/// Whether this build carries the updater's settings with a public key.
pub fn configured(plugins: &PluginConfig) -> bool {
    plugins
        .0
        .get("updater")
        .and_then(|u| u.get("pubkey"))
        .and_then(|k| k.as_str())
        .is_some_and(|k| !k.trim().is_empty())
}

/// Why this build cannot update itself, or None when it can.
pub fn unsupported(configured: bool, appimage: bool) -> Option<&'static str> {
    if !configured {
        Some("no-key")
    } else if cfg!(target_os = "linux") && !appimage {
        Some("package")
    } else {
        None
    }
}

/// The update `update_check` found, kept for `update_install`.
#[derive(Default)]
pub struct Pending(pub Mutex<Option<Update>>);

/// Whether the updater is registered in this run (see `configured`).
pub struct Configured(pub bool);

#[derive(Debug, Serialize)]
pub struct UpdateDto {
    pub version: String,
    pub current: String,
    pub notes: Option<String>,
    /// When it was published, ms since the epoch.
    pub date_ms: Option<i64>,
}

impl From<&Update> for UpdateDto {
    fn from(u: &Update) -> Self {
        UpdateDto {
            version: u.version.clone(),
            current: u.current_version.clone(),
            notes: u.body.clone().filter(|b| !b.trim().is_empty()),
            date_ms: u.date.map(|d| (d.unix_timestamp_nanos() / 1_000_000) as i64),
        }
    }
}

#[derive(Clone, Serialize)]
pub struct ProgressDto {
    pub done: u64,
    pub total: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn plugins(v: serde_json::Value) -> PluginConfig {
        serde_json::from_value(v).unwrap()
    }

    #[test]
    fn only_a_build_with_the_public_key_has_an_updater() {
        assert!(!configured(&plugins(json!({}))));
        assert!(!configured(&plugins(json!({ "updater": { "pubkey": "  " } }))));
        assert!(configured(&plugins(json!({ "updater": { "pubkey": "dW50cnVzdGVk" } }))));
        assert_eq!(unsupported(false, true), Some("no-key"));
        let linux_package = if cfg!(target_os = "linux") { Some("package") } else { None };
        assert_eq!(unsupported(true, false), linux_package);
        assert_eq!(unsupported(true, true), None);
    }

    /// What scripts/release-config.mjs adds is what the plugin reads.
    #[test]
    fn the_release_settings_are_the_plugins() {
        let c: tauri_plugin_updater::Config = serde_json::from_value(json!({
            "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDEyMzQK",
            "endpoints": ["https://github.com/Roganis/EZ2BMS/releases/latest/download/latest.json"]
        }))
        .unwrap();
        assert_eq!(c.endpoints.len(), 1);
        assert_eq!(c.endpoints[0].host_str(), Some("github.com"));
    }
}
