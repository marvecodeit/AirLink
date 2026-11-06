import clsx from "clsx";
import {
  Bell,
  CircleCheck,
  FolderOpen,
  Globe2,
  Info,
  KeyRound,
  LockKeyhole,
  Monitor,
  Moon,
  Network,
  Palette,
  Plus,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SoftwareUpdates } from "../components/SoftwareUpdates";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CopyButton } from "../components/ui/CopyButton";
import { Hint, Input, Label, SettingsRow } from "../components/ui/Field";
import { Toggle } from "../components/ui/Toggle";
import { Segmented } from "../components/ui/Segmented";
import {
  createId,
  isValidHttpUrl,
  normalizeDomain,
  prettyHost,
} from "../lib/format";
import { useAppStore } from "../stores/appStore";
import type {
  NetworkProfile,
  ProbeEndpoint,
  Settings,
  ThemeMode,
} from "../types";

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const draftFromStore = settings;

  if (!draftFromStore) {
    return (
      <div className="animate-fade-in space-y-5">
        <Card className="h-[260px] animate-pulse bg-surface-muted/60" />
        <Card className="h-[180px] animate-pulse bg-surface-muted/60" />
      </div>
    );
  }

  return <SettingsContent key={draftFromStore.version} settings={draftFromStore} />;
}

