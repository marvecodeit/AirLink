//! Best-effort integration with Apple's legacy Captive Network Support
//! framework.
//!
//! `CNMarkPortalOnline` is not a supported public API for third-party Mac
//! apps. AirLink never relies on it to decide whether authentication
//! succeeded: verification always comes from fresh HTTPS probes over the
//! system network path. If the symbol is available, we inform the system that
//! the portal is online *after* verification. Failure is logged and ignored.
//!
//! References:
//! - Apple Captive Network Support (`CaptiveNetwork.framework`)
//! - Apple's Captive Network Assistant uses the same system-level concept.

#[cfg(target_os = "macos")]
pub fn mark_portal_online(interface: Option<&str>) -> Result<(), String> {
    use objc2::rc::autoreleasepool;
    use objc2_foundation::NSString;

    let Some(interface) = interface.filter(|value| !value.is_empty()) else {
        return Err("No network interface was available.".into());
    };

    let library = unsafe {
        libloading::Library::new(
            "/System/Library/PrivateFrameworks/CaptiveNetwork.framework/CaptiveNetwork",
        )
    }
    .map_err(|error| format!("CaptiveNetwork.framework is unavailable: {error}"))?;

    type MarkPortalOnline = unsafe extern "C" fn(*const std::ffi::c_void) -> bool;
    let symbol: libloading::Symbol<MarkPortalOnline> =
        unsafe { library.get(b"CNMarkPortalOnline\0") }
            .map_err(|error| format!("CNMarkPortalOnline is unavailable: {error}"))?;

    autoreleasepool(|_| {
        let name = NSString::from_str(interface);
        let result = unsafe { symbol(objc2::rc::Retained::as_ptr(&name).cast()) };
        if result {
            Ok(())
        } else {
            Err("The system declined the portal status update.".into())
        }
    })
}

#[cfg(not(target_os = "macos"))]
pub fn mark_portal_online(_interface: Option<&str>) -> Result<(), String> {
    Err("Captive Network Support is only available on macOS.".into())
}
