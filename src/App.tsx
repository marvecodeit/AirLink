import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { BrandMark } from "./components/BrandMark";
import { SelectionMenu } from "./components/SelectionMenu";
import { ToastViewport } from "./components/ui/ToastViewport";
import { useTheme } from "./hooks/useTheme";
import { AppShell } from "./layouts/AppShell";
import { BrowserPage } from "./pages/BrowserPage";
import { HotspotPage } from "./pages/HotspotPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { api } from "./services/api";
import { useAppStore } from "./stores/appStore";

function App() {
  const view = useAppStore((state) => state.view);
  const initialized = useAppStore((state) => state.initialized);
  const initializing = useAppStore((state) => state.initializing);
  const fatalError = useAppStore((state) => state.fatalError);
  const init = useAppStore((state) => state.init);
  const setView = useAppStore((state) => state.setView);
  const refresh = useAppStore((state) => state.refresh);
  const checkConnection = useAppStore((state) => state.checkConnection);

  useTheme();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!initialized || fatalError) return;
    void api.logFrontendReady(view).catch(() => undefined);
  }, [fatalError, initialized, view]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      void api
        .logFrontendError(`${event.message} (${event.filename}:${event.lineno})`)
        .catch(() => undefined);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      void api
        .logFrontendError(`unhandled rejection: ${String(event.reason)}`)
        .catch(() => undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.altKey || event.ctrlKey) return;
      if (!event.shiftKey && event.key === "1") {
        event.preventDefault();
        setView("overview");
      } else if (!event.shiftKey && event.key === "2") {
        event.preventDefault();
        setView("browser");
      } else if (!event.shiftKey && event.key === "3") {
        event.preventDefault();
        setView("settings");
      } else if (!event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void refresh(true);
      } else if (event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void checkConnection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [checkConnection, refresh, setView]);

  if (fatalError) {
    return <FatalScreen message={fatalError} />;
  }

  if ((!initialized && !initializing) || (!initialized && !view)) {
    return <Splash />;
  }

  return (
    <>
      <AppShell>
        {view === "overview" ? <OverviewPage /> : null}
        {view === "browser" ? <BrowserPage /> : null}
        {view === "hotspot" ? <HotspotPage /> : null}
        {view === "settings" ? <SettingsPage /> : null}
      </AppShell>
      <SelectionMenu />
      <ToastViewport />
    </>
  );
}

function Splash() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-canvas">
      <div className="animate-scale-in flex flex-col items-center">
        <BrandMark />
        <div className="mt-5 flex items-center gap-2 text-[11px] text-ink-tertiary">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-brand" />
          Reading the Wi-Fi connection…
        </div>
      </div>
    </div>
  );
}

function FatalScreen({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas px-8">
      <div className="w-full max-w-[460px] rounded-2xl border border-hairline bg-surface p-6 shadow-float">
        <div className="flex items-center gap-3">
          <img
            src="/app-icon.png"
            alt=""
            className="h-10 w-10 rounded-xl ring-1 ring-black/5 dark:ring-white/10"
          />
          <div>
            <h1 className="text-[16px] font-semibold tracking-[-0.02em] text-ink">
              AirLink couldn&apos;t start
            </h1>
            <p className="text-[10.5px] text-ink-tertiary">Native bridge unavailable</p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-[11px] leading-relaxed text-ink-secondary">{message}</p>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-ink-secondary">
          Start the desktop app with{" "}
          <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-ink">
            npm run tauri dev
          </code>
          , or open the built{" "}
          <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-ink">
            AirLink.app
          </code>
          . Wi-Fi access requires the native macOS shell.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex h-9 items-center gap-2 rounded-[10px] bg-brand px-4 text-[12.5px] font-medium text-white dark:text-[#052312]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export default App;
