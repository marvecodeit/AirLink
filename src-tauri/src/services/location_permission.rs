use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LocationAuthorization {
    NotDetermined,
    Restricted,
    Denied,
    Authorized,
}

/// Read the current Location Services authorization state.
///
/// macOS gates Wi-Fi SSIDs behind Location access. AirLink only requests
/// this permission when the user explicitly asks it to reveal the network
/// name; it never records or transmits location data.
#[cfg(target_os = "macos")]
pub fn authorization_status() -> LocationAuthorization {
    use objc2_core_location::{CLAuthorizationStatus, CLLocationManager};

    // The class method is deprecated in newer SDKs but remains the reliable
    // way to read authorization without instantiating a manager.
    #[allow(deprecated)]
    let status = unsafe { CLLocationManager::authorizationStatus_class() };
    match status {
        CLAuthorizationStatus::AuthorizedAlways | CLAuthorizationStatus::AuthorizedWhenInUse => {
            LocationAuthorization::Authorized
        }
        CLAuthorizationStatus::Denied => LocationAuthorization::Denied,
        CLAuthorizationStatus::Restricted => LocationAuthorization::Restricted,
        _ => LocationAuthorization::NotDetermined,
    }
}

#[cfg(target_os = "linux")]
pub fn authorization_status() -> LocationAuthorization {
    // Linux does not gate SSIDs behind Location Services.
    LocationAuthorization::Authorized
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn authorization_status() -> LocationAuthorization {
    LocationAuthorization::Restricted
}

/// Request When-In-Use authorization. This must run on the main thread so the
/// system prompt can be presented.
#[cfg(target_os = "macos")]
pub fn request_authorization() -> LocationAuthorization {
    use objc2::rc::autoreleasepool;
    use objc2_core_location::CLLocationManager;

    autoreleasepool(|_| {
        let manager = unsafe { CLLocationManager::new() };
        unsafe { manager.requestWhenInUseAuthorization() };
        // Keep the manager alive while the system prompt is on screen. This is
        // a single, intentionally retained object for the app's lifetime.
        std::mem::forget(manager);
    });
    authorization_status()
}

#[cfg(target_os = "linux")]
pub fn request_authorization() -> LocationAuthorization {
    LocationAuthorization::Authorized
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn request_authorization() -> LocationAuthorization {
    LocationAuthorization::Restricted
}
