use security_framework::passwords::{
    PasswordOptions, delete_generic_password_options, generic_password,
    set_generic_password_options,
};
use zeroize::Zeroize;

use crate::errors::AppError;

const SERVICE_PREFIX: &str = "com.marvecodeit.airlink.portal";
/// Items saved by WiFi Wizard before the AirLink rebrand remain readable and
/// deletable. New writes always use the AirLink service name.
const LEGACY_SERVICE_PREFIX: &str = "com.marveltech.wifiwizard.portal";

/// Stores portal passwords in the user's login Keychain.
///
/// - One generic-password item per SSID.
/// - The keychain account is the username.
/// - `set_generic_password_options` creates or updates the item atomically.
/// - No credential is ever written to settings.json, localStorage, or logs.
#[derive(Debug, Default, Clone)]
pub struct CredentialManager;

impl CredentialManager {
    pub fn save(&self, ssid: &str, username: &str, password: &str) -> Result<(), AppError> {
        let ssid = ssid.trim();
        let username = username.trim();
        if ssid.is_empty() || username.is_empty() {
            return Err(AppError::InvalidInput(
                "A network name and username are required.".into(),
            ));
        }
        if password.is_empty() {
            return Err(AppError::InvalidInput("The password is empty.".into()));
        }

        let mut options = PasswordOptions::new_generic_password(&self.service(ssid), username);
        options.set_label(&format!("AirLink portal login for {ssid}"));

        set_generic_password_options(password.as_bytes(), options)
            .map_err(|error| map_keychain_error(error, "save"))
    }

    pub fn load_password(&self, ssid: &str, username: &str) -> Result<String, AppError> {
        let service = self.service(ssid);
        let account = username.trim();
        let mut bytes =
            match generic_password(PasswordOptions::new_generic_password(&service, account)) {
                Ok(bytes) => bytes,
                Err(error) if is_not_found(&error) => {
                    // Migrate legacy WiFi Wizard credentials on first use.
                    generic_password(PasswordOptions::new_generic_password(
                        &self.legacy_service(ssid),
                        account,
                    ))
                    .map_err(|legacy_error| map_keychain_error(legacy_error, "read"))?
                }
                Err(error) => return Err(map_keychain_error(error, "read")),
            };

        let password = String::from_utf8(bytes.clone()).map_err(|_| {
            bytes.zeroize();
            AppError::Credential("The saved password is not valid UTF-8.".into())
        })?;
        bytes.zeroize();

        // Best-effort migration to the AirLink service. Failure here must not
        // block the user from reading the legacy credential they just opened.
        let mut options = PasswordOptions::new_generic_password(&service, account);
        options.set_label(&format!("AirLink portal login for {ssid}"));
        if let Err(error) = set_generic_password_options(password.as_bytes(), options) {
            log::debug!("could not migrate legacy keychain item: {error}");
        }
        Ok(password)
    }

    pub fn exists(&self, ssid: &str, username: &str) -> bool {
        self.load_password(ssid, username).is_ok()
    }

    pub fn delete(&self, ssid: &str, username: &str) -> Result<(), AppError> {
        let account = username.trim();
        for service in [self.service(ssid), self.legacy_service(ssid)] {
            match delete_generic_password_options(PasswordOptions::new_generic_password(
                &service, account,
            )) {
                Ok(()) => {}
                Err(error) if is_not_found(&error) => {}
                Err(error) => return Err(map_keychain_error(error, "delete")),
            }
        }
        Ok(())
    }

    fn service(&self, ssid: &str) -> String {
        service_name(SERVICE_PREFIX, ssid)
    }

    fn legacy_service(&self, ssid: &str) -> String {
        service_name(LEGACY_SERVICE_PREFIX, ssid)
    }
}

fn service_name(prefix: &str, ssid: &str) -> String {
    // Hex encoding avoids collisions between network names that differ only by
    // punctuation and keeps the Keychain service name path-safe.
    let encoded: String = ssid
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    format!("{prefix}.{encoded}")
}

fn is_not_found(error: &security_framework::base::Error) -> bool {
    error.code() == -25300
}

fn map_keychain_error(error: security_framework::base::Error, action: &str) -> AppError {
    if is_not_found(&error) {
        return AppError::Credential(
            "No saved password was found for this network and username.".into(),
        );
    }
    if error.code() == -128 {
        return AppError::Credential("Keychain access was cancelled.".into());
    }
    log::warn!("keychain {action} error code {}", error.code());
    AppError::Credential(format!("macOS Keychain could not {action} the password."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_names_are_keychain_safe() {
        let manager = CredentialManager;
        assert_eq!(
            manager.service("A/B"),
            "com.marvecodeit.airlink.portal.412f42"
        );
        assert_eq!(
            manager.legacy_service("A/B"),
            "com.marveltech.wifiwizard.portal.412f42"
        );
        assert_ne!(manager.service("A/B"), manager.service("A_B"));
    }
}
