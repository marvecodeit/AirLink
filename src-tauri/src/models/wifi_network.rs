use serde::{Deserialize, Serialize};

/// A snapshot of the current Wi-Fi link, gathered from CoreWLAN with
/// command-line fallbacks where macOS restricts access.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiNetwork {
    /// `None` when the Mac is not associated, Wi-Fi is off, or macOS is
    /// withholding the SSID because Location access is not granted.
    pub ssid: Option<String>,
    pub bssid: Option<String>,
    /// Received signal strength in dBm.
    pub rssi: Option<i32>,
    /// Noise floor in dBm.
    pub noise: Option<i32>,
    /// 0–100 heuristic used by the UI.
    pub signal_quality: Option<u8>,
    pub signal_bars: Option<u8>,
    pub signal_label: Option<String>,
    pub channel: Option<u32>,
    pub band: Option<String>,
    pub channel_width_mhz: Option<u32>,
    pub phy_mode: Option<String>,
    pub security: Option<String>,
    pub interface: Option<String>,
    pub powered: bool,
    pub associated: bool,
    /// True when the interface is up but macOS has hidden the SSID pending
    /// Location Services authorization.
    pub ssid_restricted: bool,
}

impl WifiNetwork {
    pub fn apply_signal(&mut self) {
        if let Some(rssi) = self.rssi {
            let quality = signal_quality(rssi);
            self.signal_quality = Some(quality);
            self.signal_bars = Some(signal_bars(quality));
            self.signal_label = Some(signal_label(quality).to_string());
        }
    }
}

/// Map RSSI (dBm) to an approximate 0–100 quality score.
pub fn signal_quality(rssi: i32) -> u8 {
    // -30 dBm is excellent, -90 dBm is effectively unusable.
    let clamped = rssi.clamp(-90, -30);
    (((clamped + 90) as f32 / 60.0) * 100.0).round() as u8
}

pub fn signal_bars(quality: u8) -> u8 {
    match quality {
        0..=20 => 1,
        21..=45 => 2,
        46..=70 => 3,
        _ => 4,
    }
}

pub fn signal_label(quality: u8) -> &'static str {
    match quality {
        0..=20 => "Weak",
        21..=45 => "Fair",
        46..=70 => "Good",
        _ => "Excellent",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signal_quality_is_clamped_and_monotonic() {
        assert_eq!(signal_quality(-20), 100);
        assert_eq!(signal_quality(-30), 100);
        assert_eq!(signal_quality(-90), 0);
        assert_eq!(signal_quality(-120), 0);
        assert!(signal_quality(-50) > signal_quality(-70));
    }

    #[test]
    fn signal_bars_cover_all_qualities() {
        assert_eq!(signal_bars(0), 1);
        assert_eq!(signal_bars(30), 2);
        assert_eq!(signal_bars(60), 3);
        assert_eq!(signal_bars(90), 4);
    }
}