function SettingsContent({ settings }: { settings: Settings }) {
  const status = useAppStore((state) => state.status);
  const saveSettings = useAppStore((state) => state.saveSettings);
  const savingSettings = useAppStore((state) => state.savingSettings);
  const testNotification = useAppStore((state) => state.testNotification);
  const pushToast = useAppStore((state) => state.pushToast);
  const openConfigFolder = useAppStore((state) => state.openConfigFolder);
  const appInfo = useAppStore((state) => state.appInfo);

  const [draft, setDraft] = useState<Settings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const update = async (patch: Partial<Settings>, silent = true) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    try {
      await saveSettings(next, silent);
    } catch {
      setDraft(settings);
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
    await update({ notifications: enabled });
    if (enabled) {
      await testNotification();
    }
  };

  return (
    <div className="animate-fade-up mx-auto max-w-[840px] space-y-5">
      <Section
        icon={Settings2}
        title="General"
        description="How AirLink behaves on this Mac."
      >
        <div className="divide-y divide-hairline">
          <SettingsRow
            title="Launch at login"
            description="Start AirLink automatically when you sign in to your Mac. Requires the app to live in your Applications folder."
          >
            <Toggle
              label="Launch at login"
              checked={draft.launchAtLogin}
              disabled={savingSettings}
              onChange={(checked) => void update({ launchAtLogin: checked }, false)}
            />
          </SettingsRow>
          <SettingsRow
            title="Keep running in the menu bar"
            description="Closing the window hides it and keeps monitoring active. Turn this off to quit when the window closes."
          >
            <Toggle
              label="Keep running in the menu bar"
              checked={draft.keepInMenuBar}
              disabled={savingSettings}
              onChange={(checked) => void update({ keepInMenuBar: checked })}
            />
          </SettingsRow>
          <SettingsRow
            title="Automatic portal detection"
            description="Probe the network in the background and surface captive portals. When off, checks only run when you ask."
          >
            <Toggle
              label="Automatic portal detection"
              checked={draft.autoDetectPortal}
              disabled={savingSettings}
              onChange={(checked) => void update({ autoDetectPortal: checked })}
            />
          </SettingsRow>
          <SettingsRow
            title="Verify after portal navigation"
            description="After the portal page finishes loading, quietly test whether the Mac's system-wide internet access is working."
          >
            <Toggle
              label="Verify after portal navigation"
              checked={draft.autoVerify}
              disabled={savingSettings}
              onChange={(checked) => void update({ autoVerify: checked })}
            />
          </SettingsRow>
        </div>
      </Section>

      <Section
        icon={Palette}
        title="Appearance"
        description="Match macOS or choose a fixed appearance."
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Segmented<ThemeMode>
            label="Appearance"
            value={draft.theme}
            onChange={(theme) => void update({ theme })}
            options={[
              { value: "system", label: "System", icon: <Monitor className="h-3 w-3" /> },
              { value: "light", label: "Light", icon: <Sun className="h-3 w-3" /> },
              { value: "dark", label: "Dark", icon: <Moon className="h-3 w-3" /> },
            ]}
          />
          <div className="flex items-center gap-2">
            <div className="flex h-12 w-[92px] items-center gap-1.5 rounded-lg border border-hairline bg-canvas p-2 shadow-inner">
              <span className="h-full w-4 rounded-sm bg-sidebar ring-1 ring-hairline" />
              <div className="flex h-full flex-1 flex-col justify-between">
                <span className="h-1.5 w-full rounded-full bg-brand/50" />
                <span className="h-1.5 w-2/3 rounded-full bg-hairline-strong" />
                <span className="h-4 w-full rounded-sm bg-surface ring-1 ring-hairline" />
              </div>
            </div>
            <p className="max-w-[150px] text-[10.5px] leading-relaxed text-ink-tertiary">
              The interface follows your selection immediately.
            </p>
          </div>
        </div>
      </Section>

      <Section
        icon={Bell}
        title="Notifications"
        description="Native macOS alerts for connection changes."
      >
        <div className="divide-y divide-hairline">
          <SettingsRow
            title="Show notifications"
            description="Portal detected, authentication required, internet restored, Wi-Fi disconnected, and session expired."
          >
            <Toggle
              label="Show notifications"
              checked={draft.notifications}
              disabled={savingSettings}
              onChange={(checked) => void toggleNotifications(checked)}
            />
          </SettingsRow>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!draft.notifications}
            onClick={() => void testNotification()}
          >
            Send test notification
          </Button>
          <p className="text-[10.5px] text-ink-tertiary">
            macOS may ask for permission the first time. Manage alerts in System
            Settings › Notifications.
          </p>
        </div>
      </Section>

      <ConnectivitySection
        settings={settings}
        draft={draft}
        update={update}
        pushToast={pushToast}
      />

      {appInfo?.platform === "linux" ? null : <SuperDevSection />}

      <ProfilesSection
        settings={settings}
        saveSettings={saveSettings}
        pushToast={pushToast}
        currentSsid={status?.wifi.ssid ?? null}
      />

      <CredentialsSection currentSsid={status?.wifi.ssid ?? null} />

      <Section
        icon={ShieldCheck}
        title="Privacy & local data"
        description="AirLink runs entirely on this Mac."
      >
        <div className="grid gap-2.5">
          <PrivacyLine
            icon={ShieldCheck}
            title="No account, cloud, or analytics"
            description="Nothing is synced or sent to marvecodeit. Connectivity probes go only to the endpoints listed above."
          />
          <PrivacyLine
            icon={KeyRound}
            title="Credentials stay in Keychain"
            description="Passwords are stored as macOS Keychain items. They are never written to settings, logs, or localStorage, and never auto-filled into web pages."
          />
          <PrivacyLine
            icon={Globe2}
            title="Location access is only for SSID"
            description="macOS gates Wi-Fi names behind Location Services. AirLink neither records nor transmits location data."
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void openConfigFolder()}
            icon={<FolderOpen className="h-3.5 w-3.5" />}
          >
            Open configuration folder
          </Button>
        </div>
      </Section>

      <Section icon={Info} title="About" description="Product and build information.">
        <div className="flex flex-wrap items-start gap-4">
          <img
            src="/app-icon.png"
            alt="AirLink icon"
            className="h-14 w-14 rounded-2xl shadow-[0_8px_24px_-12px_rgba(14,80,36,0.6)] ring-1 ring-black/5 dark:ring-white/10"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
                {appInfo?.name ?? "AirLink"}
              </h3>
              <span className="rounded-full border border-hairline bg-surface-muted px-2 py-0.5 font-mono text-[10px] text-ink-tertiary">
                v{appInfo?.version ?? "1.0.0"}
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] text-ink-secondary">
              {appInfo?.tagline ?? "Campus Wi-Fi, without the guesswork."}
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-tertiary">
              Designed and built by{" "}
              <span className="font-medium text-ink-secondary">
                {appInfo?.developer ?? "marvecodeit"}
              </span>
              .
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 border-t border-hairline pt-4 text-[10.5px] text-ink-tertiary sm:grid-cols-2">
          <p>
            <span className="text-ink-secondary">Runtime</span> · Tauri 2 ·
            Rust ·{" "}
            {appInfo?.platform === "linux" ? "WebKitGTK" : "WKWebView"}
          </p>
          <p>
            <span className="text-ink-secondary">Interface</span> · React ·
            TypeScript · Tailwind CSS
          </p>
          <p>
            <span className="text-ink-secondary">Network</span> ·{" "}
            {appInfo?.platform === "linux"
              ? "NetworkManager · iw"
              : "CoreWLAN · SystemConfiguration"}
          </p>
          <p>
            <span className="text-ink-secondary">Bundle</span> ·{" "}
            {appInfo?.identifier ?? "com.marvecodeit.airlink"}
          </p>
        </div>
        <p className="mt-4 text-[10px] text-ink-tertiary">
          {appInfo?.copyright ??
            "© 2026 marvecodeit"}
        </p>
      </Section>

      {appInfo?.platform === "linux" ? null : <SoftwareUpdates />}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: typeof Settings2;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={clsx("p-5", className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-muted text-ink-secondary">
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-[10.5px] text-ink-tertiary">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function PrivacyLine({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-surface-muted/60 px-3 py-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
      <div>
        <p className="text-[11.5px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-tertiary">
          {description}
        </p>
      </div>
    </div>
  );
}

