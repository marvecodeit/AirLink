use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::errors::AppError;
use crate::models::connection_status::{
    ConnectionState, ConnectivityClassification, ConnectivityReport, NetworkStatus,
};
use crate::models::portal::{BrowserState, PortalDetectionMethod, PortalInfo};
use crate::models::settings::Settings;
use crate::services::captive_portal_detector::{
    CaptivePortalDetector, now, portal_url_from_report,
};
use crate::services::credential_manager::CredentialManager;
use crate::services::notification_manager;
use crate::services::portal_support;
use crate::services::super_dev::SuperDevManager;
use crate::services::wifi_manager::WifiManager;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefreshMode {
    /// Reuse a recent probe unless the link changed or the report is stale.
    Auto,
    /// Always run a fresh single-attempt connectivity check.
    Force,
    /// Run a fresh, retrying verification suitable for confirming sign-in.
    Verify,
}

#[derive(Debug, Clone, Default)]
pub struct ConnectionMachine {
    pub last_link_key: Option<String>,
    pub known_ssid: Option<String>,
    pub had_internet: bool,
    pub authenticated_at: Option<String>,
    pub last_state: Option<ConnectionState>,
    pub last_portal_notified_for: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationResult {
    pub verified: bool,
    pub portal_online: bool,
    pub message: String,
    pub status: NetworkStatus,
}

pub struct AppState {
    pub settings: RwLock<Settings>,
    pub status: RwLock<NetworkStatus>,
    pub browser: RwLock<BrowserState>,
    pub machine: Mutex<ConnectionMachine>,
    pub settings_path: PathBuf,
    pub wifi: WifiManager,
    pub detector: CaptivePortalDetector,
    pub credentials: CredentialManager,
    pub refresh_lock: tokio::sync::Mutex<()>,
    pub last_browser_verify: Mutex<Option<Instant>>,
    pub browser_portal_host: RwLock<Option<String>>,
    pub browser_trusted_domains: RwLock<Vec<String>>,
    pub quitting: std::sync::atomic::AtomicBool,
    pub super_dev: SuperDevManager,
}

impl AppState {
    pub fn new(settings: Settings, settings_path: PathBuf) -> Self {
        let config_dir = settings_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        Self {
            settings: RwLock::new(settings),
            status: RwLock::new(NetworkStatus::default()),
            browser: RwLock::new(BrowserState::default()),
            machine: Mutex::new(ConnectionMachine::default()),
            settings_path,
            wifi: WifiManager,
            detector: CaptivePortalDetector,
            credentials: CredentialManager,
            refresh_lock: tokio::sync::Mutex::new(()),
            last_browser_verify: Mutex::new(None),
            browser_portal_host: RwLock::new(None),
            browser_trusted_domains: RwLock::new(Vec::new()),
            quitting: std::sync::atomic::AtomicBool::new(false),
            super_dev: SuperDevManager::new(&config_dir),
        }
    }

    pub fn settings_snapshot(&self) -> Settings {
        self.settings
            .read()
            .unwrap_or_else(|poison| poison.into_inner())
            .clone()
    }

    pub fn status_snapshot(&self) -> NetworkStatus {
        self.status
            .read()
            .unwrap_or_else(|poison| poison.into_inner())
            .clone()
    }

    pub fn browser_snapshot(&self) -> BrowserState {
        self.browser
            .read()
            .unwrap_or_else(|poison| poison.into_inner())
            .clone()
    }

    pub fn update_settings<F>(&self, update: F) -> Result<Settings, AppError>
    where
        F: FnOnce(&mut Settings),
    {
        let mut settings = self
            .settings
            .write()
            .unwrap_or_else(|poison| poison.into_inner());
        update(&mut settings);
        settings.sanitize();
        crate::services::settings_manager::save(&self.settings_path, &settings)?;
        Ok(settings.clone())
    }

