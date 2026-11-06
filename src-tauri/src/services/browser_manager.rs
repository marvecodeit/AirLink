use std::time::Duration;

use tauri::webview::{
    DownloadEvent, NewWindowResponse, PageLoadEvent, PermissionResponse, WebviewBuilder,
};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl};
use url::Url;

use crate::app_state::AppState;
use crate::errors::AppError;
use crate::models::portal::{BrowserBounds, BrowserState};

pub const PORTAL_WEBVIEW_LABEL: &str = "portal-browser";
pub const MAIN_WINDOW_LABEL: &str = "main";
const DEFAULT_PORTAL_PROBE: &str = "http://captive.apple.com/hotspot-detect.html";

/// Returns the embedded portal browser if it has been created.
pub fn existing(app: &AppHandle) -> Option<Webview> {
    app.get_webview(PORTAL_WEBVIEW_LABEL)
}

pub fn default_portal_url(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    let status = state.status_snapshot();
    let settings = state.settings_snapshot();

    if let Some(portal) = status.portal {
        return portal.url;
    }

    if let Some(ssid) = status.wifi.ssid.as_deref()
        && let Some(profile) = settings
            .trusted_profiles
            .iter()
            .find(|profile| profile.ssid == ssid)
        && let Some(url) = &profile.portal_url
    {
        return url.clone();
    }

    DEFAULT_PORTAL_PROBE.to_string()
}

pub fn validate_portal_url(value: &str) -> Result<Url, AppError> {
    let parsed = Url::parse(value.trim())
        .map_err(|_| AppError::InvalidInput("That is not a valid web address.".into()))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(AppError::InvalidInput(
            "The portal address must start with http:// or https://.".into(),
        ));
    }
    Ok(parsed)
}

/// Open the embedded browser, creating the child WKWebView on first use.
pub fn open(
    app: &AppHandle,
    url: Option<String>,
    bounds: BrowserBounds,
) -> Result<BrowserState, AppError> {
    let requested = match url {
        Some(value) if !value.trim().is_empty() => validate_portal_url(&value)?,
        _ => validate_portal_url(&default_portal_url(app))?,
    };

    configure_browser_context(app);

    if let Some(webview) = existing(app) {
        apply_bounds(&webview, bounds)?;
        webview.show()?;
        webview.set_focus()?;
        if is_different_document(&webview, &requested) {
            webview.navigate(requested.clone())?;
        }
        update_state(app, |state| {
            state.open = true;
            state.url = Some(requested.to_string());
            state.is_secure = requested.scheme() == "https";
            state.error = None;
        });
        emit_state(app);
        return Ok(app.state::<AppState>().browser_snapshot());
    }

    let window = app
        .get_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| AppError::Browser("The main window is not available.".into()))?;

    let app_for_navigation = app.clone();
    let app_for_load = app.clone();
    let app_for_title = app.clone();
    let app_for_popup = app.clone();
    let app_for_download = app.clone();

    let builder = WebviewBuilder::new(
        PORTAL_WEBVIEW_LABEL,
        WebviewUrl::External(requested.clone()),
    )
    .zoom_hotkeys_enabled(false)
    .on_navigation(move |url| {
        let allowed = matches!(url.scheme(), "http" | "https")
            || (url.scheme() == "about" && url.path() == "blank");
        if !allowed {
            let _ = app_for_navigation.emit("browser://navigation-blocked", url.to_string());
            return false;
        }
        let host = url.host_str().unwrap_or_default().to_string();
        let on_portal = is_trusted_host(&app_for_navigation, &host);
        update_state(&app_for_navigation, |browser| {
            browser.url = Some(url.to_string());
            browser.is_secure = url.scheme() == "https";
            browser.on_portal_domain = on_portal;
            browser.error = None;
        });
        emit_state(&app_for_navigation);
        let _ = app_for_navigation.emit("browser://navigating", url.to_string());
        true
    })
    .on_page_load(move |webview, payload| {
        let url = payload.url().to_string();
        let started = payload.event() == PageLoadEvent::Started;
        let app_handle = app_for_load.clone();
        update_state(&app_handle, |state| {
            state.open = true;
            state.loading = started;
            state.url = Some(url.clone());
            state.is_secure = url.starts_with("https://");
            state.error = if started { None } else { state.error.clone() };
        });
        emit_state(&app_handle);
        let _ = app_handle.emit(
            "browser://page-load",
            serde_json::json!({ "url": url, "loading": started }),
        );

        // Query WKWebView for accurate history flags once layout settles.
        let _ = webview;
        spawn_sync(app_handle.clone());

        if !started {
            let state = app_handle.state::<AppState>();
            let auto_verify = state.settings_snapshot().auto_verify;
            let app_for_verify = app_handle.clone();
            let app_handle_verify = app_handle.clone();
            if auto_verify {
                tauri::async_runtime::spawn(async move {
                    let state = app_handle_verify.state::<AppState>();
                    state
                        .auto_verify_after_browser_navigation(app_for_verify)
                        .await;
                });
            }
        }
    })
    .on_document_title_changed(move |_webview, title| {
        update_state(&app_for_title, |state| state.title = Some(title));
        emit_state(&app_for_title);
    })
    .on_new_window(move |url, _features| {
        let _ = app_for_popup.emit("browser://popup-blocked", url.to_string());
        NewWindowResponse::Deny
    })
    .on_download(move |_webview, event| {
        if matches!(event, DownloadEvent::Requested { .. }) {
            let _ = app_for_download.emit(
                "browser://download-blocked",
                "Downloads are disabled in the portal browser.",
            );
        }
        false
    })
    .on_permission_request(|_webview, _kind| PermissionResponse::Deny);

    let position = LogicalPosition::new(bounds.x.max(0.0), bounds.y.max(0.0));
    let size = LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0));
    let webview = window.add_child(builder, position, size)?;
    webview.set_focus()?;

    update_state(app, |state| {
        *state = BrowserState {
            open: true,
            url: Some(requested.to_string()),
            title: None,
            loading: true,
            can_go_back: false,
            can_go_forward: false,
            error: None,
            is_secure: requested.scheme() == "https",
            on_portal_domain: true,
        };
    });
    emit_state(app);
    Ok(app.state::<AppState>().browser_snapshot())
}

