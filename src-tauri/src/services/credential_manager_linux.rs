use keyring::Entry;
use zeroize::Zeroize;

use crate::errors::AppError;

const SERVICE_PREFIX: &str = "com.marvecodeit.airlink.portal";
const LEGACY_SERVICE_PREFIX: &str = "com.marveltech.wifiwizard.portal";

/// Stores portal passwords in the Linux Secret Service (GNOME Keyring, KWallet,
/// or any freedesktop.org Secret Service provider).
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
        Entry::new(&self.service(ssid), username)
            .map_err(|error| map_keyring_error(error, "open"))?
            .set_password(password)
            .map_err(|error| map_keyring_error(error, "save"))
    }

    pub fn load_password(&self, ssid: &str, username: &str) -> Result<String, AppError> {
        let entry = Entry::new(&self.service(ssid), username.trim())
            .map_err(|error| map_keyring_error(error, "open"))?;
        let mut password = match entry.get_password() {
            Ok(password) => password,
            Err(keyring::Error::NoEntry) => Entry::new(&self.legacy_service(ssid), username.trim())
                .map_err(|error| map_keyring_error(error, "open"))?
                .get_password()
                .map_err(|error| map_keyring_error(error, "read"))?,
            Err(error) => return Err(map_keyring_error(error, "read")),
        };

        // Best-effort migration from the pre-rebrand service name.
        if entry.get_password().is_err() {
            let _ = entry.set_password(&password);
        }
        let result = password.clone();
        password.zeroize();
        Ok(result)
    }

    pub fn exists(&self, ssid: &str, username: &str) -> bool {
        self.load_password(ssid, username).is_ok()
    }

    pub fn delete(&self, ssid: &str, username: &str) -> Result<(), AppError> {
        for service in [self.service(ssid), self.legacy_service(ssid)] {
            match Entry::new(&service, username.trim())
                .map_err(|error| map_keyring_error(error, "open"))?
                .delete_credential()
            {
                Ok(()) => {}
                Err(keyring::Error::NoEntry) => {}
                Err(error) => return Err(map_keyring_error(error, "delete")),
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
    let encoded: String = ssid
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    format!("{prefix}.{encoded}")
}

fn map_keyring_error(error: keyring::Error, action: &str) -> AppError {
    if matches!(error, keyring::Error::NoEntry) {
        return AppError::Credential(
            "No saved password was found for this network and username.".into(),
        );
    }
    log::warn!("secret service {action} error: {error}");
    AppError::Credential(format!(
        "The Linux Secret Service could not {action} the password. Make sure a keyring provider is running."
    ))
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
        assert_ne!(manager.service("A/B"), manager.service("A_B"));
    }
}