    /// Re-read Wi-Fi state, optionally probing the network, then update the
    /// shared status and broadcast it to every window.
    pub async fn refresh(&self, app: &AppHandle, mode: RefreshMode) -> NetworkStatus {
        let _guard = self.refresh_lock.lock().await;

        let settings = self.settings_snapshot();
        let previous = self.status_snapshot();
        let snapshot = self.wifi.snapshot().await;

        let link_present = snapshot.wifi.powered
            && (snapshot.wifi.associated
                || snapshot.ip.ipv4.is_some()
                || snapshot.wifi.channel.is_some());
        let link_key = format!(
            "{}|{}|{}",
            snapshot.wifi.interface.as_deref().unwrap_or("none"),
            snapshot.wifi.ssid.as_deref().unwrap_or("hidden"),
            snapshot.wifi.bssid.as_deref().unwrap_or("")
        );

        let same_link = {
            let machine = self
                .machine
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            machine.last_link_key.as_deref() == Some(link_key.as_str())
        };

        let report_is_fresh = report_fresh(&previous, &settings);
        let needs_probe = link_present
            && match mode {
                RefreshMode::Force | RefreshMode::Verify => true,
                RefreshMode::Auto => {
                    previous.connectivity.classification == ConnectivityClassification::NotChecked
                        || !same_link
                        || !report_is_fresh
                }
            };

        // If automatic portal detection is off, still perform a single probe
        // when the link first appears, then only check on request or link change.
        let connectively_enabled = settings.auto_detect_portal
            || !same_link
            || previous.connectivity.classification == ConnectivityClassification::NotChecked;

        let report = if needs_probe && connectively_enabled {
            match mode {
                RefreshMode::Verify => self.detector.verify_internet(&settings).await,
                _ => self.detector.check(&settings).await,
            }
        } else if link_present {
            previous.connectivity.clone()
        } else {
            ConnectivityReport::default()
        };

        let mut machine = self
            .machine
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());

        // A new SSID begins a new authentication session.
        if snapshot.wifi.ssid.is_some() && snapshot.wifi.ssid != machine.known_ssid {
            machine.authenticated_at = None;
            machine.had_internet = false;
            machine.last_portal_notified_for = None;
            machine.known_ssid = snapshot.wifi.ssid.clone();
        }
        machine.last_link_key = Some(link_key);

        let mut portal = if link_present {
            build_portal_info(&settings, &snapshot.wifi.ssid, &report, &previous)
        } else {
            None
        };

        if report.internet_available {
            portal = None;
            machine.had_internet = true;
        }

        let (state, message) = derive_state(
            &snapshot.wifi,
            &snapshot.ip,
            &report,
            link_present,
            &machine,
            &portal,
            &snapshot.warnings,
        );

        if !link_present {
            machine.had_internet = false;
        }

        let authenticated_at = machine.authenticated_at.clone();
        machine.last_state = Some(state);
        drop(machine);

        let checked_at = if report.checked_at.is_empty() {
            now()
        } else {
            report.checked_at.clone()
        };

        let status = NetworkStatus {
            wifi: snapshot.wifi,
            ip: snapshot.ip,
            state,
            connectivity: report,
            portal,
            last_checked: Some(checked_at),
            authenticated_at,
            message,
        };

        {
            let mut current = self
                .status
                .write()
                .unwrap_or_else(|poison| poison.into_inner());
            *current = status.clone();
        }

        let _ = app.emit("wifi://status", &status);
        status
    }

