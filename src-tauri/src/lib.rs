mod app_state;
mod commands;
mod errors;
mod models;
mod services;
mod tray;

use std::sync::atomic::Ordering;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use app_state::AppState;
use services::{network_monitor, settings_manager};

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("airlink".into()),
                    }),
                ])
                .rotation_strategy(RotationStrategy::KeepAll)
                .max_file_size(2_000_000)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let settings_path = settings_manager::settings_path(&config_dir);
            let settings = settings_manager::load(&settings_path);
            let tray_visible = settings.keep_in_menu_bar;

            app.manage(AppState::new(settings, settings_path));
            app.state::<AppState>().super_dev.restore_stale();
            tray::setup(app.handle())?;
            if !tray_visible && let Some(tray) = app.tray_by_id("airlink-tray") {
                let _ = tray.set_visible(false);
            }

            sync_autostart(app.handle());
            install_window_close_handler(app.handle());
            network_monitor::spawn(app.handle().clone());

            log::info!("AirLink started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::wifi::get_network_status,
            commands::wifi::refresh_network_status,
            commands::wifi::check_connection,
            commands::network::get_location_authorization,
            commands::network::request_location_authorization,
            commands::network::open_location_settings,
            commands::network::open_network_settings,
            commands::network::diagnose_network,
            commands::captive_portal::detect_captive_portal,
            commands::captive_portal::get_portal_info,
            commands::captive_portal::verify_authentication,
            commands::browser::open_portal_browser,
            commands::browser::set_browser_bounds,
            commands::browser::show_portal_browser,
            commands::browser::hide_portal_browser,
            commands::browser::close_portal_browser,
            commands::browser::browser_back,
            commands::browser::browser_forward,
            commands::browser::browser_reload,
            commands::browser::browser_stop,
            commands::browser::browser_navigate,
            commands::browser::get_browser_state,
            commands::browser::sync_browser_state,
            commands::browser::open_browser_devtools,
            commands::browser::open_external_url,
            commands::credentials::list_credentials,
            commands::credentials::save_credential,
            commands::credentials::remove_credential,
            commands::credentials::copy_credential,
            commands::credentials::has_saved_password,
            commands::diagnostics::log_frontend_error,
            commands::diagnostics::log_frontend_ready,
            commands::super_dev::get_super_dev_status,
            commands::super_dev::set_super_dev,
            commands::hotspot::get_hotspot_status,
            commands::hotspot::open_internet_sharing_settings,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_app_info,
            commands::settings::send_test_notification,
            commands::settings::open_config_folder,
        ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while building AirLink")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_main_window(app),
            RunEvent::Exit => {
                app.state::<AppState>().super_dev.disable();
            }
            _ => {}
        });
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn install_window_close_handler(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let handle = app.clone();

    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let state = handle.state::<AppState>();
            let keep_running = state.settings_snapshot().keep_in_menu_bar;
            let quitting = state.quitting.load(Ordering::Relaxed);

            if quitting {
                return;
            }

            if keep_running {
                api.prevent_close();
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.hide();
                }
            } else {
                // The tray is disabled, so closing the only window quits.
                api.prevent_close();
                state.quitting.store(true, Ordering::Relaxed);
                handle.exit(0);
            }
        }
    });
}

fn sync_autostart(app: &tauri::AppHandle) {
    use tauri_plugin_autostart::ManagerExt;

    let desired = app.state::<AppState>().settings_snapshot().launch_at_login;
    match app.autolaunch().is_enabled() {
        Ok(current) if current == desired => {}
        Ok(_) => {
            let result = if desired {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            };
            if let Err(error) = result {
                log::warn!("could not sync the login item: {error}");
            }
        }
        Err(error) => log::debug!("could not read login item state: {error}"),
    }
}