pub fn set_bounds(app: &AppHandle, bounds: BrowserBounds) -> Result<(), AppError> {
    if let Some(webview) = existing(app) {
        apply_bounds(&webview, bounds)?;
    }
    Ok(())
}

fn apply_bounds(webview: &Webview, bounds: BrowserBounds) -> Result<(), AppError> {
    webview.set_position(LogicalPosition::new(bounds.x.max(0.0), bounds.y.max(0.0)))?;
    webview.set_size(LogicalSize::new(
        bounds.width.max(1.0),
        bounds.height.max(1.0),
    ))?;
    Ok(())
}

pub fn show(app: &AppHandle) -> Result<(), AppError> {
    if let Some(webview) = existing(app) {
        webview.show()?;
        webview.set_focus()?;
        update_state(app, |state| state.open = true);
        emit_state(app);
    }
    Ok(())
}

pub fn hide(app: &AppHandle) -> Result<(), AppError> {
    if let Some(webview) = existing(app) {
        webview.hide()?;
        update_state(app, |state| state.open = false);
        emit_state(app);
    }
    Ok(())
}

pub fn navigate(app: &AppHandle, url: &str) -> Result<(), AppError> {
    let parsed = validate_portal_url(url)?;
    let webview =
        existing(app).ok_or_else(|| AppError::Browser("Open the portal browser first.".into()))?;
    webview.navigate(parsed)?;
    Ok(())
}

pub fn back(app: &AppHandle) -> Result<(), AppError> {
    let webview =
        existing(app).ok_or_else(|| AppError::Browser("Open the portal browser first.".into()))?;
    native_back(&webview)?;
    spawn_sync(app.clone());
    Ok(())
}

pub fn forward(app: &AppHandle) -> Result<(), AppError> {
    let webview =
        existing(app).ok_or_else(|| AppError::Browser("Open the portal browser first.".into()))?;
    native_forward(&webview)?;
    spawn_sync(app.clone());
    Ok(())
}

