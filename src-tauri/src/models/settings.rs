use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeEndpoint {
    pub id: String,
    pub name: String,
    pub url: String,
    pub expected_status: Option<u16>,
    pub expected_body_contains: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProfile {
    pub id: String,
    pub ssid: String,
    pub portal_url: Option<String>,
    pub trusted_domains: Vec<String>,
    pub auto_open: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLink {
    pub id: String,
    pub name: String,
    pub url: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedCredentialSummary {
    /// Stable identifier: `<ssid>::<username>`.
    pub id: String,
    pub ssid: String,
    pub username: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub theme: ThemeMode,
    pub launch_at_login: bool,
    pub keep_in_menu_bar: bool,
    pub auto_detect_portal: bool,
    pub auto_verify: bool,
    pub notifications: bool,
    /// How often the Wi-Fi link is sampled, in seconds.
    pub poll_interval_secs: u64,
    /// How often connectivity is probed while on Wi-Fi, in seconds.
    pub portal_check_interval_secs: u64,
    pub probe_timeout_secs: u64,
    pub http_probes: Vec<ProbeEndpoint>,
    pub https_probes: Vec<ProbeEndpoint>,
    pub trusted_profiles: Vec<NetworkProfile>,
    #[serde(default)]
    pub server_links: Vec<ServerLink>,
    pub remembered_usernames: HashMap<String, String>,
    pub saved_credentials: Vec<SavedCredentialSummary>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            theme: ThemeMode::System,
            launch_at_login: false,
            keep_in_menu_bar: true,
            auto_detect_portal: true,
            auto_verify: true,
            notifications: true,
            poll_interval_secs: 8,
            portal_check_interval_secs: 25,
            probe_timeout_secs: 6,
            http_probes: vec![
                ProbeEndpoint {
                    id: "apple-http".into(),
                    name: "Apple Captive Network".into(),
                    url: "http://captive.apple.com/hotspot-detect.html".into(),
                    expected_status: Some(200),
                    expected_body_contains: Some("Success".into()),
                },
                ProbeEndpoint {
                    id: "google-http".into(),
                    name: "Google connectivity check".into(),
                    url: "http://connectivitycheck.gstatic.com/generate_204".into(),
                    expected_status: Some(204),
                    expected_body_contains: None,
                },
                ProbeEndpoint {
                    id: "firefox-http".into(),
                    name: "Mozilla detect portal".into(),
                    url: "http://detectportal.firefox.com/success.txt".into(),
                    expected_status: Some(200),
                    expected_body_contains: Some("success".into()),
                },
            ],
            https_probes: vec![
                ProbeEndpoint {
                    id: "apple-https".into(),
                    name: "Apple HTTPS".into(),
                    url: "https://www.apple.com/library/test/success.html".into(),
                    expected_status: Some(200),
                    expected_body_contains: Some("Success".into()),
                },
                ProbeEndpoint {
                    id: "google-https".into(),
                    name: "Google HTTPS".into(),
                    url: "https://connectivitycheck.gstatic.com/generate_204".into(),
                    expected_status: Some(204),
                    expected_body_contains: None,
                },
            ],
            trusted_profiles: Vec::new(),
            server_links: Vec::new(),
            remembered_usernames: HashMap::new(),
            saved_credentials: Vec::new(),
        }
    }
}

impl Settings {
    /// Clamp values to safe ranges and remove malformed entries so a corrupt
    /// or hand-edited settings file cannot make the monitor aggressive.
    pub fn sanitize(&mut self) {
        self.version = 1;
        self.poll_interval_secs = self.poll_interval_secs.clamp(5, 120);
        self.portal_check_interval_secs = self.portal_check_interval_secs.clamp(10, 300);
        self.probe_timeout_secs = self.probe_timeout_secs.clamp(2, 20);
        self.http_probes
            .retain(|probe| valid_probe_url(&probe.url, "http"));
        self.https_probes
            .retain(|probe| valid_probe_url(&probe.url, "https"));
        if self.http_probes.is_empty() {
            self.http_probes = Settings::default().http_probes;
        }
        if self.https_probes.is_empty() {
            self.https_probes = Settings::default().https_probes;
        }
        self.http_probes.truncate(8);
        self.https_probes.truncate(8);

        for profile in &mut self.trusted_profiles {
            profile.ssid = profile.ssid.trim().to_string();
            profile.trusted_domains = profile
                .trusted_domains
                .iter()
                .map(|domain| domain.trim().to_lowercase())
                .filter(|domain| !domain.is_empty() && !domain.contains('/'))
                .collect();
            if let Some(portal_url) = &profile.portal_url
                && !is_http_url(portal_url)
            {
                profile.portal_url = None;
            }
        }
        self.trusted_profiles
            .retain(|profile| !profile.ssid.is_empty());
        self.trusted_profiles.dedup_by(|a, b| a.ssid == b.ssid);

        for link in &mut self.server_links {
            link.name = link.name.trim().to_string();
            link.url = link.url.trim().to_string();
        }
        self.server_links
            .retain(|link| is_http_url(&link.url) && !link.name.is_empty());
        self.server_links.dedup_by(|a, b| a.url == b.url);
        self.server_links.truncate(50);
    }
}

fn valid_probe_url(url: &str, scheme: &str) -> bool {
    match url::Url::parse(url) {
        Ok(parsed) => parsed.scheme() == scheme && parsed.host_str().is_some(),
        Err(_) => false,
    }
}

pub fn is_http_url(url: &str) -> bool {
    match url::Url::parse(url) {
        Ok(parsed) => matches!(parsed.scheme(), "http" | "https") && parsed.host_str().is_some(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_within_safe_ranges() {
        let mut settings = Settings {
            poll_interval_secs: 0,
            portal_check_interval_secs: 9999,
            probe_timeout_secs: 500,
            ..Settings::default()
        };
        settings.sanitize();
        assert_eq!(settings.poll_interval_secs, 5);
        assert_eq!(settings.portal_check_interval_secs, 300);
        assert_eq!(settings.probe_timeout_secs, 20);
    }

    #[test]
    fn malformed_probes_are_discarded() {
        let mut settings = Settings {
            http_probes: vec![ProbeEndpoint {
                id: "bad".into(),
                name: "Bad".into(),
                url: "file:///etc/passwd".into(),
                expected_status: Some(200),
                expected_body_contains: None,
            }],
            https_probes: Vec::new(),
            ..Settings::default()
        };
        settings.sanitize();
        assert_eq!(settings.http_probes.len(), 3);
        assert_eq!(settings.https_probes.len(), 2);
    }

    #[test]
    fn server_links_are_validated() {
        let mut settings = Settings {
            server_links: vec![
                ServerLink {
                    id: "one".into(),
                    name: "Admin".into(),
                    url: "http://192.168.0.5:8080".into(),
                    created_at: "now".into(),
                },
                ServerLink {
                    id: "bad".into(),
                    name: "Bad".into(),
                    url: "javascript:alert(1)".into(),
                    created_at: "now".into(),
                },
                ServerLink {
                    id: "dupe".into(),
                    name: "Duplicate".into(),
                    url: "http://192.168.0.5:8080".into(),
                    created_at: "now".into(),
                },
            ],
            ..Settings::default()
        };
        settings.sanitize();
        assert_eq!(settings.server_links.len(), 1);
        assert_eq!(settings.server_links[0].name, "Admin");
    }

    #[test]
    fn trusted_domain_cleanup() {
        let mut settings = Settings::default();
        settings.trusted_profiles.push(NetworkProfile {
            id: "p1".into(),
            ssid: " Campus ".into(),
            portal_url: Some("not a url".into()),
            trusted_domains: vec![" Login.Example.EDU ".into(), "https://bad".into()],
            auto_open: true,
            created_at: "now".into(),
        });
        settings.sanitize();
        assert_eq!(settings.trusted_profiles[0].ssid, "Campus");
        assert_eq!(
            settings.trusted_profiles[0].trusted_domains,
            vec!["login.example.edu"]
        );
        assert!(settings.trusted_profiles[0].portal_url.is_none());
    }
}
