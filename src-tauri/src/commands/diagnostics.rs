/// Frontend diagnostics are logged locally so a blank or crashed UI leaves a
/// trace in the app log. Callers must never send credential values here.
#[tauri::command]
pub fn log_frontend_error(message: String) {
    let message = message.chars().take(2_000).collect::<String>();
    log::error!("frontend error: {message}");
}

#[tauri::command]
pub fn log_frontend_ready(route: String) {
    log::info!("frontend ready (route: {route})");
}
