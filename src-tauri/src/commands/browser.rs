use tauri::{AppHandle, Manager};

use crate::errors::CommandResult;
use crate::models::portal::{BrowserBounds, BrowserState};
use crate::services::browser_manager;

#[tauri::command]
pub async fn open_portal_browser(
    app: AppHandle,
    url: Option<String>,
    bounds: BrowserBounds,
) -> CommandResult<BrowserState> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    browser_manager::open(&app, url, bounds).map_err(Into::into)
}

#[tauri::command]
pub fn set_browser_bounds(app: AppHandle, bounds: BrowserBounds) -> CommandResult<()> {
    browser_manager::set_bounds(&app, bounds).map_err(Into::into)
}

#[tauri::command]
pub fn show_portal_browser(app: AppHandle) -> CommandResult<()> {
    browser_manager::show(&app).map_err(Into::into)
}

#[tauri::command]
pub fn hide_portal_browser(app: AppHandle) -> CommandResult<()> {
    browser_manager::hide(&app).map_err(Into::into)
}

#[tauri::command]
pub fn close_portal_browser(app: AppHandle) -> CommandResult<()> {
    browser_manager::close(&app).map_err(Into::into)
}

#[tauri::command]
pub fn browser_back(app: AppHandle) -> CommandResult<()> {
    browser_manager::back(&app).map_err(Into::into)
}

#[tauri::command]
pub fn browser_forward(app: AppHandle) -> CommandResult<()> {
    browser_manager::forward(&app).map_err(Into::into)
}

#[tauri::command]
pub fn browser_reload(app: AppHandle) -> CommandResult<()> {
    browser_manager::reload(&app).map_err(Into::into)
}

#[tauri::command]
pub fn browser_stop(app: AppHandle) -> CommandResult<()> {
    browser_manager::stop(&app).map_err(Into::into)
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, url: String) -> CommandResult<()> {
    browser_manager::navigate(&app, &url).map_err(Into::into)
}

#[tauri::command]
pub fn get_browser_state(app: AppHandle) -> BrowserState {
    use tauri::Manager;
    app.state::<crate::app_state::AppState>().browser_snapshot()
}

#[tauri::command]
pub fn open_browser_devtools(app: AppHandle) -> CommandResult<()> {
    browser_manager::open_devtools(&app).map_err(Into::into)
}

#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String) -> CommandResult<()> {
    browser_manager::open_external(&app, &url).map_err(Into::into)
}

#[tauri::command]
pub async fn sync_browser_state(app: AppHandle) -> CommandResult<BrowserState> {
    browser_manager::sync_native_state(&app).await;
    Ok(app.state::<crate::app_state::AppState>().browser_snapshot())
}
