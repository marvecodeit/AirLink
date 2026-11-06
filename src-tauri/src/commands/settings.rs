use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

use crate::app_state::AppState;
use crate::errors::{AppError, CommandError, CommandResult};
use crate::models::settings::Settings;
use crate::services::notification_manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub developer: String,
    pub brand: String,
    pub tagline: String,
    pub copyright: String,
    pub platform: String,
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    app.state::<AppState>().settings_snapshot()
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: Settings) -> CommandResult<Settings> {
    let state = app.state::<AppState>();
    let previous = state.settings_snapshot();

    // Apply login item changes before persisting so a failure is visible.
    if settings.launch_at_login != previous.launch_at_login {
        let result = if settings.launch_at_login {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        };
        if let Err(error) = result {
            log::warn!("launch at login could not be changed: {error}");
            return Err(CommandError::new(
                "autostart",
                "macOS could not update the login item. AirLink may need to be run from your Applications folder.",
            ));
        }
    }

    let saved = state.update_settings(|current| {
        *current = settings.clone();
    })?;

    if let Some(tray) = app.tray_by_id("airlink-tray") {
        let _ = tray.set_visible(saved.keep_in_menu_bar);
    }

    Ok(saved)
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    let package = app.package_info();
    let name = app
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| package.name.clone());
    AppInfo {
        name,
        version: package.version.to_string(),
        identifier: app.config().identifier.clone(),
        developer: "marvecodeit".into(),
        brand: "marvecodeit".into(),
        tagline: "Campus Wi-Fi, without the guesswork.".into(),
        copyright: "© 2026 marvecodeit".into(),
        platform: std::env::consts::OS.into(),
    }
}

#[tauri::command]
pub fn send_test_notification(app: AppHandle) -> CommandResult<()> {
    if !app.state::<AppState>().settings_snapshot().notifications {
        return Err(CommandError::new(
            "notifications_off",
            "Turn on notifications first.",
        ));
    }
    notification_manager::test_notification(&app).map_err(|error| {
        CommandError::new(
            "notification",
            format!("macOS could not display a notification: {error}"),
        )
    })
}

#[tauri::command]
pub fn open_config_folder(app: AppHandle) -> CommandResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let state = app.state::<AppState>();
    let folder = state
        .settings_path
        .parent()
        .ok_or_else(|| AppError::Settings("No configuration folder.".into()))?;
    app.opener()
        .open_path(folder.to_string_lossy(), None::<&str>)
        .map_err(|error| CommandError::new("opener", error.to_string()))
}
