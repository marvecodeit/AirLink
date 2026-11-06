use std::process::Command;

use crate::models::hotspot::{HotspotClient, HotspotStatus};

/// Reads the state of macOS Internet Sharing. macOS does not expose a public
/// API to create an access point, set client limits, cap traffic, or run a
/// captive portal, so AirLink reports and guides the system feature instead of
/// pretending to control it.
pub async fn status() -> HotspotStatus {
    let sharing_active = Command::new("/usr/bin/pgrep")
        .args(["-x", "InternetSharing"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    let source_interface = Command::new("/sbin/route")
        .args(["-n", "get", "default"])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).to_string())
        .and_then(|text| {
            text.lines().find_map(|line| {
                line.trim()
                    .strip_prefix("interface:")
                    .map(|value| value.trim().to_string())
            })
        });

    let source_network = source_interface.as_deref().and_then(|interface| {
        let output = Command::new("/usr/sbin/networksetup")
            .args(["-getairportnetwork", interface])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        text.trim()
            .strip_prefix("Current Wi-Fi Network:")
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    });

    let bridge_present = Command::new("/sbin/ifconfig")
        .arg("bridge100")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    let (clients, client_list_available) =
        match tokio::fs::read_to_string("/var/db/dhcpd_leases").await {
            Ok(contents) => (parse_dhcp_leases(&contents), true),
            Err(_) => (Vec::new(), false),
        };

    let config = read_sharing_config();
    let nat_enabled = config.as_ref().is_some_and(|config| config.nat_enabled);
    let wifi_broadcast = config.as_ref().is_some_and(|config| config.wifi_broadcast);
    let hotspot_name = config.and_then(|config| config.hotspot_name);

    let note = if sharing_active && wifi_broadcast {
        format!(
            "Internet Sharing is broadcasting “{}” over Wi-Fi.",
            hotspot_name.as_deref().unwrap_or("the configured hotspot")
        )
    } else if sharing_active {
        "Internet Sharing is running, but Wi-Fi broadcasting is off. Enable “To computers using: Wi-Fi” in System Settings.".to_string()
    } else if nat_enabled {
        "Internet Sharing is configured but the sharing service is not running. Open System Settings to start it.".to_string()
    } else {
        "Internet Sharing is off. macOS requires System Settings (and an administrator) to create a hotspot; AirLink cannot enable it silently.".to_string()
    };

    HotspotStatus {
        sharing_active,
        bridge_present,
        source_interface,
        source_network,
        hotspot_name,
        wifi_broadcast,
        nat_enabled,
        clients,
        client_list_available,
        note,
    }
}

struct SharingConfig {
    nat_enabled: bool,
    wifi_broadcast: bool,
    hotspot_name: Option<String>,
}

fn read_sharing_config() -> Option<SharingConfig> {
    let value =
        plist::Value::from_file("/Library/Preferences/SystemConfiguration/com.apple.nat.plist")
            .ok()?;
    let dictionary = value.as_dictionary()?;
    let nat = dictionary.get("NAT")?.as_dictionary()?;
    let nat_enabled = nat
        .get("Enabled")
        .and_then(plist::Value::as_boolean)
        .unwrap_or(false);
    let airport = nat.get("AirPort").and_then(plist::Value::as_dictionary);
    let wifi_broadcast = airport
        .and_then(|airport| airport.get("Enabled"))
        .and_then(plist::Value::as_boolean)
        .unwrap_or(false);
    let hotspot_name = airport
        .and_then(|airport| airport.get("NetworkName"))
        .and_then(plist::Value::as_string)
        .map(str::to_string)
        .filter(|name| !name.is_empty());
    Some(SharingConfig {
        nat_enabled,
        wifi_broadcast,
        hotspot_name,
    })
}

/// Parse the root-owned dhcpd lease file when it is readable. The parser is
/// intentionally tolerant because the file format is not a public API.
pub fn parse_dhcp_leases(contents: &str) -> Vec<HotspotClient> {
    let mut clients = Vec::new();
    let mut name: Option<String> = None;
    let mut ip: Option<String> = None;
    let mut mac: Option<String> = None;

    for line in contents.lines() {
        let line = line.trim();
        if line == "{" {
            name = None;
            ip = None;
            mac = None;
        } else if line == "}" {
            if let (Some(ip_address), Some(mac_address)) = (ip.take(), mac.take()) {
                clients.push(HotspotClient {
                    name: name.take(),
                    ip_address,
                    mac_address,
                });
            }
            name = None;
            ip = None;
            mac = None;
        } else if let Some(value) = line.strip_prefix("name=") {
            name = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("ip_address=") {
            ip = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("hw_address=") {
            mac = Some(value.trim_start_matches("1,").to_string());
        }
    }

    clients
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_dhcp_lease_blocks() {
        let sample = "{\n name=laptop\n ip_address=192.168.2.2\n hw_address=1,aa:bb:cc:dd:ee:ff\n lease=0x1234\n}\n{\n ip_address=192.168.2.3\n hw_address=1,11:22:33:44:55:66\n}\n";
        let clients = parse_dhcp_leases(sample);
        assert_eq!(clients.len(), 2);
        assert_eq!(clients[0].name.as_deref(), Some("laptop"));
        assert_eq!(clients[0].ip_address, "192.168.2.2");
        assert_eq!(clients[0].mac_address, "aa:bb:cc:dd:ee:ff");
    }
}
