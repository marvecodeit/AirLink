use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::app_state::AppState;
use crate::models::connection_status::{ConnectionState, NetworkStatus};

pub struct TrayHandles {
    pub status: MenuItem<Wry>,
    pub ssid: MenuItem<Wry>,
    pub portal: MenuItem<Wry>,
}

const TRAY_ID: &str = "airlink-tray";

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let app_name = app
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| app.package_info().name.clone());
    setup_app_menu(app, &app_name)?;

    let status = MenuItem::with_id(
        app,
        "tray-status",
        "Checking connection…",
        false,
        None::<&str>,
    )?;
    let ssid = MenuItem::with_id(app, "tray-ssid", "No Wi-Fi network", false, None::<&str>)?;
    let portal = MenuItem::with_id(
        app,
        "tray-portal",
        "Open Captive Portal",
        false,
        None::<&str>,
    )?;

    let menu = MenuBuilder::new(app)
        .item(&status)
        .item(&ssid)
        .separator()
        .text("tray-open", format!("Open {app_name}"))
        .item(&portal)
        .text("tray-check", "Check Connection")
        .separator()
        .text("tray-settings", "Settings…")
        .text("tray-quit", format!("Quit {app_name}"))
        .build()?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip(app_name.clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-open" => show_main(app, None),
            "tray-portal" => show_main(app, Some("open-portal")),
            "tray-settings" => show_main(app, Some("settings")),
            "tray-check" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let status = app
                        .state::<AppState>()
                        .refresh(&app, crate::app_state::RefreshMode::Force)
                        .await;
                    let _ = app.emit("menu://check-complete", &status);
                    update(&app, &status);
                });
            }
            "tray-quit" => {
                app.state::<AppState>()
                    .quitting
                    .store(true, std::sync::atomic::Ordering::Relaxed);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    app.manage(TrayHandles {
        status,
        ssid,
        portal,
    });

    Ok(())
}

fn setup_app_menu(app: &AppHandle, app_name: &str) -> tauri::Result<()> {
    let version = app.package_info().version.to_string();
    let about = AboutMetadataBuilder::new()
        .name(Some(app_name))
        .version(Some(version))
        .copyright(Some("© 2026 marvecodeit"))
        .build();

    let settings_item =
        MenuItem::with_id(app, "menu-settings", "Settings…", true, Some("CmdOrCtrl+,"))?;

    let app_menu = SubmenuBuilder::new(app, app_name)
        .about_with_text(format!("About {app_name}"), Some(about))
        .separator()
        .item(&settings_item)
        .separator()
        .services()
        .separator()
        .hide_with_text(format!("Hide {app_name}"))
        .hide_others()
        .show_all()
        .separator()
        .quit_with_text(format!("Quit {app_name}"))
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .separator()
        .close_window()
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit_menu)
        .item(&window_menu)
        .build()?;

    app.set_menu(menu)?;

    let handle = app.clone();
    app.on_menu_event(move |_app, event| {
        if event.id().as_ref() == "menu-settings" {
            show_main(&handle, Some("settings"));
        }
    });

    Ok(())
}

fn show_main(app: &AppHandle, action: Option<&str>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    if let Some(action) = action {
        let _ = app.emit("menu://action", action);
    }
}

pub fn update(app: &AppHandle, status: &NetworkStatus) {
    let handles = app.state::<TrayHandles>();
    let ssid = status
        .wifi
        .ssid
        .clone()
        .or_else(|| {
            status
                .wifi
                .ssid_restricted
                .then(|| "Wi-Fi network".to_string())
        })
        .unwrap_or_else(|| "No Wi-Fi network".to_string());

    let status_label = state_label(status.state);
    let _ = handles.status.set_text(status_label);
    let _ = handles.ssid.set_text(&ssid);
    let _ = handles.portal.set_enabled(status.wifi.associated);

    let tooltip = format!("{}\n{ssid} · {status_label}", app.package_info().name);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

fn state_label(state: ConnectionState) -> &'static str {
    match state {
        ConnectionState::Disconnected => "Not connected",
        ConnectionState::Connecting => "Checking connection…",
        ConnectionState::AuthenticationRequired => "Sign-in required",
        ConnectionState::PortalDetected => "Captive portal detected",
        ConnectionState::Authenticating => "Signing in…",
        ConnectionState::Authenticated => "Authenticated",
        ConnectionState::InternetAvailable => "Internet available",
        ConnectionState::SessionExpired => "Session expired",
        ConnectionState::ConnectionError => "No internet access",
    }
}
