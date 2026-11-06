use tauri::{AppHandle, Manager};

use crate::app_state::AppState;
use crate::errors::CommandResult;
use crate::services::super_dev::SuperDevStatus;

#[tauri::command]
pub fn get_super_dev_status(app: AppHandle) -> SuperDevStatus {
    app.state::<AppState>().super_dev.status()
}

#[tauri::command]
pub async fn set_super_dev(app: AppHandle, enabled: bool) -> CommandResult<SuperDevStatus> {
    let state = app.state::<AppState>();
    if enabled {
        state.super_dev.enable().map_err(Into::into)
    } else {
        Ok(state.super_dev.disable())
    }
}
