use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotspotClient {
    pub name: Option<String>,
    pub ip_address: String,
    pub mac_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HotspotStatus {
    pub sharing_active: bool,
    pub bridge_present: bool,
    pub source_interface: Option<String>,
    pub source_network: Option<String>,
    pub hotspot_name: Option<String>,
    pub wifi_broadcast: bool,
    pub nat_enabled: bool,
    pub clients: Vec<HotspotClient>,
    pub client_list_available: bool,
    pub note: String,
}
