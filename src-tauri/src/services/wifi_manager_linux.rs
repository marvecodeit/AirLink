use std::time::Duration;

use crate::models::connection_status::IpConfiguration;
use crate::models::wifi_network::WifiNetwork;

use crate::services::shell;

pub const WIFI_INTERFACE_FALLBACK: &str = "wlan0";

#[derive(Debug, Clone, Default)]
pub struct NetworkSnapshot {
    pub wifi: WifiNetwork,
    pub ip: IpConfiguration,
    pub warnings: Vec<String>,
}

#[derive(Debug, Default, Clone)]
pub struct WifiManager;

impl WifiManager {
    /// Gather Wi-Fi and IP data on Linux using NetworkManager and wireless
    /// extensions, with `/sys` and `ip` fallbacks. No root access is required.
    pub async fn snapshot(&self) -> NetworkSnapshot {
        let mut warnings = Vec::new();

        let route_output = shell::run("ip", &["route", "show", "default"], Duration::from_secs(2))
            .await
            .unwrap_or_default();
        let route = parse_default_route(&route_output);
        let interface = detect_wifi_interface()
            .or_else(|| route.as_ref().map(|route| route.interface.clone()))
            .unwrap_or_else(|| WIFI_INTERFACE_FALLBACK.to_string());

        let mut wifi = WifiNetwork {
            interface: Some(interface.clone()),
            ..WifiNetwork::default()
        };

        let nmcli = shell::run(
            "nmcli",
            &["-t", "-f", "DEVICE,TYPE,STATE", "device", "status"],
            Duration::from_secs(2),
        )
        .await;
        let nmcli_available = nmcli.is_ok();
        let details = shell::run(
            "nmcli",
            &[
                "-t",
                "-f",
                "ACTIVE,SSID,SIGNAL,SECURITY,CHAN",
                "dev",
                "wifi",
            ],
            Duration::from_secs(2),
        )
        .await
        .ok()
        .and_then(|text| parse_active_nmcli_wifi(&text));
        if let Some(line) = details {
            if let Some(ssid) = line.ssid.clone() {
                wifi.associated = true;
                wifi.ssid = Some(ssid);
            }

            if let Some(signal) = line.signal {
                wifi.rssi = Some(signal);
            }
            if let Some(security) = line.security.clone() {
                wifi.security = Some(security);
            }
            if let Some(channel) = line.channel {
                wifi.channel = Some(channel);
                wifi.band = Some(channel_band(channel).to_string());
            }
        } else {
            if let Ok(link) = shell::run(
                "iw",
                &["dev", interface.as_str(), "link"],
                Duration::from_secs(2),
            )
            .await
            {
                if let Some(parsed) = parse_iw_link(&link) {
                    wifi.ssid = parsed.ssid;
                    wifi.rssi = parsed.signal;
                    wifi.associated = wifi.ssid.is_some();
                }
            } else {
                warnings.push("Neither NetworkManager nor iw is available.".into());
            }
        }

        if let Ok(radio) = shell::run("nmcli", &["radio", "wifi"], Duration::from_secs(2)).await {
            wifi.powered = radio.to_ascii_lowercase().contains("enabled");
        } else {
            wifi.powered =
                std::fs::metadata(format!("/sys/class/net/{interface}/wireless")).is_ok();
        }

        if !nmcli_available && wifi.ssid.is_none() && !wifi.associated {
            // No NetworkManager does not mean no Wi-Fi; leave the link unknown
            // rather than claiming the radio is off.
            wifi.powered = true;
        }

        let mut ip = IpConfiguration {
            interface: Some(interface.clone()),
            gateway: route.as_ref().and_then(|route| route.gateway.clone()),
            dns: read_dns(),
            mac_address: std::fs::read_to_string(format!("/sys/class/net/{interface}/address"))
                .ok()
                .map(|value| value.trim().to_string()),
            ..IpConfiguration::default()
        };

        if let Ok(interfaces) = if_addrs::get_if_addrs() {
            for candidate in interfaces {
                if candidate.name != interface || candidate.addr.is_loopback() {
                    continue;
                }
                match candidate.addr {
                    if_addrs::IfAddr::V4(address) => {
                        if ip.ipv4.is_none() {
                            ip.ipv4 = Some(address.ip.to_string());
                            ip.subnet_mask = Some(address.netmask.to_string());
                        }
                    }
                    if_addrs::IfAddr::V6(address) => {
                        if !address.is_link_local() {
                            ip.ipv6.push(address.ip.to_string());
                        }
                    }
                }
            }
        }

        if let Some(channel) = wifi.channel {
            if wifi.band.is_none() {
                wifi.band = Some(channel_band(channel).to_string());
            }
        }

        if wifi.ssid.is_none() && ip.ipv4.is_some() {
            wifi.associated = true;
        }
        wifi.apply_signal();

        NetworkSnapshot { wifi, ip, warnings }
    }
}

