use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use zeroize::Zeroize;

use crate::app_state::AppState;
use crate::errors::{AppError, CommandError, CommandResult};
use crate::models::settings::SavedCredentialSummary;
use crate::services::captive_portal_detector::now;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCredentialRequest {
    pub ssid: String,
    pub username: String,
    pub password: String,
    pub remember_password: bool,
    pub remember_username: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialList {
    pub saved: Vec<SavedCredentialSummary>,
    pub remembered_usernames: HashMap<String, String>,
}

#[tauri::command]
pub fn list_credentials(app: AppHandle) -> CredentialList {
    let settings = app.state::<AppState>().settings_snapshot();
    CredentialList {
        saved: settings.saved_credentials,
        remembered_usernames: settings.remembered_usernames,
    }
}

/// Save a portal credential after explicit consent. The password goes directly
/// to the macOS Keychain; it is never returned to the frontend or logged.
#[tauri::command]
pub fn save_credential(
    app: AppHandle,
    request: SaveCredentialRequest,
) -> CommandResult<crate::models::settings::Settings> {
    let state = app.state::<AppState>();
    let ssid = request.ssid.trim().to_string();
    let username = request.username.trim().to_string();

    if ssid.is_empty() || username.is_empty() {
        return Err(CommandError::new(
            "invalid_input",
            "A network name and username are required.",
        ));
    }
    if request.remember_password && request.password.is_empty() {
        return Err(CommandError::new(
            "invalid_input",
            "Enter a password before saving it.",
        ));
    }

    if request.remember_password {
        state
            .credentials
            .save(&ssid, &username, &request.password)
            .map_err(CommandError::from)?;
    }

    let id = format!("{ssid}::{}", username.to_lowercase());
    let updated = state
        .update_settings(|settings| {
            if request.remember_username {
                settings
                    .remembered_usernames
                    .insert(ssid.clone(), username.clone());
            } else {
                settings.remembered_usernames.remove(&ssid);
            }

            if request.remember_password {
                settings.saved_credentials.retain(|item| item.id != id);
                settings.saved_credentials.push(SavedCredentialSummary {
                    id: id.clone(),
                    ssid: ssid.clone(),
                    username: username.clone(),
                    updated_at: now(),
                });
            }
        })
        .map_err(CommandError::from)?;

    Ok(updated)
}

#[tauri::command]
pub fn remove_credential(
    app: AppHandle,
    ssid: String,
    username: String,
) -> CommandResult<crate::models::settings::Settings> {
    let state = app.state::<AppState>();
    let ssid = ssid.trim().to_string();
    let username = username.trim().to_string();
    let id = format!("{ssid}::{}", username.to_lowercase());

    state
        .credentials
        .delete(&ssid, &username)
        .map_err(CommandError::from)?;

    let updated = state
        .update_settings(|settings| {
            settings.saved_credentials.retain(|item| item.id != id);
            if settings
                .remembered_usernames
                .get(&ssid)
                .is_some_and(|value| value == &username)
            {
                settings.remembered_usernames.remove(&ssid);
            }
        })
        .map_err(CommandError::from)?;

    Ok(updated)
}

/// Copies a saved value to the clipboard on an explicit user action. Passwords
/// are never sent back over IPC. The clipboard is cleared after 60 seconds if
/// it still contains the copied password.
#[tauri::command]
pub async fn copy_credential(
    app: AppHandle,
    ssid: String,
    username: String,
    field: String,
) -> CommandResult<String> {
    let state = app.state::<AppState>();

    if field == "username" {
        app.clipboard()
            .write_text(username)
            .map_err(|error| CommandError::new("clipboard", error.to_string()))?;
        return Ok("Username copied to the clipboard.".into());
    }

    if field != "password" {
        return Err(CommandError::new(
            "invalid_input",
            "Unknown credential field.",
        ));
    }

    let mut password = state
        .credentials
        .load_password(&ssid, &username)
        .map_err(CommandError::from)?;

    app.clipboard()
        .write_text(password.as_str())
        .map_err(|error| {
            password.zeroize();
            CommandError::new("clipboard", error.to_string())
        })?;

    let app_for_clear = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(60)).await;
        if let Ok(current) = app_for_clear.clipboard().read_text()
            && current == password
        {
            let _ = app_for_clear.clipboard().write_text("");
        }
        password.zeroize();
    });

    Ok("Password copied. It will be cleared from the clipboard in 60 seconds.".into())
}

#[tauri::command]
pub fn has_saved_password(app: AppHandle, ssid: String, username: String) -> bool {
    app.state::<AppState>().credentials.exists(&ssid, &username)
}

#[allow(dead_code)]
fn invalid(message: impl Into<String>) -> AppError {
    AppError::InvalidInput(message.into())
}
