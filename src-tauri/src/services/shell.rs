use std::time::Duration;

use tokio::process::Command;

/// Run a fixed system command with an argument array (never a shell string)
/// and a hard timeout. Returns trimmed stdout on success.
pub async fn run(program: &str, args: &[&str], timeout: Duration) -> Result<String, String> {
    let mut command = Command::new(program);
    command.args(args).kill_on_drop(true).env("LC_ALL", "C");

    let output = tokio::time::timeout(timeout, command.output())
        .await
        .map_err(|_| format!("{program} timed out"))?
        .map_err(|error| format!("{program} could not run: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("{program} exited with {}", output.status)
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Parse `route -n get default` output for the active interface.
pub fn parse_default_route(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        line.trim()
            .strip_prefix("interface:")
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

/// Parse the gateway from `route -n get default` output.
pub fn parse_default_gateway(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        line.trim()
            .strip_prefix("gateway:")
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IfConfig {
    pub ipv4: Option<String>,
    pub subnet_mask: Option<String>,
    pub mac_address: Option<String>,
    pub ipv6: Vec<String>,
}

pub fn parse_ifconfig(output: &str) -> IfConfig {
    let mut config = IfConfig::default();
    for line in output.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("inet ") {
            let mut parts = rest.split_whitespace();
            if config.ipv4.is_none() {
                config.ipv4 = parts.next().map(str::to_string);
            }
            if let Some(mask) = rest
                .split_whitespace()
                .find(|part| part.starts_with("netmask"))
            {
                let _ = mask;
            }
            if let Some(index) = rest.split_whitespace().position(|part| part == "netmask") {
                config.subnet_mask = rest.split_whitespace().nth(index + 1).map(str::to_string);
            }
        } else if let Some(rest) = line.strip_prefix("inet6 ") {
            if let Some(address) = rest.split_whitespace().next()
                && !address.starts_with("fe80:")
                && address != "::1"
            {
                config.ipv6.push(address.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("ether ") {
            config.mac_address = rest.split_whitespace().next().map(str::to_string);
        }
    }
    config
}

/// Parse all nameservers from `scutil --dns`, preserving order and removing
/// duplicates.
pub fn parse_scutil_dns(output: &str) -> Vec<String> {
    let mut servers: Vec<String> = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if let Some((key, value)) = line.split_once(':')
            && key.starts_with("nameserver[")
        {
            let server = value.trim();
            if !server.is_empty() && !servers.iter().any(|item| item == server) {
                servers.push(server.to_string());
            }
        }
    }
    servers
}

pub fn parse_resolv_conf(output: &str) -> Vec<String> {
    let mut servers = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if let Some(server) = line.strip_prefix("nameserver") {
            let server = server.trim();
            if !server.is_empty() && !servers.iter().any(|item| item == server) {
                servers.push(server.to_string());
            }
        }
    }
    servers
}

pub fn parse_networksetup_ssid(output: &str) -> Option<String> {
    let output = output.trim();
    if let Some(ssid) = output.strip_prefix("Current Wi-Fi Network:") {
        let ssid = ssid.trim();
        if !ssid.is_empty() {
            return Some(ssid.to_string());
        }
    }
    None
}

pub fn parse_airport_power(output: &str) -> Option<bool> {
    let output = output.trim().to_ascii_lowercase();
    if output.ends_with("on") {
        Some(true)
    } else if output.ends_with("off") {
        Some(false)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_parser_extracts_interface_and_gateway() {
        let output = "   route to: default\ndestination: default\n       gateway: 192.168.0.1\n  interface: en0\n";
        assert_eq!(parse_default_route(output).as_deref(), Some("en0"));
        assert_eq!(
            parse_default_gateway(output).as_deref(),
            Some("192.168.0.1")
        );
    }

    #[test]
    fn ifconfig_parser_extracts_network_details() {
        let output = r#"en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	ether d6:a8:b0:65:b9:1c
	inet6 fe80::18d9:7c67:ab1c:21cb%en0 prefixlen 64 secured scopeid 0xb
	inet6 2001:db8::42 prefixlen 64 autoconf secured
	inet 192.168.0.200 netmask 0xffffff00 broadcast 192.168.0.255
"#;
        let parsed = parse_ifconfig(output);
        assert_eq!(parsed.ipv4.as_deref(), Some("192.168.0.200"));
        assert_eq!(parsed.subnet_mask.as_deref(), Some("0xffffff00"));
        assert_eq!(parsed.mac_address.as_deref(), Some("d6:a8:b0:65:b9:1c"));
        assert_eq!(parsed.ipv6, vec!["2001:db8::42"]);
    }

    #[test]
    fn dns_parser_deduplicates() {
        let output = "resolver #1\n  nameserver[0] : 192.168.0.1\n  nameserver[1] : 1.1.1.1\nresolver #2\n  nameserver[0] : 192.168.0.1\n";
        assert_eq!(parse_scutil_dns(output), vec!["192.168.0.1", "1.1.1.1"]);
    }

    #[test]
    fn networksetup_parser_handles_ssid_and_missing_network() {
        assert_eq!(
            parse_networksetup_ssid("Current Wi-Fi Network: CampusNet\n").as_deref(),
            Some("CampusNet")
        );
        assert!(
            parse_networksetup_ssid("You are not associated with an AirPort network.").is_none()
        );
    }

    #[test]
    fn airport_power_parser() {
        assert_eq!(parse_airport_power("AirPort Power (en0): On"), Some(true));
        assert_eq!(parse_airport_power("AirPort Power (en0): Off"), Some(false));
        assert_eq!(parse_airport_power("garbage"), None);
    }
}
