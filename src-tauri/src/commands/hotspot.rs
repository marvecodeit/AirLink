use tauri::AppHandle;

use crate::errors::{CommandError, CommandResult};
use crate::models::hotspot::HotspotStatus;
use crate::services::hotspot_manager;

#[tauri::command]
pub async fn get_hotspot_status() -> HotspotStatus {
    hotspot_manager::status().await
}

#[tauri::command]
pub async fn open_internet_sharing_settings(app: AppHandle) -> CommandResult<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(
            "x-apple.systempreferences:com.apple.Sharing-Settings.extension",
            None::<&str>,
        )
        .map_err(|error| CommandError::new("settings", error.to_string()))
}
