#[cfg(target_os = "linux")]
#[path = "wifi_manager_linux.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "wifi_manager_macos.rs"]
mod platform;

#[allow(unused_imports)]
pub use platform::{NetworkSnapshot, WifiManager};
