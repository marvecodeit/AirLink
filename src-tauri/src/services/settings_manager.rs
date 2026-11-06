use std::fs;
use std::path::{Path, PathBuf};

use crate::errors::AppError;
use crate::models::settings::Settings;

pub fn settings_path(config_dir: &Path) -> PathBuf {
    config_dir.join("settings.json")
}

pub fn load(path: &Path) -> Settings {
    let Ok(contents) = fs::read_to_string(path) else {
        return Settings::default();
    };

    match serde_json::from_str::<Settings>(&contents) {
        Ok(mut settings) => {
            settings.sanitize();
            settings
        }
        Err(error) => {
            log::warn!("settings.json could not be parsed; using defaults: {error}");
            // Preserve the user's file for recovery instead of silently
            // overwriting it on the next save.
            let backup = path.with_extension("json.corrupt");
            if let Err(backup_error) = fs::copy(path, &backup) {
                log::warn!("could not back up settings: {backup_error}");
            }
            Settings::default()
        }
    }
}

pub fn save(path: &Path, settings: &Settings) -> Result<(), AppError> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Settings("The settings path has no parent directory.".into()))?;
    fs::create_dir_all(parent)?;

    let mut sanitized = settings.clone();
    sanitized.sanitize();
    let json = serde_json::to_string_pretty(&sanitized)
        .map_err(|error| AppError::Settings(error.to_string()))?;

    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, json)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // The file contains network names and usernames, never passwords.
        let _ = fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600));
    }

    fs::rename(&temporary, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corrupted_settings_are_backed_up() {
        let dir = std::env::temp_dir().join(format!("airlink-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("settings.json");
        fs::write(&path, "{not json").unwrap();
        let settings = load(&path);
        assert_eq!(settings.poll_interval_secs, 8);
        assert!(dir.join("settings.json.corrupt").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn round_trip_preserves_preferences() {
        let dir = std::env::temp_dir().join(format!("airlink-test-save-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("settings.json");
        let mut settings = Settings::default();
        settings.theme = crate::models::settings::ThemeMode::Dark;
        settings
            .trusted_profiles
            .push(crate::models::settings::NetworkProfile {
                id: "campus".into(),
                ssid: "Campus".into(),
                portal_url: Some("https://portal.example.edu".into()),
                trusted_domains: vec!["example.edu".into()],
                auto_open: true,
                created_at: "2026-01-01T00:00:00Z".into(),
            });
        save(&path, &settings).unwrap();
        let loaded = load(&path);
        assert_eq!(loaded.theme, crate::models::settings::ThemeMode::Dark);
        assert_eq!(loaded.trusted_profiles[0].ssid, "Campus");
        let _ = fs::remove_dir_all(&dir);
    }
}
