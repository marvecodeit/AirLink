use std::time::Duration;

use crate::models::connection_status::IpConfiguration;
use crate::models::wifi_network::WifiNetwork;

use crate::services::shell;

pub const WIFI_INTERFACE_FALLBACK: &str = "en0";

/// A combined view of the Wi-Fi link and the IP configuration attached to it.
#[derive(Debug, Clone, Default)]
pub struct NetworkSnapshot {
    pub wifi: WifiNetwork,
    pub ip: IpConfiguration,
    pub warnings: Vec<String>,
}

/// Collects Wi-Fi and IP information using CoreWLAN first, with narrowly
/// scoped system commands as fallbacks. No administrator privileges are used.
#[derive(Debug, Default, Clone)]
pub struct WifiManager;

impl WifiManager {
    pub async fn snapshot(&self) -> NetworkSnapshot {
        let mut warnings = Vec::new();

        let route_output = shell::run(
            "/sbin/route",
            &["-n", "get", "default"],
            Duration::from_secs(2),
        )
        .await
        .unwrap_or_default();
        let route_interface = shell::parse_default_route(&route_output);
        let gateway = shell::parse_default_gateway(&route_output);

        let core = tokio::task::spawn_blocking(corewlan_snapshot)
            .await
            .unwrap_or_else(|error| {
                log::debug!("CoreWLAN task failed: {error}");
                None
            });

        let interface_name = core
            .as_ref()
            .and_then(|value| value.interface.clone())
            .or_else(|| route_interface.clone())
            .or_else(detect_wifi_interface);

        let interface = interface_name
            .clone()
            .unwrap_or_else(|| WIFI_INTERFACE_FALLBACK.into());

        let ifconfig_output = shell::run(
            "/sbin/ifconfig",
            &[interface.as_str()],
            Duration::from_secs(2),
        )
        .await
        .unwrap_or_default();
        let ifconfig = shell::parse_ifconfig(&ifconfig_output);

        let scutil_output = shell::run("/usr/sbin/scutil", &["--dns"], Duration::from_secs(2))
            .await
            .unwrap_or_default();
        let mut dns = shell::parse_scutil_dns(&scutil_output);
        if dns.is_empty()
            && let Ok(resolv) = tokio::fs::read_to_string("/etc/resolv.conf").await
        {
            dns = shell::parse_resolv_conf(&resolv);
        }

        let mut wifi = WifiNetwork {
            interface: Some(interface.clone()),
            ..WifiNetwork::default()
        };

        if let Some(core) = core {
            wifi.ssid = core.ssid;
            wifi.bssid = core.bssid;
            wifi.rssi = core.rssi;
            wifi.noise = core.noise;
            wifi.channel = core.channel;
            wifi.band = core.band;
            wifi.channel_width_mhz = core.channel_width_mhz;
            wifi.phy_mode = core.phy_mode;
            wifi.security = core.security;
            wifi.powered = core.powered;
        } else {
            warnings.push("CoreWLAN information was unavailable.".into());
        }

        // `networksetup` is a harmless, unprivileged fallback used for the
        // SSID and power state when CoreWLAN cannot provide them.
        if wifi.ssid.is_none()
            && let Ok(output) = shell::run(
                "/usr/sbin/networksetup",
                &["-getairportnetwork", interface.as_str()],
                Duration::from_secs(2),
            )
            .await
        {
            wifi.ssid = shell::parse_networksetup_ssid(&output);
        }

        if !wifi.powered
            && let Ok(output) = shell::run(
                "/usr/sbin/networksetup",
                &["-getairportpower", interface.as_str()],
                Duration::from_secs(2),
            )
            .await
            && let Some(powered) = shell::parse_airport_power(&output)
        {
            wifi.powered = powered;
        }

        wifi.associated = wifi.channel.is_some()
            || ifconfig.ipv4.is_some()
            || (wifi.powered && wifi.ssid.is_some());

        // If the link is clearly associated but macOS hides the SSID, explain
        // that Location Services access is required instead of showing a
        // misleading empty network name.
        wifi.ssid_restricted = wifi.associated && wifi.ssid.is_none();
        wifi.apply_signal();

        let ip = IpConfiguration {
            ipv4: ifconfig.ipv4,
            subnet_mask: ifconfig.subnet_mask,
            gateway,
            dns,
            interface: Some(interface),
            mac_address: ifconfig.mac_address,
            ipv6: ifconfig.ipv6,
        };

        NetworkSnapshot { wifi, ip, warnings }
    }
}

#[derive(Debug, Clone, Default)]
struct CoreWlanSnapshot {
    interface: Option<String>,
    ssid: Option<String>,
    bssid: Option<String>,
    rssi: Option<i32>,
    noise: Option<i32>,
    channel: Option<u32>,
    band: Option<String>,
    channel_width_mhz: Option<u32>,
    phy_mode: Option<String>,
    security: Option<String>,
    powered: bool,
}