#[derive(Debug, Default)]
struct NmcliWifiLine {
    ssid: Option<String>,
    signal: Option<i32>,
    security: Option<String>,
    channel: Option<u32>,
}

fn parse_active_nmcli_wifi(text: &str) -> Option<NmcliWifiLine> {
    for line in text.lines() {
        let fields = split_nmcli_fields(line);
        if fields.len() >= 5 && fields[0].eq_ignore_ascii_case("yes") {
            let ssid = fields[1].trim();
            let security = fields[3].trim();
            return Some(NmcliWifiLine {
                ssid: (!ssid.is_empty() && ssid != "--").then(|| ssid.to_string()),
                signal: fields[2].trim().parse::<i32>().ok(),
                security: (!security.is_empty() && security != "--").then(|| security.to_string()),
                channel: fields[4]
                    .split_whitespace()
                    .next()
                    .and_then(|value| value.parse::<u32>().ok()),
            });
        }
    }
    None
}

struct DefaultRoute {
    interface: String,
    gateway: Option<String>,
}

fn parse_default_route(output: &str) -> Option<DefaultRoute> {
    let line = output.lines().find(|line| line.contains("default"))?;
    let parts: Vec<&str> = line.split_whitespace().collect();
    let mut interface = None;
    let mut gateway = None;
    for window in parts.windows(2) {
        if window[0] == "dev" {
            interface = Some(window[1].to_string());
        } else if window[0] == "via" {
            gateway = Some(window[1].to_string());
        }
    }
    interface.map(|interface| DefaultRoute { interface, gateway })
}

struct IwLink {
    ssid: Option<String>,
    signal: Option<i32>,
}

fn parse_iw_link(output: &str) -> Option<IwLink> {
    let mut ssid = None;
    let mut signal = None;
    for line in output.lines() {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("SSID:") {
            ssid = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("signal:") {
            signal = value
                .split_whitespace()
                .next()
                .and_then(|value| value.parse::<i32>().ok());
        }
    }
    Some(IwLink { ssid, signal })
}

fn detect_wifi_interface() -> Option<String> {
    if let Ok(output) = std::process::Command::new("/usr/sbin/iw")
        .arg("dev")
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if let Some(name) = line.trim().strip_prefix("Interface ") {
                return Some(name.trim().to_string());
            }
        }
    }
    if let Ok(entries) = std::fs::read_dir("/sys/class/net") {
        for entry in entries.flatten() {
            if entry.path().join("wireless").is_dir() {
                return Some(entry.file_name().to_string_lossy().to_string());
            }
        }
    }
    None
}

fn read_dns() -> Vec<String> {
    std::fs::read_to_string("/etc/resolv.conf")
        .map(|contents| shell::parse_resolv_conf(&contents))
        .unwrap_or_default()
}

fn channel_band(channel: u32) -> &'static str {
    match channel {
        1..=14 => "2.4 GHz",
        32..=177 => "5 GHz",
        _ => "6 GHz",
    }
}

fn split_nmcli_fields(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut escaped = false;
    for character in line.chars() {
        if escaped {
            current.push(character);
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == ':' {
            fields.push(std::mem::take(&mut current));
        } else {
            current.push(character);
        }
    }
    fields.push(current);
    fields
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_default_route() {
        let route = parse_default_route("default via 192.168.1.1 dev wlp2s0 proto dhcp metric 600")
            .unwrap();
        assert_eq!(route.interface, "wlp2s0");
        assert_eq!(route.gateway.as_deref(), Some("192.168.1.1"));
    }

    #[test]
    fn parses_active_nmcli_wifi() {
        let line =
            parse_active_nmcli_wifi("yes:Campus\\:Net:82:WPA2:6\nno:Other:40:--:11\n").unwrap();
        assert_eq!(line.ssid.as_deref(), Some("Campus:Net"));
        assert_eq!(line.signal, Some(82));
        assert_eq!(line.security.as_deref(), Some("WPA2"));
        assert_eq!(line.channel, Some(6));
    }

    #[test]
    fn parses_iw_link() {
        let parsed = parse_iw_link(
            "Connected to aa:bb:cc:dd:ee:ff\n\tSSID: Campus Wi-Fi\n\tsignal: -47 dBm\n",
        )
        .unwrap();
        assert_eq!(parsed.ssid.as_deref(), Some("Campus Wi-Fi"));
        assert_eq!(parsed.signal, Some(-47));
    }

    #[test]
    fn splits_escaped_nmcli_fields() {
        assert_eq!(
            split_nmcli_fields("yes:Campus\\:Net:82:WPA2:6"),
            vec!["yes", "Campus:Net", "82", "WPA2", "6"]
        );
    }

    #[test]
    fn maps_channel_bands() {
        assert_eq!(channel_band(6), "2.4 GHz");
        assert_eq!(channel_band(44), "5 GHz");
        assert_eq!(channel_band(201), "6 GHz");
    }
}
