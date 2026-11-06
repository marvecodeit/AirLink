use tauri::{AppHandle, Manager};

use crate::app_state::{AppState, RefreshMode, VerificationResult};
use crate::errors::CommandResult;
use crate::models::connection_status::NetworkStatus;
use crate::models::portal::PortalInfo;

#[tauri::command]
pub async fn detect_captive_portal(app: AppHandle) -> CommandResult<NetworkStatus> {
    let state = app.state::<AppState>();
    Ok(state.refresh(&app, RefreshMode::Force).await)
}

#[tauri::command]
pub fn get_portal_info(app: AppHandle) -> Option<PortalInfo> {
    app.state::<AppState>().status_snapshot().portal
}

/// Confirms authentication using fresh HTTPS probes over the Mac's own
/// network path. A successful portal form submission is not sufficient.
#[tauri::command]
pub async fn verify_authentication(app: AppHandle) -> CommandResult<VerificationResult> {
    let state = app.state::<AppState>();
    state
        .verify_authentication(&app, true)
        .await
        .map_err(Into::into)
}