pub fn reload(app: &AppHandle) -> Result<(), AppError> {
    let webview =
        existing(app).ok_or_else(|| AppError::Browser("Open the portal browser first.".into()))?;
    native_reload(&webview)?;
    Ok(())
}

pub fn stop(app: &AppHandle) -> Result<(), AppError> {
    let webview =
        existing(app).ok_or_else(|| AppError::Browser("Open the portal browser first.".into()))?;
    native_stop(&webview)?;
    Ok(())
}

pub fn open_devtools(app: &AppHandle) -> Result<(), AppError> {
    let webview =
        existing(app).ok_or_else(|| AppError::Browser("Open the browser first.".into()))?;
    webview.open_devtools();
    Ok(())
}

pub fn open_external(app: &AppHandle, url: &str) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    let parsed = validate_portal_url(url)?;
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|error| AppError::Browser(error.to_string()))
}

pub fn close(app: &AppHandle) -> Result<(), AppError> {
    if let Some(webview) = existing(app) {
        webview.close()?;
    }
    update_state(app, |state| {
        *state = BrowserState::default();
    });
    emit_state(app);
    Ok(())
}

fn configure_browser_context(app: &AppHandle) {
    let state = app.state::<AppState>();
    let settings = state.settings_snapshot();
    let status = state.status_snapshot();
    let profile = settings
        .trusted_profiles
        .iter()
        .find(|profile| status.wifi.ssid.as_ref() == Some(&profile.ssid));

    // Prefer the detected portal or the profile's portal. If neither is known,
    // the browser shows "Unverified domain" instead of falsely claiming that an
    // arbitrary address is the portal.
    let detected_host = status.portal.as_ref().map(|portal| portal.host.clone());
    let profile_host = profile
        .and_then(|profile| profile.portal_url.as_deref())
        .and_then(|value| Url::parse(value).ok())
        .and_then(|parsed| parsed.host_str().map(str::to_string));
    let portal_host = detected_host.or(profile_host);

    let trusted_domains = profile
        .map(|profile| profile.trusted_domains.clone())
        .unwrap_or_default();

    {
        let mut host = state
            .browser_portal_host
            .write()
            .unwrap_or_else(|poison| poison.into_inner());
        *host = portal_host;
    }
    {
        let mut domains = state
            .browser_trusted_domains
            .write()
            .unwrap_or_else(|poison| poison.into_inner());
        *domains = trusted_domains;
    }
}

fn is_trusted_host(app: &AppHandle, host: &str) -> bool {
    let state = app.state::<AppState>();
    let portal_host = state
        .browser_portal_host
        .read()
        .unwrap_or_else(|poison| poison.into_inner())
        .clone();
    let trusted = state
        .browser_trusted_domains
        .read()
        .unwrap_or_else(|poison| poison.into_inner())
        .clone();

    if host.is_empty() {
        return false;
    }
    portal_host
        .as_deref()
        .map(|portal| host == portal || host.ends_with(&format!(".{portal}")))
        .unwrap_or(false)
        || trusted
            .iter()
            .any(|domain| host == domain || host.ends_with(&format!(".{domain}")))
}

fn is_different_document(webview: &Webview, requested: &Url) -> bool {
    webview
        .url()
        .map(|current| current.as_str() != requested.as_str())
        .unwrap_or(true)
}

fn update_state(app: &AppHandle, update: impl FnOnce(&mut BrowserState)) {
    let state = app.state::<AppState>();
    let mut browser = state
        .browser
        .write()
        .unwrap_or_else(|poison| poison.into_inner());
    update(&mut browser);
}

pub fn emit_state(app: &AppHandle) {
    let state = app.state::<AppState>();
    let browser = state.browser_snapshot();
    let _ = app.emit("browser://state", browser);
}

fn spawn_sync(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(200)).await;
        sync_native_state(&app).await;
    });
}

