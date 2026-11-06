use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

/// Posts native macOS notifications. Notifications are best-effort: a missing
/// permission or an unsigned development build must never break monitoring.
pub fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(error) = app.notification().builder().title(title).body(body).show() {
        log::debug!("notification could not be shown: {error}");
    }
}

pub fn test_notification(app: &AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("AirLink notifications are on")
        .body("You'll be notified when a captive portal needs your attention.")
        .show()
        .map_err(|error| error.to_string())
}
