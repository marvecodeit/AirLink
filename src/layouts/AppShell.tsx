import clsx from "clsx";
import {
  ChevronRight,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  RadioTower,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark, SignalBars } from "../components/BrandMark";
import { Button } from "../components/ui/Button";
import { StatusPill } from "../components/StatusPill";
import { networkDisplayName } from "../lib/format";
import { statusMeta } from "../lib/status";
import { useAppStore } from "../stores/appStore";
import type { NavigationView } from "../types";

const pages: Record<
  NavigationView,
  { title: string; description: string; icon: typeof Globe2 }
> = {
  overview: {
    title: "Overview",
    description: "Your Wi-Fi, connection health, and next step.",
    icon: LayoutDashboard,
  },
  browser: {
    title: "Browser",
    description: "Portals and local Wi-Fi server links, in one browser.",
    icon: Globe2,
  },
  hotspot: {
    title: "Hotspot",
    description: "Share this Mac's connection with macOS Internet Sharing.",
    icon: RadioTower,
  },
  settings: {
    title: "Settings",
    description: "Preferences, networks, and privacy.",
    icon: Settings2,
  },
};

const navigation: { view: NavigationView; label: string; icon: typeof Globe2 }[] = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "browser", label: "Browser", icon: Globe2 },
  { view: "hotspot", label: "Hotspot", icon: RadioTower },
  { view: "settings", label: "Settings", icon: Settings2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  const status = useAppStore((state) => state.status);
  const refreshing = useAppStore((state) => state.refreshing);
  const checking = useAppStore((state) => state.checking);
  const refresh = useAppStore((state) => state.refresh);
  const checkConnection = useAppStore((state) => state.checkConnection);
  const appInfo = useAppStore((state) => state.appInfo);
  const requestLocation = useAppStore((state) => state.requestLocation);
  const locationPrompt = useAppStore((state) => state.locationPrompt);

  const meta = status ? statusMeta(status.state) : null;
  const ssid = networkDisplayName(
    status?.wifi.ssid ?? null,
    status?.wifi.ssidRestricted ?? false,
  );
  const page = pages[view];
  const isLinux = appInfo?.platform === "linux";

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Drag strip above the sidebar. Traffic lights live in this strip; the
          header below is also a drag region, but its buttons stay interactive. */}
      <div
        data-tauri-drag-region
        className="fixed left-0 top-0 z-50 h-11 w-[236px]"
      />

      <aside className="fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col border-r border-hairline bg-sidebar/95 backdrop-blur-xl">
        <div className="px-4 pb-5 pt-[52px]">
          <BrandMark />
        </div>

        <nav className="px-3" aria-label="Primary">
          <p className="mb-2 px-2.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-tertiary">
            Workspace
          </p>
          <div className="space-y-1">
            {navigation
              .filter((item) => !(isLinux && item.view === "hotspot"))
              .map((item) => {
              const active = item.view === view;
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => setView(item.view)}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "group flex h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] font-medium transition-all duration-150",
                    active
                      ? "bg-brand-soft text-brand-ink ring-1 ring-inset ring-brand/10"
                      : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  <Icon
                    className={clsx(
                      "h-4 w-4 shrink-0",
                      active ? "text-brand" : "text-ink-tertiary group-hover:text-ink-secondary",
                    )}
                    strokeWidth={active ? 2.1 : 1.8}
                  />
                  <span className="flex-1 text-left">{item.label}</span>
                  {active ? (
                    <span className="h-1 w-1 rounded-full bg-brand/70" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="mt-auto space-y-3 p-3 pb-4">
          <button
            type="button"
            onClick={() => setView("overview")}
            className="group w-full rounded-xl border border-hairline bg-surface p-3 text-left shadow-[0_1px_1px_rgba(16,35,26,0.02)] transition-colors hover:border-hairline-strong"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-tertiary">
                Current network
              </span>
              <SignalBars bars={status?.wifi.signalBars ?? null} />
            </div>
            <p
              className="mt-1.5 truncate text-[12.5px] font-semibold text-ink"
              title={ssid}
            >
              {ssid}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              {status ? (
                <StatusPill state={status.state} animate={status.state === "connecting"} />
              ) : (
                <span className="text-[11px] text-ink-tertiary">Starting…</span>
              )}
              <ChevronRight className="h-3.5 w-3.5 text-ink-tertiary transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>

          {status?.wifi.ssidRestricted ? (
            <button
              type="button"
              onClick={() => void requestLocation()}
              disabled={locationPrompt}
              className="flex w-full items-center gap-2 rounded-lg border border-warning/20 bg-warning-soft px-2.5 py-2 text-left text-[10.5px] font-medium text-warning transition-colors hover:bg-warning-soft/75 disabled:opacity-60"
            >
              <KeyRound className="h-3.5 w-3.5 shrink-0" />
              {locationPrompt ? "Waiting for macOS…" : "Reveal network name"}
            </button>
          ) : null}

          <div className="rounded-xl border border-hairline bg-surface px-3 py-2.5">
            <div className="flex items-center gap-2 text-[10.5px] font-medium text-ink-secondary">
              <ShieldCheck className="h-3.5 w-3.5 text-brand" />
              Local only. No account.
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-ink-tertiary">
              <LockKeyhole className="h-3 w-3" />
              Credentials stay in Keychain
            </div>
          </div>

          <p className="px-1 text-[9.5px] leading-relaxed text-ink-tertiary">
            AirLink {appInfo?.version ?? "1.0.0"} ·{" "}
            {appInfo?.brand ?? "marvecodeit"}
          </p>
        </div>
      </aside>

      <div className="ml-[236px] flex h-screen flex-col">
        <header
          data-tauri-drag-region
          className="relative z-30 flex h-[58px] shrink-0 items-center justify-between gap-4 border-b border-hairline/70 bg-canvas/75 px-6 backdrop-blur-xl"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
                {page.title}
              </h1>
              <span className="hidden h-3 w-px bg-hairline-strong sm:block" />
              <p className="hidden truncate text-[11.5px] text-ink-tertiary lg:block">
                {page.description}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="mr-1 hidden text-[10.5px] text-ink-tertiary xl:inline">
              {meta?.isOnline ? "Verified" : meta?.label ?? "Starting"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh network status"
              title="Refresh network status"
              loading={refreshing}
              onClick={() => void refresh(true)}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={checking}
              onClick={() => void checkConnection()}
              icon={<Globe2 className="h-3.5 w-3.5" />}
            >
              Check connection
            </Button>
            {view !== "settings" ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open settings"
                title="Settings"
                onClick={() => setView("settings")}
                icon={<Settings2 className="h-3.5 w-3.5" />}
              />
            ) : null}
          </div>
        </header>

        <main className="app-scroll flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1140px] px-7 pb-14 pt-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