type EndpointDraft = { http: ProbeEndpoint[]; https: ProbeEndpoint[] };

function ConnectivitySection({
  settings,
  draft,
  update,
  pushToast,
}: {
  settings: Settings;
  draft: Settings;
  update: (patch: Partial<Settings>, silent?: boolean) => Promise<void>;
  pushToast: (tone: "success" | "error" | "info" | "warning", title: string, description?: string) => void;
}) {
  const saveSettings = useAppStore((state) => state.saveSettings);
  const [endpoints, setEndpoints] = useState<EndpointDraft>({
    http: settings.httpProbes,
    https: settings.httpsProbes,
  });
  const [saving, setSaving] = useState(false);

  const dirty =
    JSON.stringify(endpoints.http) !== JSON.stringify(settings.httpProbes) ||
    JSON.stringify(endpoints.https) !== JSON.stringify(settings.httpsProbes);

  const patchEndpoint = (
    protocol: "http" | "https",
    id: string,
    patch: Partial<ProbeEndpoint>,
  ) => {
    setEndpoints((current) => ({
      ...current,
      [protocol]: current[protocol].map((endpoint) =>
        endpoint.id === id ? { ...endpoint, ...patch } : endpoint,
      ),
    }));
  };

  const addEndpoint = (protocol: "http" | "https") => {
    setEndpoints((current) => ({
      ...current,
      [protocol]: [
        ...current[protocol],
        {
          id: createId(),
          name: "Custom check",
          url: protocol === "https" ? "https://" : "http://",
          expectedStatus: protocol === "https" ? 204 : 200,
          expectedBodyContains: null,
        },
      ],
    }));
  };

  const removeEndpoint = (protocol: "http" | "https", id: string) => {
    setEndpoints((current) => ({
      ...current,
      [protocol]: current[protocol].filter((endpoint) => endpoint.id !== id),
    }));
  };

  const validate = (protocol: "http" | "https", endpoint: ProbeEndpoint): string | null => {
    if (!isValidHttpUrl(endpoint.url)) return "Every probe needs a valid http(s) URL.";
    try {
      const parsed = new URL(endpoint.url);
      if (parsed.protocol !== `${protocol}:`) {
        return `${protocol.toUpperCase()} checks must use ${protocol}:// URLs.`;
      }
    } catch {
      return "Every probe needs a valid http(s) URL.";
    }
    if (
      endpoint.expectedStatus !== null &&
      (endpoint.expectedStatus < 100 || endpoint.expectedStatus > 599)
    ) {
      return "Expected status must be between 100 and 599.";
    }
    return null;
  };

  const saveEndpoints = async () => {
    if (endpoints.http.length === 0 || endpoints.https.length === 0) {
      pushToast(
        "warning",
        "Keep at least one check",
        "AirLink needs both HTTP and HTTPS probes to distinguish a portal from a real internet connection.",
      );
      return;
    }
    for (const endpoint of endpoints.http) {
      const error = validate("http", endpoint);
      if (error) return pushToast("error", "Check your HTTP probes", error);
    }
    for (const endpoint of endpoints.https) {
      const error = validate("https", endpoint);
      if (error) return pushToast("error", "Check your HTTPS probes", error);
    }

    const normalized = {
      http: endpoints.http.map((endpoint) => ({
        ...endpoint,
        name: endpoint.name.trim() || endpoint.url,
        expectedBodyContains: endpoint.expectedBodyContains?.trim() || null,
      })),
      https: endpoints.https.map((endpoint) => ({
        ...endpoint,
        name: endpoint.name.trim() || endpoint.url,
        expectedBodyContains: endpoint.expectedBodyContains?.trim() || null,
      })),
    };

    setSaving(true);
    try {
      await saveSettings(
        { ...settings, httpProbes: normalized.http, httpsProbes: normalized.https },
        false,
      );
      setEndpoints(normalized);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      icon={Network}
      title="Connectivity checks"
      description="Control how AirLink tests for a real internet connection."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="poll-interval">Check background link every</Label>
          <div className="relative">
            <select
              id="poll-interval"
              value={draft.pollIntervalSecs}
              onChange={(event) =>
                void update({ pollIntervalSecs: Number(event.target.value) })
              }
              className="h-9 w-full appearance-none rounded-[9px] border border-hairline-strong bg-surface px-3 pr-8 text-[13px] text-ink outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/12"
            >
              {[8, 10, 15, 30].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} seconds
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="probe-interval">Probe internet every</Label>
          <select
            id="probe-interval"
            value={draft.portalCheckIntervalSecs}
            onChange={(event) =>
              void update({ portalCheckIntervalSecs: Number(event.target.value) })
            }
            className="h-9 w-full appearance-none rounded-[9px] border border-hairline-strong bg-surface px-3 pr-8 text-[13px] text-ink outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/12"
          >
            {[15, 30, 45, 60, 120].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} seconds
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="probe-timeout">Probe timeout</Label>
          <select
            id="probe-timeout"
            value={draft.probeTimeoutSecs}
            onChange={(event) =>
              void update({ probeTimeoutSecs: Number(event.target.value) })
            }
            className="h-9 w-full appearance-none rounded-[9px] border border-hairline-strong bg-surface px-3 pr-8 text-[13px] text-ink outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/12"
          >
            {[4, 6, 8, 10].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} seconds
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <EndpointGroup
          protocol="http"
          title="HTTP interception probes"
          description="Expected clean responses. Redirects or sign-in pages reveal a captive portal."
          endpoints={endpoints.http}
          onPatch={(id, patch) => patchEndpoint("http", id, patch)}
          onRemove={(id) => removeEndpoint("http", id)}
          onAdd={() => addEndpoint("http")}
        />
        <EndpointGroup
          protocol="https"
          title="HTTPS internet probes"
          description="A verified HTTPS success is the only proof of system-wide internet access."
          endpoints={endpoints.https}
          onPatch={(id, patch) => patchEndpoint("https", id, patch)}
          onRemove={(id) => removeEndpoint("https", id)}
          onAdd={() => addEndpoint("https")}
        />
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-4">
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!dirty}
          onClick={() => void saveEndpoints()}
        >
          Save checks
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!dirty || saving}
          onClick={() =>
            setEndpoints({
              http: settings.httpProbes,
              https: settings.httpsProbes,
            })
          }
        >
          Discard
        </Button>
        {dirty ? (
          <span className="text-[10.5px] text-warning">Unsaved changes</span>
        ) : (
          <span className="flex items-center gap-1 text-[10.5px] text-ink-tertiary">
            <CircleCheck className="h-3 w-3 text-brand" />
            Using saved probes
          </span>
        )}
      </div>
    </Section>
  );
}

