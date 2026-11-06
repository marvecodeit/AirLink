use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::app_state::{AppState, RefreshMode};
use crate::errors::{CommandError, CommandResult};
use crate::models::connection_status::NetworkStatus;
use crate::services::location_permission::{self, LocationAuthorization};

#[tauri::command]
pub fn get_location_authorization() -> LocationAuthorization {
    location_permission::authorization_status()
}

/// Ask macOS for Location access so CoreWLAN can reveal the SSID.
/// The system prompt only appears after an explicit user action.
#[tauri::command]
pub async fn request_location_authorization(
    app: AppHandle,
) -> CommandResult<LocationAuthorization> {
    let current = location_permission::authorization_status();
    if current != LocationAuthorization::NotDetermined {
        return Ok(current);
    }

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let status = location_permission::request_authorization();
        let _ = tx.send(status);
    })
    .map_err(|error| CommandError::new("location", error.to_string()))?;

    // Give the user a few seconds to answer the system prompt.
    let _ = tokio::time::timeout(Duration::from_secs(20), rx).await;

    let mut status = location_permission::authorization_status();
    for _ in 0..8 {
        if status != LocationAuthorization::NotDetermined {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
        status = location_permission::authorization_status();
    }

    if status == LocationAuthorization::Authorized {
        let state = app.state::<AppState>();
        let _ = state.refresh(&app, RefreshMode::Auto).await;
    }

    Ok(status)
}

#[tauri::command]
pub async fn open_location_settings(app: AppHandle) -> CommandResult<()> {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url(
                "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_LocationServices",
                None::<&str>,
            )
            .map_err(|error| CommandError::new("settings", error.to_string()))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err(CommandError::new(
            "unsupported",
            "Location Services are not required for Wi-Fi names on this platform.",
        ))
    }
}

#[tauri::command]
pub async fn open_network_settings(app: AppHandle) -> CommandResult<()> {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_opener::OpenerExt;
        // macOS 13+ Wi-Fi settings pane, with a fallback handled by the OS.
        app.opener()
            .open_url(
                "x-apple.systempreferences:com.apple.wifi-settings-extension",
                None::<&str>,
            )
            .map_err(|error| CommandError::new("settings", error.to_string()))
    }
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        use std::process::Command;
        for program in ["nm-connection-editor", "gnome-control-center"] {
            if Command::new(program).spawn().is_ok() {
                return Ok(());
            }
        }
        Err(CommandError::new(
            "settings",
            "No NetworkManager or GNOME network settings application was found.",
        ))
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = app;
        Err(CommandError::new(
            "unsupported",
            "Network settings are not supported on this platform.",
        ))
    }
}

#[tauri::command]
pub async fn diagnose_network(app: AppHandle) -> CommandResult<NetworkStatus> {
    let state = app.state::<AppState>();
    Ok(state.refresh(&app, RefreshMode::Force).await)
}