pub async fn sync_native_state(app: &AppHandle) {
    let Some(webview) = existing(app) else {
        return;
    };

    let (tx, rx) = tokio::sync::oneshot::channel();
    let result = webview.with_webview(move |platform| {
        let flags = {
            #[cfg(target_os = "macos")]
            unsafe {
                let view: &objc2_web_kit::WKWebView = &*platform.inner().cast();
                Some((view.canGoBack(), view.canGoForward(), view.isLoading()))
            }
            #[cfg(target_os = "linux")]
            {
                use webkit2gtk::WebViewExt;
                let view = platform.inner();
                Some((view.can_go_back(), view.can_go_forward(), view.is_loading()))
            }
            #[cfg(not(any(target_os = "macos", target_os = "linux")))]
            {
                None
            }
        };
        let _ = tx.send(flags);
    });

    if result.is_err() {
        return;
    }

    let Ok(Ok(Some((back, forward, loading)))) =
        tokio::time::timeout(Duration::from_secs(2), rx).await
    else {
        return;
    };

    let current_url = webview
        .url()
        .ok()
        .map(|url| url.to_string())
        .or_else(|| app.state::<AppState>().browser_snapshot().url);

    let state = app.state::<AppState>();
    let on_portal = current_url
        .as_deref()
        .and_then(|url| Url::parse(url).ok())
        .and_then(|url| url.host_str().map(str::to_string))
        .map(|host| is_trusted_host(app, &host))
        .unwrap_or(false);
    let secure = current_url
        .as_deref()
        .map(|url| url.starts_with("https://"))
        .unwrap_or(false);

    {
        let mut browser = state
            .browser
            .write()
            .unwrap_or_else(|poison| poison.into_inner());
        browser.can_go_back = back;
        browser.can_go_forward = forward;
        browser.loading = loading;
        browser.on_portal_domain = on_portal;
        browser.is_secure = secure;
        if let Some(url) = current_url {
            browser.url = Some(url);
        }
    }
    emit_state(app);
}

#[cfg(target_os = "macos")]
fn with_wkwebview(
    webview: &Webview,
    operation: impl FnOnce(&objc2_web_kit::WKWebView) + Send + 'static,
) -> Result<(), AppError> {
    webview.with_webview(move |platform| {
        let view: &objc2_web_kit::WKWebView = unsafe { &*platform.inner().cast() };
        operation(view);
    })?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn native_back(webview: &Webview) -> Result<(), AppError> {
    webview.with_webview(|platform| {
        use webkit2gtk::WebViewExt;
        let view = platform.inner();
        if view.can_go_back() {
            view.go_back();
        }
    })?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn native_forward(webview: &Webview) -> Result<(), AppError> {
    webview.with_webview(|platform| {
        use webkit2gtk::WebViewExt;
        let view = platform.inner();
        if view.can_go_forward() {
            view.go_forward();
        }
    })?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn native_reload(webview: &Webview) -> Result<(), AppError> {
    webview.with_webview(|platform| {
        use webkit2gtk::WebViewExt;
        platform.inner().reload();
    })?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn native_stop(webview: &Webview) -> Result<(), AppError> {
    webview.with_webview(|platform| {
        use webkit2gtk::WebViewExt;
        platform.inner().stop_loading();
    })?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn native_back(webview: &Webview) -> Result<(), AppError> {
    with_wkwebview(webview, |view| unsafe {
        if view.canGoBack() {
            let _ = view.goBack();
        }
    })
}

#[cfg(target_os = "macos")]
fn native_forward(webview: &Webview) -> Result<(), AppError> {
    with_wkwebview(webview, |view| unsafe {
        if view.canGoForward() {
            let _ = view.goForward();
        }
    })
}

#[cfg(target_os = "macos")]
fn native_reload(webview: &Webview) -> Result<(), AppError> {
    with_wkwebview(webview, |view| unsafe {
        let _ = view.reload();
    })
}

#[cfg(target_os = "macos")]
fn native_stop(webview: &Webview) -> Result<(), AppError> {
    with_wkwebview(webview, |view| unsafe {
        view.stopLoading();
    })
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn native_back(_webview: &Webview) -> Result<(), AppError> {
    Err(AppError::InvalidInput(
        "The embedded browser is only available on macOS and Linux.".into(),
    ))
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn native_forward(webview: &Webview) -> Result<(), AppError> {
    native_back(webview)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn native_reload(webview: &Webview) -> Result<(), AppError> {
    native_back(webview)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn native_stop(webview: &Webview) -> Result<(), AppError> {
    native_back(webview)
}
