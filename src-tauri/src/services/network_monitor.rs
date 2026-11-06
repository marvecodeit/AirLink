use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter, Manager};

use crate::app_state::{AppState, RefreshMode};
use crate::models::connection_status::{ConnectionState, NetworkStatus};
use crate::services::notification_manager;
use crate::tray;

/// Background monitor. Samples the cheap Wi-Fi link regularly and probes
/// connectivity at a conservative interval (30 s by default). Link changes
/// trigger an immediate check; sessions are never polled more aggressively
/// than the user-configured minimum.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        let mut previous = app.state::<AppState>().status_snapshot();

        loop {
            let status = app
                .state::<AppState>()
                .refresh(&app, RefreshMode::Auto)
                .await;

            notify_on_transition(&app, &previous, &status);
            tray::update(&app, &status);
            previous = status;

            let interval = app
                .state::<AppState>()
                .settings_snapshot()
                .poll_interval_secs
                .max(5);
            tokio::time::sleep(std::time::Duration::from_secs(interval)).await;

            if app.state::<AppState>().quitting.load(Ordering::Relaxed) {
                break;
            }
        }
    });
}

fn notify_on_transition(app: &AppHandle, previous: &NetworkStatus, next: &NetworkStatus) {
    let state = app.state::<AppState>();
    let settings = state.settings_snapshot();
    if !settings.notifications {
        return;
    }

    if previous.state == next.state && previous.portal == next.portal {
        return;
    }

    let ssid = next
        .wifi
        .ssid
        .clone()
        .unwrap_or_else(|| "Wi-Fi".to_string());
    let had_internet = matches!(
        previous.state,
        ConnectionState::InternetAvailable | ConnectionState::Authenticated
    );
    let has_internet = matches!(
        next.state,
        ConnectionState::InternetAvailable | ConnectionState::Authenticated
    );

    match next.state {
        ConnectionState::Disconnected if previous.wifi.associated => {
            notification_manager::notify(
                app,
                "Wi-Fi disconnected",
                "Your Mac is no longer connected to the Wi-Fi network.",
            );
        }
        ConnectionState::PortalDetected | ConnectionState::AuthenticationRequired => {
            let should_notify = {
                let mut machine = state
                    .machine
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner());
                if machine.last_portal_notified_for.as_deref() == Some(ssid.as_str()) {
                    false
                } else {
                    machine.last_portal_notified_for = Some(ssid.clone());
                    true
                }
            };
            if should_notify {
                notification_manager::notify(
                    app,
                    "Sign-in required",
                    &format!("\"{ssid}\" needs a portal sign-in. Open AirLink to connect."),
                );
            }
        }
        ConnectionState::SessionExpired if previous.state != ConnectionState::SessionExpired => {
            notification_manager::notify(
                app,
                "Wi-Fi session may have expired",
                &format!("\"{ssid}\" is asking you to sign in again."),
            );
        }
        ConnectionState::InternetAvailable | ConnectionState::Authenticated
            if !had_internet
                && matches!(
                    previous.state,
                    ConnectionState::PortalDetected
                        | ConnectionState::AuthenticationRequired
                        | ConnectionState::SessionExpired
                        | ConnectionState::ConnectionError
                ) =>
        {
            notification_manager::notify(
                app,
                "Internet restored",
                &format!("You're back online on \"{ssid}\"."),
            );
            let mut machine = state
                .machine
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            machine.last_portal_notified_for = None;
        }
        _ => {}
    }

    if has_internet {
        let mut machine = state
            .machine
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        machine.last_portal_notified_for = None;
    }

    let _ = app.emit("wifi://transition", &next.state);
}
