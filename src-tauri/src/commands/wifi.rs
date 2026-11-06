use tauri::{AppHandle, Manager};

use crate::app_state::{AppState, RefreshMode};
use crate::errors::CommandResult;
use crate::models::connection_status::NetworkStatus;

#[tauri::command]
pub async fn get_network_status(app: AppHandle) -> CommandResult<NetworkStatus> {
    let current = app.state::<AppState>().status_snapshot();
    if current.last_checked.is_none() {
        Ok(app
            .state::<AppState>()
            .refresh(&app, RefreshMode::Auto)
            .await)
    } else {
        Ok(current)
    }
}

#[tauri::command]
pub async fn refresh_network_status(app: AppHandle) -> CommandResult<NetworkStatus> {
    let state = app.state::<AppState>();
    Ok(state.refresh(&app, RefreshMode::Auto).await)
}

#[tauri::command]
pub async fn check_connection(app: AppHandle) -> CommandResult<NetworkStatus> {
    let state = app.state::<AppState>();
    Ok(state.refresh(&app, RefreshMode::Force).await)
}
