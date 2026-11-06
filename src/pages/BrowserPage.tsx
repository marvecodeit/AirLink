import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkPlus,
  CheckCircle2,
  CircleAlert,
  Code2,
  ExternalLink,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  StopCircle,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { createId, isValidHttpUrl, prettyHost } from "../lib/format";
import { api, toApiError } from "../services/api";
import { useAppStore } from "../stores/appStore";
import type { BrowserBounds, ServerLink, VerificationResult } from "../types";

export function BrowserPage() {
  const status = useAppStore((state) => state.status);
  const browser = useAppStore((state) => state.browser);
  const autoOpen = useAppStore((state) => state.autoOpenPortal);
  const consumeAutoOpen = useAppStore((state) => state.consumeAutoOpen);
  const setBrowser = useAppStore((state) => state.setBrowser);
  const verifying = useAppStore((state) => state.verifying);
  const verifyConnection = useAppStore((state) => state.verifyConnection);
  const pushToast = useAppStore((state) => state.pushToast);
  const checking = useAppStore((state) => state.checking);
  const checkConnection = useAppStore((state) => state.checkConnection);
  const detectPortal = useAppStore((state) => state.detectPortal);
  const settings = useAppStore((state) => state.settings);
  const saveServerLink = useAppStore((state) => state.saveServerLink);
  const removeServerLink = useAppStore((state) => state.removeServerLink);

  const viewportRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  const openingRef = useRef(false);
  const lastBoundsRef = useRef<BrowserBounds | null>(null);
  const [opening, setOpening] = useState(false);
  const [urlDraft, setUrlDraft] = useState(browser.url ?? "");
  const [urlFocused, setUrlFocused] = useState(false);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("http://");

  const connected = Boolean(
    status?.wifi.associated || status?.ip.ipv4,
  );

  const measure = useCallback((): BrowserBounds | null => {
    const element = viewportRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return null;
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }, []);

  const openBrowser = useCallback(async (preferredUrl?: string | null) => {
    if (openingRef.current) return;
    if (!connected) {
      setOpenError("Connect to Wi-Fi before opening the portal.");
      return;
    }
    const bounds = measure();
    if (!bounds) return;

    openingRef.current = true;
    setOpening(true);
    setOpenError(null);
    try {
      const targetUrl =
        preferredUrl !== undefined
          ? preferredUrl
          : autoOpen
            ? (status?.portal?.url ?? null)
            : null;
      const next = await api.openPortalBrowser(targetUrl, bounds);
      setBrowser(next);
      openedRef.current = true;
      lastBoundsRef.current = bounds;
      consumeAutoOpen();
    } catch (error) {
      setOpenError(toApiError(error).message);
      openedRef.current = false;
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }, [
    autoOpen,
    connected,
    consumeAutoOpen,
    measure,
    setBrowser,
    status?.portal?.url,
  ]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    let observer: ResizeObserver | null = null;
    const frame = window.requestAnimationFrame(() => {
      if (!openedRef.current) {
        void openBrowser();
      } else if (lastBoundsRef.current) {
        void api.setBrowserBounds(lastBoundsRef.current).catch(() => undefined);
        void api.showPortalBrowser().catch(() => undefined);
      }
    });

    observer = new ResizeObserver(() => {
      const bounds = measure();
      if (!bounds) return;
      lastBoundsRef.current = bounds;
      if (openedRef.current) {
        void api.setBrowserBounds(bounds).catch(() => undefined);
      }
    });
    observer.observe(element);

    const onWindowResize = () => {
      const bounds = measure();
      if (!bounds) return;
      lastBoundsRef.current = bounds;
      if (openedRef.current) {
        void api.setBrowserBounds(bounds).catch(() => undefined);
      }
    };
    window.addEventListener("resize", onWindowResize);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      void api.hidePortalBrowser().catch(() => undefined);
    };
    // The browser is opened once per page visit; subsequent changes are bounds
    // updates only, so the effect intentionally has a stable dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!urlFocused) setUrlDraft(browser.url ?? "");
  }, [browser.url, urlFocused]);

  useEffect(() => {
    setVerification(null);
  }, [browser.url]);

  useEffect(() => {
    if (!autoOpen || openedRef.current) return;
    if (connected) void openBrowser();
  }, [autoOpen, connected, openBrowser]);

  const run = async (action: () => Promise<void>, fallback: string) => {
    try {
      await action();
    } catch (error) {
      pushToast("error", fallback, toApiError(error).message);
    }
  };

  const submitUrl = (event: FormEvent) => {
    event.preventDefault();
    let value = urlDraft.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
      const localAddress =
        /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
          value,
        ) || /^[\d.]+(:\d+)?(\/.*)?$/.test(value);
      value = `${localAddress ? "http" : "https"}://${value}`;
    }
    if (!isValidHttpUrl(value)) {
      pushToast("warning", "Enter a web address", "Use an http:// or https:// address.");
      return;
    }
    void run(() => api.browserNavigate(value), "Could not navigate");
  };

  const serverLinks = settings?.serverLinks ?? [];

  const openSavedLink = async (url: string) => {
    if (browser.open) {
      await run(() => api.browserNavigate(url), "Could not open saved link");
    } else {
      await openBrowser(url);
    }
  };

  const saveCurrentPage = async () => {
    if (!browser.url || !isValidHttpUrl(browser.url)) {
      pushToast("warning", "Open a page first", "There is no address to save yet.");
      return;
    }
    const link: ServerLink = {
      id: createId(),
      name: (browser.title || prettyHost(browser.url)).trim(),
      url: browser.url,
      createdAt: new Date().toISOString(),
    };
    await saveServerLink(link);
  };

  const addCustomLink = async (event: FormEvent) => {
    event.preventDefault();
    let value = linkUrl.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
      value = `http://${value}`;
    }
    if (!isValidHttpUrl(value)) {
      pushToast("warning", "Check the link", "Use an http:// or https:// address.");
      return;
    }
    const link: ServerLink = {
      id: createId(),
      name: linkName.trim() || prettyHost(value),
      url: value,
      createdAt: new Date().toISOString(),
    };
    if (await saveServerLink(link)) {
      setShowLinkForm(false);
      setLinkName("");
      setLinkUrl("http://");
    }
  };

  const verify = async () => {
    const result = await verifyConnection();
    if (result) setVerification(result);
  };

  const closeBrowser = async () => {
    try {
      await api.closePortalBrowser();
      openedRef.current = false;
      setVerification(null);
      setBrowser({
        open: false,
        url: null,
        title: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        error: null,
        isSecure: false,
        onPortalDomain: false,
      });
      pushToast("info", "Browser closed");
    } catch (error) {
      pushToast("error", "Could not close browser", toApiError(error).message);
    }
  };

  const url = browser.url ?? "";
  const host = prettyHost(url);

  return (
    <div className="animate-fade-up flex h-[calc(100vh-138px)] min-h-[520px] flex-col gap-3">
      <Card className="shrink-0 p-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            title="Back"
            disabled={!browser.canGoBack}
            onClick={() => void run(() => api.browserBack(), "Could not go back")}
            icon={<ArrowLeft className="h-4 w-4" />}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Forward"
            title="Forward"
            disabled={!browser.canGoForward}
            onClick={() =>
              void run(() => api.browserForward(), "Could not go forward")
            }
            icon={<ArrowRight className="h-4 w-4" />}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={browser.loading ? "Stop loading" : "Reload"}
            title={browser.loading ? "Stop loading" : "Reload"}
            onClick={() =>
              void run(
                () =>
                  browser.loading ? api.browserStop() : api.browserReload(),
                "Could not reload",
              )
            }
            icon={
              browser.loading ? (
                <StopCircle className="h-4 w-4" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )
            }
          />

          <form onSubmit={submitUrl} className="min-w-0 flex-1">
            <div className="group flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-muted px-2.5 transition-colors focus-within:border-brand/50 focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand/10">
              {browser.isSecure ? (
                <LockKeyhole
                  className="h-3.5 w-3.5 shrink-0 text-brand"
                  aria-label="Secure connection"
                />
              ) : (
                <TriangleAlert
                  className="h-3.5 w-3.5 shrink-0 text-warning"
                  aria-label="Not a secure connection"
                />
              )}
              <input
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
                onFocus={(event) => {
                  setUrlFocused(true);
                  event.currentTarget.select();
                }}
                onBlur={() => {
                  setUrlFocused(false);
                  setUrlDraft(browser.url ?? "");
                }}
                placeholder="https://portal.your-campus.edu"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                aria-label="Browser address"
                className="h-full min-w-0 flex-1 bg-transparent font-mono text-[11px] text-ink outline-none placeholder:text-ink-tertiary"
              />
              <span
                className={clsx(
                  "hidden shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium sm:inline",
                  browser.onPortalDomain
                    ? "bg-brand-soft text-brand-ink"
                    : "bg-warning-soft text-warning",
                )}
              >
                {browser.onPortalDomain ? "Trusted portal domain" : "Unverified domain"}
              </span>
            </div>
          </form>

          <Button
            variant="primary"
            size="sm"
            loading={verifying}
            onClick={() => void verify()}
            disabled={!browser.open || !connected}
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
          >
            Verify connection
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open in system browser"
            title="Open in system browser"
            disabled={!browser.open || !browser.url}
            onClick={() =>
              void run(
                () => api.openExternalUrl(browser.url as string),
                "Could not open the system browser",
              )
            }
            icon={<ExternalLink className="h-4 w-4" />}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Developer tools"
            title="Open Web Inspector"
            disabled={!browser.open}
            onClick={() =>
              void run(
                () => api.openBrowserDevtools(),
                "Developer tools are unavailable",
              )
            }
            icon={<Code2 className="h-4 w-4" />}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close browser"
            title="Close browser"
            disabled={!browser.open}
            onClick={() => void closeBrowser()}
            icon={<X className="h-4 w-4" />}
          />
        </div>

        {browser.loading ? (
          <div className="relative mt-1.5 h-[2px] overflow-hidden rounded-full bg-brand-soft">
            <span className="indeterminate-bar absolute inset-y-0 w-1/3 rounded-full bg-brand" />
          </div>
        ) : (
          <div className="mt-1.5 h-[2px]" />
        )}
      </Card>

      <div className="flex shrink-0 items-center gap-2 overflow-x-auto px-1 pb-0.5">
        <Bookmark className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
        <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-tertiary">
          Saved links
        </span>
        {serverLinks.length ? (
          serverLinks.map((link) => (
            <span
              key={link.id}
              className="group inline-flex max-w-[220px] shrink-0 items-center rounded-lg border border-hairline bg-surface text-[10.5px] text-ink-secondary transition-colors hover:border-brand/30 hover:text-ink"
            >
              <button
                type="button"
                onClick={() => void openSavedLink(link.url)}
                className="min-w-0 truncate px-2 py-1"
                title={link.url}
              >
                {link.name}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void removeServerLink(link.id);
                }}
                aria-label={`Remove ${link.name}`}
                className="mr-1 hidden h-4 w-4 shrink-0 items-center justify-center rounded text-ink-tertiary hover:bg-danger-soft hover:text-danger group-hover:flex"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))
        ) : (
          <span className="shrink-0 text-[10.5px] text-ink-tertiary">
            Add the local server URLs you use on this Wi-Fi.
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowLinkForm((value) => !value)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-hairline-strong px-2 py-1 text-[10.5px] text-ink-tertiary transition-colors hover:border-brand/30 hover:text-ink"
        >
          <Plus className="h-2.5 w-2.5" />
          Add link
        </button>
        <button
          type="button"
          onClick={() => void saveCurrentPage()}
          disabled={!browser.url}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-hairline bg-surface px-2 py-1 text-[10.5px] text-ink-secondary transition-colors hover:border-brand/30 hover:text-ink disabled:opacity-40"
        >
          <BookmarkPlus className="h-2.5 w-2.5" />
          Save current
        </button>
      </div>

      {showLinkForm ? (
        <Card className="shrink-0 p-2">
          <form onSubmit={addCustomLink} className="flex items-center gap-2">
            <input
              value={linkName}
              onChange={(event) => setLinkName(event.target.value)}
              placeholder="Server name"
              aria-label="Server link name"
              className="h-8 w-[150px] rounded-lg border border-hairline-strong bg-surface px-2 text-[11px] text-ink outline-none focus:border-brand/60"
            />
            <input
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="http://192.168.0.5:8080"
              aria-label="Server link address"
              spellCheck={false}
              className="h-8 min-w-0 flex-1 rounded-lg border border-hairline-strong bg-surface px-2 font-mono text-[10.5px] text-ink outline-none focus:border-brand/60"
            />
            <Button variant="primary" size="sm" type="submit">
              Save link
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLinkForm(false)}
            >
              Cancel
            </Button>
          </form>
        </Card>
      ) : null}

      <div className="flex shrink-0 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2 text-[10.5px] text-ink-tertiary">
          <Globe2 className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {browser.title
              ? browser.title
              : browser.open
                ? host || "Loading portal…"
                : "Open a portal or a local Wi-Fi server link."}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-ink-tertiary">
          <ShieldCheck className="h-3 w-3 text-brand" />
          JavaScript, cookies &amp; forms enabled · no credential injection
        </div>
      </div>

      <Card className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-1.5">
        <div
          ref={viewportRef}
          className="relative flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-[var(--surface-muted)]"
        >
          {!browser.open || opening ? (
            <BrowserPlaceholder
              opening={opening}
              error={openError}
              connected={connected}
              hasPortal={Boolean(status?.portal)}
              onOpen={() => void openBrowser()}
              onCheck={() => void checkConnection()}
              checking={checking}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-ink-tertiary">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <p className="text-[10.5px]">Page is loading…</p>
            </div>
          )}
          {/* The native WKWebView is positioned exactly over this element. */}
        </div>
      </Card>

      <div className="flex h-[38px] shrink-0 items-start justify-between gap-4 px-1">
        {verification ? (
          <div
            className={clsx(
              "flex min-w-0 items-start gap-2 rounded-lg border px-2.5 py-2 text-[10.5px] leading-relaxed",
              verification.verified
                ? "border-brand/20 bg-brand-soft text-brand-ink"
                : "border-warning/25 bg-warning-soft text-warning",
            )}
          >
            {verification.verified ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <p className="min-w-0">
              {verification.message}
              {verification.verified && !verification.portalOnline
                ? " The system-level portal hint was unavailable; the actual internet path is verified."
                : ""}
            </p>
          </div>
        ) : (
          <p className="max-w-[660px] text-[10.5px] leading-relaxed text-ink-tertiary">
            Sign in to a portal above when needed, then choose <strong className="font-medium text-ink-secondary">Verify connection</strong>.
            AirLink tests the Mac&apos;s actual internet path — a submitted form
            or browser cookie is not treated as success. Use saved links for
            local Wi-Fi servers that system browsers refuse to open.
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-2"
          onClick={() =>
            void (async () => {
              const latest = await detectPortal();
              await openBrowser(latest?.portal?.url ?? null);
            })()
          }
          icon={<ExternalLink className="h-3 w-3" />}
        >
          Reopen portal
        </Button>
      </div>
    </div>
  );
}

function BrowserPlaceholder({
  opening,
  error,
  connected,
  hasPortal,
  onOpen,
  onCheck,
  checking,
}: {
  opening: boolean;
  error: string | null;
  connected: boolean;
  hasPortal: boolean;
  onOpen: () => void;
  onCheck: () => void;
  checking: boolean;
}) {
  return (
    <div className="flex max-w-[430px] flex-col items-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand/20 bg-brand-soft text-brand">
        {opening ? (
          <LoaderCircle className="h-5 w-5 animate-spin" />
        ) : (
          <Globe2 className="h-5 w-5" strokeWidth={1.7} />
        )}
      </div>
      <h2 className="mt-3 text-[15px] font-semibold tracking-[-0.015em] text-ink">
        {opening
          ? "Opening the campus portal"
          : hasPortal
            ? "Your sign-in page is ready"
            : "Open the network's sign-in page"}
      </h2>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-secondary">
        {error
          ? error
          : connected
            ? "The page loads in a real WebKit browser with cookies, redirects, and forms intact. AirLink does not inject credentials."
            : "Connect to Wi-Fi first. The configured portal or network probe will redirect you to the real sign-in page."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button
          variant="primary"
          size="sm"
          loading={opening}
          disabled={!connected}
          onClick={onOpen}
          icon={<Globe2 className="h-3.5 w-3.5" />}
        >
          Open portal page
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={checking}
          onClick={onCheck}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Check connection
        </Button>
      </div>
      {!connected ? (
        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-ink-tertiary">
          <CircleAlert className="h-3 w-3" />
          Waiting for an active Wi-Fi link
        </p>
      ) : null}
    </div>
  );
}