    /// Verify system-wide internet access after a portal sign-in. This never
    /// trusts a browser cookie: it requires fresh HTTPS probes over the
    /// Mac's own network path.
    pub async fn verify_authentication(
        &self,
        app: &AppHandle,
        explicit: bool,
    ) -> Result<VerificationResult, AppError> {
        let before = self.status_snapshot();
        let status = self.refresh(app, RefreshMode::Verify).await;

        if !status.connectivity.internet_available {
            return Ok(VerificationResult {
                verified: false,
                portal_online: false,
                message: status.connectivity.detail.clone(),
                status,
            });
        }

        // Only update system portal state after verification succeeds.
        let interface = status.wifi.interface.clone();
        let portal_online = match portal_support::mark_portal_online(interface.as_deref()) {
            Ok(()) => true,
            Err(error) => {
                log::debug!("CNMarkPortalOnline was not applied: {error}");
                false
            }
        };

        let succeeded_after_portal = matches!(
            before.state,
            ConnectionState::PortalDetected
                | ConnectionState::AuthenticationRequired
                | ConnectionState::SessionExpired
                | ConnectionState::Authenticating
        );

        let mut machine = self
            .machine
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        machine.authenticated_at = Some(now());
        machine.had_internet = true;
        drop(machine);

        let mut verified = status;
        verified.state = ConnectionState::Authenticated;
        verified.authenticated_at = Some(now());
        verified.message = Some(if portal_online {
            "Internet access verified successfully. The portal is online.".into()
        } else {
            "Internet access verified successfully.".into()
        });

        {
            let mut current = self
                .status
                .write()
                .unwrap_or_else(|poison| poison.into_inner());
            *current = verified.clone();
        }
        let _ = app.emit("wifi://status", &verified);

        if self.settings_snapshot().notifications && (explicit || succeeded_after_portal) {
            notification_manager::notify(
                app,
                "Sign-in verified",
                "Your Mac now has verified internet access.",
            );
        }

        Ok(VerificationResult {
            verified: true,
            portal_online,
            message: verified
                .message
                .clone()
                .unwrap_or_else(|| "Internet access verified.".into()),
            status: verified,
        })
    }

    /// Called after the embedded browser finishes a page load. A debounced,
    /// low-cost probe detects successful sign-ins without trusting the page.
    pub async fn auto_verify_after_browser_navigation(&self, app: AppHandle) {
        {
            let mut last = self
                .last_browser_verify
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            if let Some(instant) = *last
                && instant.elapsed() < Duration::from_secs(8)
            {
                return;
            }
            *last = Some(Instant::now());
        }

        let before = self.status_snapshot();
        if before.connectivity.internet_available {
            return;
        }

        tokio::time::sleep(Duration::from_millis(1_500)).await;
        let _ = self.verify_authentication(&app, false).await;
    }
}

fn report_fresh(status: &NetworkStatus, settings: &Settings) -> bool {
    let checked_at = if status.connectivity.checked_at.is_empty() {
        return false;
    } else {
        status.connectivity.checked_at.as_str()
    };
    let Ok(parsed) = DateTime::parse_from_rfc3339(checked_at) else {
        return false;
    };
    let age = Utc::now().signed_duration_since(parsed.with_timezone(&Utc));
    age.num_seconds() >= 0 && age.num_seconds() < settings.portal_check_interval_secs as i64
}

