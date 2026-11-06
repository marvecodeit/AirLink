import { isTauri } from "@tauri-apps/api/core";
import { create } from "zustand";
import { api, toApiError } from "../services/api";
import { listenToAppEvents, type PageLoadEvent } from "../services/events";
import type {
  ActivityEntry,
  AppInfo,
  BrowserState,
  ConnectionState,
  CredentialList,
  LocationAuthorization,
  NavigationView,
  NetworkStatus,
  SaveCredentialRequest,
  ServerLink,
  Settings,
  SuperDevStatus,
  ToastMessage,
  ToastTone,
  VerificationResult,
} from "../types";
import { createId } from "../lib/format";
import { statusMeta } from "../lib/status";

const EMPTY_BROWSER: BrowserState = {
  open: false,
  url: null,
  title: null,
  loading: false,
  canGoBack: false,
  canGoForward: false,
  error: null,
  isSecure: false,
  onPortalDomain: false,
};

const EMPTY_CREDENTIALS: CredentialList = {
  saved: [],
  rememberedUsernames: {},
};

interface AppStore {
  status: NetworkStatus | null;
  settings: Settings | null;
  appInfo: AppInfo | null;
  credentials: CredentialList;
  browser: BrowserState;
  superDev: SuperDevStatus;
  locationAuthorization: LocationAuthorization;
  view: NavigationView;
  autoOpenPortal: boolean;
  activity: ActivityEntry[];
  toasts: ToastMessage[];
  initialized: boolean;
  initializing: boolean;
  refreshing: boolean;
  checking: boolean;
  verifying: boolean;
  openingPortal: boolean;
  savingSettings: boolean;
  locationPrompt: boolean;
  fatalError: string | null;

  init: () => Promise<void>;
  setView: (view: NavigationView) => void;
  openPortal: () => void;
  consumeAutoOpen: () => void;
  refresh: (silent?: boolean) => Promise<void>;
  checkConnection: () => Promise<void>;
  detectPortal: () => Promise<NetworkStatus | null>;
  verifyConnection: () => Promise<VerificationResult | null>;
  requestLocation: () => Promise<void>;
  saveSettings: (settings: Settings, silent?: boolean) => Promise<void>;
  reloadSettings: () => Promise<void>;
  saveCredential: (request: SaveCredentialRequest) => Promise<boolean>;
  removeCredential: (ssid: string, username: string) => Promise<boolean>;
  copyCredential: (
    ssid: string,
    username: string,
    field: "username" | "password",
  ) => Promise<void>;
  reloadCredentials: () => Promise<void>;
  setSuperDev: (enabled: boolean) => Promise<void>;
  refreshSuperDev: () => Promise<void>;
  saveServerLink: (link: ServerLink) => Promise<boolean>;
  removeServerLink: (id: string) => Promise<boolean>;
  testNotification: () => Promise<void>;
  openConfigFolder: () => Promise<void>;
  pushToast: (tone: ToastTone, title: string, description?: string) => void;
  dismissToast: (id: string) => void;
  setBrowser: (browser: BrowserState) => void;
  noteBrowserNotice: (message: string) => void;
}

let detachEvents: (() => void) | null = null;
let initPromise: Promise<void> | null = null;
let lastPortalToastFor: string | null = null;
let lastAutoOpenedFor: string | null = null;

function activityFromStatus(status: NetworkStatus, previous?: NetworkStatus): ActivityEntry | null {
  if (previous && previous.state === status.state) return null;
  const meta = statusMeta(status.state);
  const network = status.wifi.ssid ?? "Wi-Fi";
  const detail =
    status.state === "portal_detected" ||
    status.state === "authentication_required" ||
    status.state === "session_expired"
      ? `${network} needs a portal sign-in`
      : status.state === "disconnected"
        ? "Wi-Fi link lost"
        : status.state === "connecting"
          ? `Checking ${network}`
          : meta.label;
  return {
    id: createId(),
    state: status.state,
    label: meta.label,
    detail,
    at: status.lastChecked ?? new Date().toISOString(),
  };
}