function EndpointGroup({
  protocol,
  title,
  description,
  endpoints,
  onPatch,
  onRemove,
  onAdd,
}: {
  protocol: "http" | "https";
  title: string;
  description: string;
  endpoints: ProbeEndpoint[];
  onPatch: (id: string, patch: Partial<ProbeEndpoint>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-muted/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-hairline bg-surface px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-tertiary">
              {protocol}
            </span>
            <p className="text-[11.5px] font-medium text-ink">{title}</p>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-ink-tertiary">
            {description}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          onClick={onAdd}
          icon={<Plus className="h-3 w-3" />}
        >
          Add
        </Button>
      </div>
      <div className="mt-2.5 space-y-2">
        {endpoints.map((endpoint) => (
          <div
            key={endpoint.id}
            className="grid grid-cols-[minmax(0,1fr)_74px_96px_24px] items-center gap-1.5"
          >
            <Input
              value={endpoint.url}
              onChange={(event) => onPatch(endpoint.id, { url: event.target.value })}
              className="h-8 font-mono text-[10.5px]"
              aria-label={`${protocol} probe URL`}
              spellCheck={false}
            />
            <Input
              type="number"
              min={100}
              max={599}
              value={endpoint.expectedStatus ?? ""}
              onChange={(event) =>
                onPatch(endpoint.id, {
                  expectedStatus: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
              className="h-8 px-2 text-center font-mono text-[10.5px]"
              aria-label="Expected HTTP status"
              title="Expected status"
            />
            <Input
              value={endpoint.expectedBodyContains ?? ""}
              onChange={(event) =>
                onPatch(endpoint.id, {
                  expectedBodyContains: event.target.value || null,
                })
              }
              className="h-8 text-[10.5px]"
              placeholder="Body text"
              aria-label="Expected body text"
              title="Optional expected body text"
            />
            <button
              type="button"
              onClick={() => onRemove(endpoint.id)}
              aria-label="Remove probe"
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SuperDevSection() {
  const superDev = useAppStore((state) => state.superDev);
  const setSuperDev = useAppStore((state) => state.setSuperDev);
  const refreshSuperDev = useAppStore((state) => state.refreshSuperDev);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void refreshSuperDev();
  }, [refreshSuperDev]);

  const toggle = async (enabled: boolean) => {
    setWorking(true);
    try {
      await setSuperDev(enabled);
    } catch {
      // Store already surfaced the error.
    } finally {
      setWorking(false);
    }
  };

  return (
    <Section
      icon={Wand2}
      title="Super Dev"
      description="Route Safari and Chrome through AirLink for local Wi-Fi links."
    >
      <SettingsRow
        title="Local proxy for system browsers"
        description="Starts a localhost-only HTTP/HTTPS proxy and points the active macOS network service at it. This is for http:// server links on your Wi-Fi that Chrome or Safari refuse to open normally."
      >
        <Toggle
          label="Super Dev local proxy"
          checked={superDev.enabled}
          disabled={working}
          onChange={(enabled) => void toggle(enabled)}
        />
      </SettingsRow>

      {superDev.enabled ? (
        <div className="mt-3 rounded-lg border border-brand/20 bg-brand-soft/60 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium text-brand-ink">
                Proxy active for {superDev.service ?? "the active network"}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-ink-secondary">
                {superDev.proxyUrl}
              </p>
            </div>
            {superDev.proxyUrl ? (
              <CopyButton value={superDev.proxyUrl} label="Copy proxy address" size="md" />
            ) : null}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-secondary">
            Turn on Chrome/Safari now and open your local http:// links. HTTPS
            traffic is tunneled untouched; certificates are never bypassed.
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning-soft px-2.5 py-2">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
        <p className="text-[10px] leading-relaxed text-ink-secondary">
          Enabling Super Dev changes the macOS system proxy for the active
          network service. AirLink restores the previous proxy when you turn it
          off, quit, or launch after an unexpected exit. If another proxy is
          already configured, that configuration is restored exactly.
        </p>
      </div>
    </Section>
  );
}

function ProfilesSection({
  settings,
  saveSettings,
  pushToast,
  currentSsid,
}: {
  settings: Settings;
  saveSettings: (settings: Settings, silent?: boolean) => Promise<void>;
  pushToast: (tone: "success" | "error" | "info" | "warning", title: string, description?: string) => void;
  currentSsid: string | null;
}) {
  const [showForm, setShowForm] = useState(false);
  const [ssid, setSsid] = useState(currentSsid ?? "");
  const [portalUrl, setPortalUrl] = useState("");
  const [domains, setDomains] = useState("");
  const [autoOpen, setAutoOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ssid && currentSsid) setSsid(currentSsid);
  }, [currentSsid, ssid]);

  const addProfile = async () => {
    const cleanSsid = ssid.trim();
    if (!cleanSsid) {
      pushToast("warning", "Network name required");
      return;
    }
    if (portalUrl.trim() && !isValidHttpUrl(portalUrl)) {
      pushToast("warning", "Check the portal URL", "Use an http:// or https:// address.");
      return;
    }
    if (settings.trustedProfiles.some((profile) => profile.ssid === cleanSsid)) {
      pushToast("warning", "Profile already exists", "Remove it first to change its settings.");
      return;
    }

    const trustedDomains = domains
      .split(/[,\n]/)
      .map(normalizeDomain)
      .filter(Boolean);

    const profile: NetworkProfile = {
      id: createId(),
      ssid: cleanSsid,
      portalUrl: portalUrl.trim() || null,
      trustedDomains: Array.from(new Set(trustedDomains)),
      autoOpen,
      createdAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      await saveSettings(
        { ...settings, trustedProfiles: [...settings.trustedProfiles, profile] },
        false,
      );
      setShowForm(false);
      setPortalUrl("");
      setDomains("");
      setAutoOpen(false);
    } catch {
      /* store surfaced the error */
    } finally {
      setSaving(false);
    }
  };

  const removeProfile = async (id: string) => {
    try {
      await saveSettings({
        ...settings,
        trustedProfiles: settings.trustedProfiles.filter(
          (profile) => profile.id !== id,
        ),
      });
    } catch {
      /* store surfaced the error */
    }
  };

  const setProfileAutoOpen = async (profile: NetworkProfile, enabled: boolean) => {
    try {
      await saveSettings({
        ...settings,
        trustedProfiles: settings.trustedProfiles.map((item) =>
          item.id === profile.id ? { ...item, autoOpen: enabled } : item,
        ),
      });
    } catch {
      /* store surfaced the error */
    }
  };

  return (
    <Section
      icon={Globe2}
      title="Trusted networks"
      description="Campus profiles help identify the right portal and its trusted domains."
    >
      {settings.trustedProfiles.length ? (
        <div className="space-y-2">
          {settings.trustedProfiles.map((profile) => (
            <div
              key={profile.id}
              className="rounded-xl border border-hairline bg-surface-muted/50 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[12px] font-semibold text-ink">
                      {profile.ssid}
                    </p>
                    {profile.ssid === currentSsid ? (
                      <span className="rounded-full border border-brand/20 bg-brand-soft px-1.5 py-0.5 text-[9px] font-medium text-brand-ink">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[10.5px] text-ink-tertiary">
                    {profile.portalUrl
                      ? prettyHost(profile.portalUrl)
                      : "Portal URL detected at sign-in"}
                  </p>
                  {profile.trustedDomains.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {profile.trustedDomains.map((domain) => (
                        <span
                          key={domain}
                          className="rounded border border-hairline bg-surface px-1.5 py-0.5 font-mono text-[9px] text-ink-tertiary"
                        >
                          {domain}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-2 text-[10.5px] text-ink-secondary">
                    <span className="hidden sm:inline">Auto-open</span>
                    <Toggle
                      label={`Auto-open portal for ${profile.ssid}`}
                      checked={profile.autoOpen}
                      onChange={(checked) =>
                        void setProfileAutoOpen(profile, checked)
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeProfile(profile.id)}
                    aria-label={`Remove ${profile.ssid}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center">
          <Globe2 className="mx-auto h-5 w-5 text-ink-tertiary" />
          <p className="mt-2 text-[11.5px] font-medium text-ink">No trusted networks yet</p>
          <p className="mt-0.5 text-[10.5px] text-ink-tertiary">
            Add your campus SSID so AirLink can mark its portal as trusted.
          </p>
        </div>
      )}

      {showForm ? (
        <div className="mt-4 rounded-xl border border-brand/20 bg-brand-soft/40 p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-ink">Add a campus network</p>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              aria-label="Close form"
              className="rounded-md p-1 text-ink-tertiary hover:bg-surface hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="profile-ssid">Wi-Fi network name (SSID)</Label>
              <Input
                id="profile-ssid"
                value={ssid}
                onChange={(event) => setSsid(event.target.value)}
                placeholder="CampusNet"
                spellCheck={false}
              />
            </div>
            <div>
              <Label htmlFor="profile-portal">Portal URL (optional)</Label>
              <Input
                id="profile-portal"
                value={portalUrl}
                onChange={(event) => setPortalUrl(event.target.value)}
                placeholder="https://portal.example.edu"
                spellCheck={false}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="profile-domains">Trusted auth domains (optional)</Label>
              <Input
                id="profile-domains"
                value={domains}
                onChange={(event) => setDomains(event.target.value)}
                placeholder="example.edu, login.example.edu"
                spellCheck={false}
              />
              <Hint>
                Comma-separated hosts that belong to your campus sign-in flow.
                These are used only for the trusted-domain indicator; navigation
                is never blocked mid-authentication.
              </Hint>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] text-ink-secondary">
              <Toggle
                label="Auto-open portal for this network"
                checked={autoOpen}
                onChange={setAutoOpen}
              />
              Open the portal automatically while AirLink is visible
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              onClick={() => void addProfile()}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              Add network
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => setShowForm(true)}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Add trusted network
        </Button>
      )}
    </Section>
  );
}

function CredentialsSection({ currentSsid }: { currentSsid: string | null }) {
  const credentials = useAppStore((state) => state.credentials);
  const saveCredential = useAppStore((state) => state.saveCredential);
  const removeCredential = useAppStore((state) => state.removeCredential);
  const copyCredential = useAppStore((state) => state.copyCredential);
  const pushToast = useAppStore((state) => state.pushToast);

  const [ssid, setSsid] = useState(currentSsid ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [rememberUsername, setRememberUsername] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ssid && currentSsid) setSsid(currentSsid);
  }, [currentSsid, ssid]);

  useEffect(() => {
    if (ssid && credentials.rememberedUsernames[ssid]) {
      setUsername(credentials.rememberedUsernames[ssid]);
    }
  }, [credentials.rememberedUsernames, ssid]);

  const savedKeys = new Set(
    credentials.saved.map((item) => `${item.ssid}::${item.username.toLowerCase()}`),
  );
  const usernameOnly = Object.entries(credentials.rememberedUsernames).filter(
    ([network, name]) => !savedKeys.has(`${network}::${name.toLowerCase()}`),
  );

  const save = async () => {
    if (!ssid.trim() || !username.trim()) {
      pushToast("warning", "Network and username required");
      return;
    }
    if (!rememberPassword && !rememberUsername) {
      pushToast("warning", "Choose what to remember", "Both options are off.");
      return;
    }
    if (rememberPassword && !password) {
      pushToast("warning", "Enter the password to save it");
      return;
    }

    setSaving(true);
    const ok = await saveCredential({
      ssid: ssid.trim(),
      username: username.trim(),
      password,
      rememberPassword,
      rememberUsername,
    });
    setSaving(false);
    if (ok) {
      setPassword("");
      setRememberPassword(false);
    }
  };

  return (
    <Section
      icon={KeyRound}
      title="Credentials"
      description="Stored in the macOS Keychain, never auto-filled into a portal."
    >
      <div className="space-y-2">
        {credentials.saved.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-surface-muted/50 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <KeyRound className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-medium text-ink">
                  {item.ssid}
                </p>
                <p className="flex items-center gap-1 truncate text-[10px] text-ink-tertiary">
                  <UserRound className="h-2.5 w-2.5" />
                  {item.username}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="px-2"
                onClick={() => void copyCredential(item.ssid, item.username, "username")}
              >
                Copy username
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="px-2"
                onClick={() => void copyCredential(item.ssid, item.username, "password")}
                icon={<LockKeyhole className="h-3 w-3" />}
              >
                Copy password
              </Button>
              <button
                type="button"
                onClick={() => void removeCredential(item.ssid, item.username)}
                aria-label={`Remove credential for ${item.ssid}`}
                className="flex h-7 w-7 items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {usernameOnly.map(([network, name]) => (
          <div
            key={`${network}-${name}`}
            className="flex items-center justify-between gap-2 rounded-xl border border-hairline bg-surface-muted/50 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-tertiary ring-1 ring-hairline">
                <UserRound className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-medium text-ink">{network}</p>
                <p className="truncate text-[10px] text-ink-tertiary">{name} · username only</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="px-2"
                onClick={() => void copyCredential(network, name, "username")}
              >
                Copy username
              </Button>
              <button
                type="button"
                onClick={() => void removeCredential(network, name)}
                aria-label={`Forget username for ${network}`}
                className="flex h-7 w-7 items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {!credentials.saved.length && !usernameOnly.length ? (
          <div className="rounded-xl border border-dashed border-hairline px-4 py-5 text-center">
            <KeyRound className="mx-auto h-5 w-5 text-ink-tertiary" />
            <p className="mt-2 text-[11.5px] font-medium text-ink">No saved credentials</p>
            <p className="mt-0.5 text-[10.5px] text-ink-tertiary">
              Saving is optional. Enter your campus login when you need it.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-hairline bg-surface-muted/50 p-3.5">
        <p className="mb-3 text-[11.5px] font-semibold text-ink">Add a credential</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="credential-ssid">Network (SSID)</Label>
            <Input
              id="credential-ssid"
              value={ssid}
              onChange={(event) => setSsid(event.target.value)}
              placeholder="CampusNet"
              spellCheck={false}
            />
          </div>
          <div>
            <Label htmlFor="credential-username">Username</Label>
            <Input
              id="credential-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="student-id"
              autoComplete="username"
              spellCheck={false}
            />
          </div>
          <div>
            <Label htmlFor="credential-password">Password</Label>
            <Input
              id="credential-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={!rememberPassword}
            />
          </div>
        </div>

        <div className="mt-3 space-y-2.5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium text-ink">
                Save password in Keychain
              </p>
              <p className="text-[10px] text-ink-tertiary">
                Explicit consent required. Enables Copy password later.
              </p>
            </div>
            <Toggle
              label="Save password in Keychain"
              checked={rememberPassword}
              onChange={setRememberPassword}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium text-ink">Remember username</p>
              <p className="text-[10px] text-ink-tertiary">
                Usernames are stored in local settings, never in the web app.
              </p>
            </div>
            <Toggle
              label="Remember username"
              checked={rememberUsername}
              onChange={setRememberUsername}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-[360px] text-[10px] leading-relaxed text-ink-tertiary">
            AirLink never submits these values to a website. Use Copy in the
            Keychain list, then paste into the portal yourself.
          </p>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={() => void save()}
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
          >
            Save securely
          </Button>
        </div>
      </div>
    </Section>
  );
}
