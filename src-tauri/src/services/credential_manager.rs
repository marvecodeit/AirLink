#[cfg(target_os = "linux")]
#[path = "credential_manager_linux.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "credential_manager_macos.rs"]
mod platform;

pub use platform::CredentialManager;
