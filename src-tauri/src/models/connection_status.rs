use serde::{Deserialize, Serialize};

use super::portal::PortalInfo;
use super::wifi_network::WifiNetwork;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    AuthenticationRequired,
    PortalDetected,
    Authenticating,
    Authenticated,
    InternetAvailable,
    SessionExpired,
    ConnectionError,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpConfiguration {
    pub ipv4: Option<String>,
    pub subnet_mask: Option<String>,
    pub gateway: Option<String>,
    pub dns: Vec<String>,
    pub interface: Option<String>,
    pub mac_address: Option<String>,
    pub ipv6: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectivityClassification {
    Internet,
    CaptivePortal,
    NoInternet,
    DnsFailure,
    NetworkError,
    NotChecked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProbeOutcome {
    Internet,
    Redirect,
    PortalContent,
    HttpError,
    UnexpectedResponse,
    Timeout,
    DnsFailure,
    ConnectionFailure,
    TlsError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub url: String,
    pub protocol: String,
    pub outcome: ProbeOutcome,
    pub status: Option<u16>,
    pub latency_ms: u64,
    pub location: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivityReport {
    pub classification: ConnectivityClassification,
    pub internet_available: bool,
    pub http_ok: bool,
    pub https_ok: bool,
    pub dns_ok: bool,
    pub portal_suspected: bool,
    pub latency_ms: Option<u64>,
    pub checked_at: String,
    pub probes: Vec<ProbeResult>,
    pub detail: String,
}

impl Default for ConnectivityReport {
    fn default() -> Self {
        Self {
            classification: ConnectivityClassification::NotChecked,
            internet_available: false,
            http_ok: false,
            https_ok: false,
            dns_ok: true,
            portal_suspected: false,
            latency_ms: None,
            checked_at: String::new(),
            probes: Vec::new(),
            detail: "Connection has not been checked yet.".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStatus {
    pub wifi: WifiNetwork,
    pub ip: IpConfiguration,
    pub state: ConnectionState,
    pub connectivity: ConnectivityReport,
    pub portal: Option<PortalInfo>,
    pub last_checked: Option<String>,
    pub authenticated_at: Option<String>,
    pub message: Option<String>,
}

impl Default for NetworkStatus {
    fn default() -> Self {
        Self {
            wifi: WifiNetwork::default(),
            ip: IpConfiguration::default(),
            state: ConnectionState::Disconnected,
            connectivity: ConnectivityReport::default(),
            portal: None,
            last_checked: None,
            authenticated_at: None,
            message: None,
        }
    }
}