#[cfg(target_os = "macos")]
fn corewlan_snapshot() -> Option<CoreWlanSnapshot> {
    use objc2::rc::autoreleasepool;
    use objc2_core_wlan::{CWChannelBand, CWChannelWidth, CWPHYMode, CWSecurity, CWWiFiClient};

    autoreleasepool(|_| {
        // CoreWLAN's client singleton can be queried from a worker thread.
        // All Objective-C objects are kept inside this autorelease pool.
        let client = unsafe { CWWiFiClient::sharedWiFiClient() };
        let interface = unsafe { client.interface() }?;
        let interface_name = unsafe { interface.interfaceName() }.map(|value| value.to_string());
        let powered = unsafe { interface.powerOn() };

        let ssid = unsafe { interface.ssid() }.map(|value| value.to_string());
        let bssid = unsafe { interface.bssid() }.map(|value| value.to_string());
        let rssi = unsafe { interface.rssiValue() } as i32;
        let noise = unsafe { interface.noiseMeasurement() } as i32;

        let channel_info = unsafe { interface.wlanChannel() }.map(|channel| {
            let number = unsafe { channel.channelNumber() } as u32;
            let band = match unsafe { channel.channelBand() } {
                CWChannelBand::Band2GHz => "2.4 GHz",
                CWChannelBand::Band5GHz => "5 GHz",
                CWChannelBand::Band6GHz => "6 GHz",
                _ => "Unknown",
            };
            let width = match unsafe { channel.channelWidth() } {
                CWChannelWidth::Width20MHz => 20,
                CWChannelWidth::Width40MHz => 40,
                CWChannelWidth::Width80MHz => 80,
                CWChannelWidth::Width160MHz => 160,
                _ => 0,
            };
            (number, band.to_string(), width)
        });

        let security = match unsafe { interface.security() } {
            CWSecurity::None => Some("Open".to_string()),
            CWSecurity::WEP => Some("WEP".to_string()),
            CWSecurity::WPAPersonal | CWSecurity::WPAPersonalMixed => {
                Some("WPA Personal".to_string())
            }
            CWSecurity::WPA2Personal => Some("WPA2 Personal".to_string()),
            CWSecurity::Personal => Some("WPA2/WPA3 Personal".to_string()),
            CWSecurity::WPA3Personal => Some("WPA3 Personal".to_string()),
            CWSecurity::WPA3Transition => Some("WPA2/WPA3 Transition".to_string()),
            CWSecurity::WPAEnterprise | CWSecurity::WPAEnterpriseMixed => {
                Some("WPA Enterprise".to_string())
            }
            CWSecurity::WPA2Enterprise => Some("WPA2 Enterprise".to_string()),
            CWSecurity::WPA3Enterprise => Some("WPA3 Enterprise".to_string()),
            CWSecurity::Enterprise => Some("Enterprise".to_string()),
            CWSecurity::OWE | CWSecurity::OWETransition => Some("Enhanced Open".to_string()),
            CWSecurity::DynamicWEP => Some("Dynamic WEP".to_string()),
            _ => None,
        };

        let phy_mode = match unsafe { interface.activePHYMode() } {
            CWPHYMode::Mode11a => Some("802.11a".to_string()),
            CWPHYMode::Mode11b => Some("802.11b".to_string()),
            CWPHYMode::Mode11g => Some("802.11g".to_string()),
            CWPHYMode::Mode11n => Some("802.11n".to_string()),
            CWPHYMode::Mode11ac => Some("802.11ac".to_string()),
            CWPHYMode::Mode11ax => Some("802.11ax".to_string()),
            _ => None,
        };

        Some(CoreWlanSnapshot {
            interface: interface_name,
            ssid,
            bssid,
            rssi: (rssi < 0).then_some(rssi),
            noise: (noise < 0).then_some(noise),
            channel: channel_info.as_ref().map(|info| info.0),
            band: channel_info.as_ref().map(|info| info.1.clone()),
            channel_width_mhz: channel_info
                .as_ref()
                .map(|info| info.2)
                .filter(|width| *width > 0),
            phy_mode,
            security,
            powered,
        })
    })
}

#[cfg(not(target_os = "macos"))]
fn corewlan_snapshot() -> Option<CoreWlanSnapshot> {
    None
}

#[cfg(target_os = "macos")]
fn detect_wifi_interface() -> Option<String> {
    use objc2::rc::autoreleasepool;
    use objc2_core_wlan::CWWiFiClient;

    autoreleasepool(|_| {
        let client = unsafe { CWWiFiClient::sharedWiFiClient() };
        let interface = unsafe { client.interface() }?;
        unsafe { interface.interfaceName() }.map(|value| value.to_string())
    })
}

#[cfg(not(target_os = "macos"))]
fn detect_wifi_interface() -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// This is a safe smoke test for the native CoreWLAN path: it must not
    /// panic, even on a Mac without Wi-Fi or without Location permission.
    #[tokio::test]
    async fn snapshot_is_safe_without_permissions() {
        let snapshot = WifiManager.snapshot().await;
        if let Some(interface) = &snapshot.wifi.interface {
            assert!(!interface.is_empty());
            assert!(interface.starts_with("en") || interface.starts_with("awdl"));
        }
        assert!(snapshot.wifi.signal_quality.is_none() || snapshot.wifi.rssi.is_some());
    }
}
