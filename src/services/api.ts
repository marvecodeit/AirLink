import { invoke } from "@tauri-apps/api/core";
import type {
  AppInfo,
  BrowserBounds,
  BrowserState,
  CredentialList,
  LocationAuthorization,
  NetworkStatus,
  SaveCredentialRequest,
  Settings,
  HotspotStatus,
  SuperDevStatus,
  VerificationResult,
} from "../types";

export class ApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (typeof error === "string") {
    return new ApiError("unknown", error);
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") {
      return new ApiError(
        typeof record.code === "string" ? record.code : "unknown",
        record.message,
      );
    }
  }
  return new ApiError("unknown", "Something went wrong. Please try again.");
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toApiError(error);
  }
}

export const api = {
  getNetworkStatus: () => call<NetworkStatus>("get_network_status"),
  refreshNetworkStatus: () => call<NetworkStatus>("refresh_network_status"),
  checkConnection: () => call<NetworkStatus>("check_connection"),
  detectCaptivePortal: () => call<NetworkStatus>("detect_captive_portal"),
  verifyAuthentication: () => call<VerificationResult>("verify_authentication"),
  diagnoseNetwork: () => call<NetworkStatus>("diagnose_network"),

  getLocationAuthorization: () =>
    call<LocationAuthorization>("get_location_authorization"),
  requestLocationAuthorization: () =>
    call<LocationAuthorization>("request_location_authorization"),
  openLocationSettings: () => call<void>("open_location_settings"),
  openNetworkSettings: () => call<void>("open_network_settings"),

  getSettings: () => call<Settings>("get_settings"),
  updateSettings: (settings: Settings) =>
    call<Settings>("update_settings", { settings }),
  getAppInfo: () => call<AppInfo>("get_app_info"),
  sendTestNotification: () => call<void>("send_test_notification"),
  openConfigFolder: () => call<void>("open_config_folder"),

  listCredentials: () => call<CredentialList>("list_credentials"),
  saveCredential: (request: SaveCredentialRequest) =>
    call<Settings>("save_credential", { request }),
  removeCredential: (ssid: string, username: string) =>
    call<Settings>("remove_credential", { ssid, username }),
  copyCredential: (ssid: string, username: string, field: "username" | "password") =>
    call<string>("copy_credential", { ssid, username, field }),
  hasSavedPassword: (ssid: string, username: string) =>
    call<boolean>("has_saved_password", { ssid, username }),

  openPortalBrowser: (url: string | null, bounds: BrowserBounds) =>
    call<BrowserState>("open_portal_browser", { url, bounds }),
  setBrowserBounds: (bounds: BrowserBounds) =>
    call<void>("set_browser_bounds", { bounds }),
  showPortalBrowser: () => call<void>("show_portal_browser"),
  hidePortalBrowser: () => call<void>("hide_portal_browser"),
  closePortalBrowser: () => call<void>("close_portal_browser"),
  browserBack: () => call<void>("browser_back"),
  browserForward: () => call<void>("browser_forward"),
  browserReload: () => call<void>("browser_reload"),
  browserStop: () => call<void>("browser_stop"),
  browserNavigate: (url: string) => call<void>("browser_navigate", { url }),
  getBrowserState: () => call<BrowserState>("get_browser_state"),
  syncBrowserState: () => call<BrowserState>("sync_browser_state"),
  openBrowserDevtools: () => call<void>("open_browser_devtools"),
  openExternalUrl: (url: string) => call<void>("open_external_url", { url }),

  getHotspotStatus: () => call<HotspotStatus>("get_hotspot_status"),
  openInternetSharingSettings: () =>
    call<void>("open_internet_sharing_settings"),

  getSuperDevStatus: () => call<SuperDevStatus>("get_super_dev_status"),
  setSuperDev: (enabled: boolean) =>
    call<SuperDevStatus>("set_super_dev", { enabled }),

  logFrontendError: (message: string) =>
    call<void>("log_frontend_error", { message }),
  logFrontendReady: (route: string) =>
    call<void>("log_frontend_ready", { route }),
};
