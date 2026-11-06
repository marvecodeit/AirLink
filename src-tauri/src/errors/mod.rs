use serde::Serialize;

/// Errors that can occur inside the application services.
///
/// Errors are deliberately translated into short, human-readable messages
/// before crossing the IPC boundary. Internal details are logged locally.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Could not read or write settings: {0}")]
    Settings(String),

    #[error("Network operation failed: {0}")]
    Network(String),

    #[error("The portal browser is unavailable: {0}")]
    Browser(String),

    #[error("Credential error: {0}")]
    Credential(String),

    #[error("Invalid request: {0}")]
    InvalidInput(String),
}

impl From<tauri::Error> for AppError {
    fn from(error: tauri::Error) -> Self {
        Self::Browser(error.to_string())
    }
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Io(_) => "io",
            Self::Settings(_) => "settings",
            Self::Network(_) => "network",
            Self::Browser(_) => "browser",
            Self::Credential(_) => "credential",
            Self::InvalidInput(_) => "invalid_input",
        }
    }
}

/// Serializable error returned to the React frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl CommandError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

impl From<AppError> for CommandError {
    fn from(error: AppError) -> Self {
        // Log the full error locally for diagnostics, but return a concise
        // message. Credential values are never part of AppError.
        log::warn!("command error [{}]: {error}", error.code());
        Self {
            code: error.code().to_string(),
            message: error.to_string(),
        }
    }
}

impl From<tauri::Error> for CommandError {
    fn from(error: tauri::Error) -> Self {
        log::warn!("tauri error: {error}");
        Self::new("tauri", "A native window operation failed.")
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