fn build_portal_info(
    settings: &Settings,
    ssid: &Option<String>,
    report: &ConnectivityReport,
    previous: &NetworkStatus,
) -> Option<PortalInfo> {
    if !report.portal_suspected {
        return None;
    }

    let from_report = portal_url_from_report(report);
    let profile = ssid.as_ref().and_then(|ssid| {
        settings
            .trusted_profiles
            .iter()
            .find(|profile| &profile.ssid == ssid)
    });

    let (url, method) = if let Some(url) = from_report {
        let method = report
            .probes
            .iter()
            .find(|probe| probe.location.as_deref() == Some(url.as_str()))
            .map(|probe| {
                if probe
                    .status
                    .map(|status| (300..400).contains(&status))
                    .unwrap_or(false)
                {
                    PortalDetectionMethod::Redirect
                } else {
                    PortalDetectionMethod::PortalContent
                }
            })
            .unwrap_or(PortalDetectionMethod::PortalContent);
        (url, method)
    } else if previous
        .portal
        .as_ref()
        .is_some_and(|_| previous.wifi.ssid == *ssid)
    {
        let existing = previous.portal.as_ref().unwrap();
        (existing.url.clone(), existing.detection_method)
    } else {
        let url = profile.and_then(|profile| profile.portal_url.clone())?;
        (url, PortalDetectionMethod::KnownProfile)
    };

    let host = url::Url::parse(&url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .unwrap_or_default();

    let trusted = profile
        .map(|profile| portal_matches_profile(&url, &host, profile))
        .unwrap_or(false);

    Some(PortalInfo {
        url,
        host,
        detection_method: method,
        detected_at: now(),
        trusted,
        profile_name: profile.map(|profile| profile.ssid.clone()),
    })
}

fn portal_matches_profile(
    url: &str,
    host: &str,
    profile: &crate::models::settings::NetworkProfile,
) -> bool {
    let portal_host = profile
        .portal_url
        .as_deref()
        .and_then(|value| url::Url::parse(value).ok())
        .and_then(|parsed| parsed.host_str().map(str::to_string));
    portal_host.as_deref() == Some(host)
        || profile
            .trusted_domains
            .iter()
            .any(|domain| host == domain || host.ends_with(&format!(".{domain}")))
        || url == profile.portal_url.as_deref().unwrap_or_default()
}

fn derive_state(
    wifi: &crate::models::wifi_network::WifiNetwork,
    ip: &crate::models::connection_status::IpConfiguration,
    report: &ConnectivityReport,
    link_present: bool,
    machine: &ConnectionMachine,
    portal: &Option<PortalInfo>,
    warnings: &[String],
) -> (ConnectionState, Option<String>) {
    if !wifi.powered {
        return (
            ConnectionState::Disconnected,
            Some("Wi-Fi is turned off. Enable it in Control Center.".into()),
        );
    }
    if !link_present {
        return (
            ConnectionState::Disconnected,
            Some("Not connected to a Wi-Fi network.".into()),
        );
    }
    if ip.ipv4.is_none() {
        return (
            ConnectionState::Connecting,
            Some("Connected to Wi-Fi. Waiting for an IP address…".into()),
        );
    }

    if wifi.ssid_restricted {
        // Do not substitute the state: internet may still be verified. The UI
        // shows a dedicated permission hint, so no warning is needed here.
    }

    match report.classification {
        ConnectivityClassification::NotChecked => (
            ConnectionState::Connecting,
            Some("Wi-Fi is connected. Checking internet access…".into()),
        ),
        ConnectivityClassification::Internet => {
            if machine.authenticated_at.is_some() {
                (
                    ConnectionState::Authenticated,
                    Some("Internet access is verified on this network.".into()),
                )
            } else {
                (
                    ConnectionState::InternetAvailable,
                    Some("Internet access is available.".into()),
                )
            }
        }
        ConnectivityClassification::CaptivePortal => {
            if machine.had_internet {
                (
                    ConnectionState::SessionExpired,
                    Some("Your Wi-Fi session appears to have expired. Sign in again.".into()),
                )
            } else if portal.is_some() {
                (
                    ConnectionState::PortalDetected,
                    Some("A sign-in portal was detected. Sign in to get internet access.".into()),
                )
            } else {
                (
                    ConnectionState::AuthenticationRequired,
                    Some("Authentication is required to use this network.".into()),
                )
            }
        }
        ConnectivityClassification::DnsFailure => (
            ConnectionState::ConnectionError,
            Some(
                "DNS lookups are failing. Try reconnecting to Wi-Fi or check the network's DNS."
                    .into(),
            ),
        ),
        ConnectivityClassification::NetworkError => (
            ConnectionState::ConnectionError,
            Some("The network could not be reached. Check your Wi-Fi connection.".into()),
        ),
        ConnectivityClassification::NoInternet => {
            if machine.had_internet {
                (
                    ConnectionState::SessionExpired,
                    Some("Internet access was lost. Your session may have expired.".into()),
                )
            } else {
                (
                    ConnectionState::AuthenticationRequired,
                    Some(warnings.first().cloned().unwrap_or_else(|| {
                        "No internet access is available on this network.".into()
                    })),
                )
            }
        }
    }
}