export const useAppStore = create<AppStore>((set, get) => {
  const pushToast = (tone: ToastTone, title: string, description?: string) => {
    const id = createId();
    set((state) => ({
      toasts: [...state.toasts.slice(-3), { id, tone, title, description }],
    }));
    window.setTimeout(() => get().dismissToast(id), 5_000);
  };

  const applyStatus = (status: NetworkStatus, notifyPortal = true) => {
    const previous = get().status;
    const entry = activityFromStatus(status, previous ?? undefined);
    set((state) => ({
      status,
      activity: entry ? [entry, ...state.activity].slice(0, 6) : state.activity,
    }));

    if (
      notifyPortal &&
      (status.state === "portal_detected" || status.state === "session_expired") &&
      status.portal &&
      lastPortalToastFor !== `${status.wifi.ssid}:${status.portal.url}`
    ) {
      lastPortalToastFor = `${status.wifi.ssid}:${status.portal.url}`;
      pushToast(
        "warning",
        status.state === "session_expired" ? "Session expired" : "Sign-in required",
        `${status.wifi.ssid ?? "The network"} needs you to sign in to get online.`,
      );
    }

    if (
      notifyPortal &&
      status.portal &&
      document.visibilityState === "visible" &&
      get().view !== "browser"
    ) {
      const settings = get().settings;
      const profile = settings?.trustedProfiles.find(
        (item) => item.ssid === status.wifi.ssid && item.autoOpen,
      );
      if (profile && lastAutoOpenedFor !== status.portal.url) {
        lastAutoOpenedFor = status.portal.url;
        set({ view: "browser", autoOpenPortal: true });
      }
    }

    if (status.connectivity.internetAvailable) {
      lastAutoOpenedFor = null;
    }
  };

  const initEvents = async () => {
    detachEvents = await listenToAppEvents({
      onStatus: (status) => applyStatus(status),
      onTransition: (state: ConnectionState) => {
        if (state === "internet_available" || state === "authenticated") {
          lastPortalToastFor = null;
        }
      },
      onBrowserState: (browser) => set({ browser }),
      onPageLoad: (event: PageLoadEvent) => {
        set((state) => ({
          browser: {
            ...state.browser,
            url: event.url,
            loading: event.loading,
          },
        }));
      },
      onBrowserNotice: (message) =>
        pushToast("warning", "Portal browser", message),
      onMenuAction: (action) => {
        if (action === "open-portal") {
          set({ view: "browser", autoOpenPortal: true });
        } else if (action === "settings") {
          set({ view: "settings" });
        }
      },
      onMenuCheckComplete: (status) => {
        applyStatus(status, false);
        pushToast(
          status.connectivity.internetAvailable ? "success" : "warning",
          "Connection checked",
          status.message ?? status.connectivity.detail,
        );
      },
    });
  };

  return {
    status: null,
    settings: null,
    appInfo: null,
    credentials: EMPTY_CREDENTIALS,
    browser: EMPTY_BROWSER,
    superDev: {
      enabled: false,
      port: null,
      proxyUrl: null,
      service: null,
      message: null,
    },
    locationAuthorization: "not_determined",
    view: "overview",
    autoOpenPortal: false,
    activity: [],
    toasts: [],
    initialized: false,
    initializing: false,
    refreshing: false,
    checking: false,
    verifying: false,
    openingPortal: false,
    savingSettings: false,
    locationPrompt: false,
    fatalError: null,

    init: async () => {
      if (initPromise) return initPromise;
      if (get().initialized) return;

      initPromise = (async () => {
        set({ initializing: true });
        if (!isTauri()) {
          set({
            initialized: true,
            initializing: false,
            fatalError:
              "AirLink needs its native desktop shell. Run it with `npm run tauri dev`.",
          });
          return;
        }

        try {
          await initEvents();
          const [
            status,
            settings,
            appInfo,
            credentials,
            location,
            browser,
            superDev,
          ] = await Promise.all([
            api.getNetworkStatus(),
            api.getSettings(),
            api.getAppInfo(),
            api.listCredentials(),
            api.getLocationAuthorization(),
            api.getBrowserState(),
            api.getSuperDevStatus(),
          ]);

          const entry = activityFromStatus(status);
          set({
            status,
            settings,
            appInfo,
            credentials,
            locationAuthorization: location,
            browser,
            superDev,
            activity: entry ? [entry] : [],
            initialized: true,
          });
        } catch (error) {
          const apiError = toApiError(error);
          set({
            fatalError: apiError.message,
            initialized: true,
          });
        } finally {
          set({ initializing: false });
        }
      })();

      return initPromise;
    },

    setView: (view) => set({ view }),
    openPortal: () => set({ view: "browser", autoOpenPortal: true }),
    consumeAutoOpen: () => set({ autoOpenPortal: false }),

    refresh: async (silent = false) => {
      if (get().refreshing) return;
      set({ refreshing: true });
      try {
        const status = await api.refreshNetworkStatus();
        applyStatus(status, !silent);
      } catch (error) {
        pushToast("error", "Could not refresh", toApiError(error).message);
      } finally {
        set({ refreshing: false });
      }
    },

    checkConnection: async () => {
      if (get().checking) return;
      set({ checking: true });
      try {
        const status = await api.checkConnection();
        applyStatus(status);
        pushToast(
          status.connectivity.internetAvailable ? "success" : "warning",
          status.connectivity.internetAvailable
            ? "Internet connection verified"
            : "Connection needs attention",
          status.connectivity.detail,
        );
      } catch (error) {
        pushToast("error", "Check failed", toApiError(error).message);
      } finally {
        set({ checking: false });
      }
    },

    detectPortal: async () => {
      try {
        const status = await api.detectCaptivePortal();
        applyStatus(status, false);
        return status;
      } catch (error) {
        pushToast("error", "Portal detection failed", toApiError(error).message);
        return null;
      }
    },

    verifyConnection: async () => {
      if (get().verifying) return null;
      set({ verifying: true });
      try {
        const result = await api.verifyAuthentication();
        applyStatus(result.status, false);
        pushToast(
          result.verified ? "success" : "warning",
          result.verified ? "Sign-in verified" : "Not verified yet",
          result.message,
        );
        return result;
      } catch (error) {
        pushToast("error", "Verification failed", toApiError(error).message);
        return null;
      } finally {
        set({ verifying: false });
      }
    },

    requestLocation: async () => {
      if (get().locationPrompt) return;
      set({ locationPrompt: true });
      try {
        const authorization = await api.requestLocationAuthorization();
        set({ locationAuthorization: authorization });
        if (authorization === "authorized") {
          await get().refresh(true);
          pushToast(
            "success",
            "Network name unlocked",
            "macOS now lets AirLink read the Wi-Fi network name.",
          );
        } else if (authorization === "denied" || authorization === "restricted") {
          pushToast(
            "warning",
            "Location access not granted",
            "You can enable AirLink in System Settings › Privacy & Security › Location Services.",
          );
          await api.openLocationSettings().catch(() => undefined);
        }
      } catch (error) {
        pushToast("error", "Permission request failed", toApiError(error).message);
      } finally {
        set({ locationPrompt: false });
      }
    },

    saveSettings: async (settings, silent = false) => {
      set({ savingSettings: true });
      try {
        const saved = await api.updateSettings(settings);
        set({ settings: saved });
        if (!silent) pushToast("success", "Settings saved");
      } catch (error) {
        const apiError = toApiError(error);
        pushToast("error", "Settings not saved", apiError.message);
        throw apiError;
      } finally {
        set({ savingSettings: false });
      }
    },

    reloadSettings: async () => {
      try {
        const settings = await api.getSettings();
        set({ settings });
      } catch (error) {
        pushToast("error", "Could not load settings", toApiError(error).message);
      }
    },

    saveCredential: async (request) => {
      try {
        const settings = await api.saveCredential(request);
        const credentials = await api.listCredentials();
        set({ settings, credentials });
        pushToast(
          "success",
          "Credential saved",
          `Stored securely in your macOS Keychain for ${request.ssid}.`,
        );
        return true;
      } catch (error) {
        pushToast("error", "Could not save credential", toApiError(error).message);
        return false;
      }
    },

    removeCredential: async (ssid, username) => {
      try {
        const settings = await api.removeCredential(ssid, username);
        const credentials = await api.listCredentials();
        set({ settings, credentials });
        pushToast("success", "Credential removed", "The Keychain item was deleted.");
        return true;
      } catch (error) {
        pushToast("error", "Could not remove credential", toApiError(error).message);
        return false;
      }
    },

    copyCredential: async (ssid, username, field) => {
      try {
        const message = await api.copyCredential(ssid, username, field);
        pushToast("info", field === "password" ? "Password copied" : "Username copied", message);
      } catch (error) {
        pushToast("error", "Could not copy", toApiError(error).message);
      }
    },

    setSuperDev: async (enabled) => {
      try {
        const status = await api.setSuperDev(enabled);
        set({ superDev: status });
        pushToast(
          enabled ? "success" : "info",
          enabled ? "Super Dev is on" : "Super Dev is off",
          status.message ??
            (enabled
              ? "Safari and Chrome now use AirLink's local proxy."
              : "Your previous macOS proxy settings were restored."),
        );
      } catch (error) {
        pushToast("error", "Could not change Super Dev", toApiError(error).message);
        throw error;
      }
    },

    refreshSuperDev: async () => {
      try {
        const superDev = await api.getSuperDevStatus();
        set({ superDev });
      } catch (error) {
        pushToast("error", "Could not read Super Dev", toApiError(error).message);
      }
    },

    saveServerLink: async (link) => {
      const settings = get().settings;
      if (!settings) return false;
      const next = {
        ...settings,
        serverLinks: [
          ...settings.serverLinks.filter((item) => item.url !== link.url),
          link,
        ].slice(-50),
      };
      try {
        await get().saveSettings(next, true);
        pushToast("success", "Link saved", link.name);
        return true;
      } catch {
        return false;
      }
    },

    removeServerLink: async (id) => {
      const settings = get().settings;
      if (!settings) return false;
      try {
        await get().saveSettings(
          {
            ...settings,
            serverLinks: settings.serverLinks.filter((item) => item.id !== id),
          },
          true,
        );
        return true;
      } catch {
        return false;
      }
    },

    reloadCredentials: async () => {
      try {
        const credentials = await api.listCredentials();
        set({ credentials });
      } catch (error) {
        pushToast("error", "Could not load credentials", toApiError(error).message);
      }
    },

    testNotification: async () => {
      try {
        await api.sendTestNotification();
        pushToast("info", "Test notification sent");
      } catch (error) {
        pushToast("error", "Notification failed", toApiError(error).message);
      }
    },

    openConfigFolder: async () => {
      try {
        await api.openConfigFolder();
      } catch (error) {
        pushToast("error", "Could not open folder", toApiError(error).message);
      }
    },

    pushToast,
    dismissToast: (id) =>
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
    setBrowser: (browser) => set({ browser }),
    noteBrowserNotice: (message) => pushToast("warning", "Portal browser", message),
  };
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    detachEvents?.();
    detachEvents = null;
    initPromise = null;
  });
}
