import clsx from "clsx";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Clock3,
  ExternalLink,
  Globe2,
  History,
  KeyRound,
  LockKeyhole,
  LogIn,
  MonitorSmartphone,
  RefreshCw,
  Router,
  ShieldAlert,
  ShieldCheck,
  Signal,
  TriangleAlert,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useState } from "react";
import { SignalBars } from "../components/BrandMark";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CopyButton } from "../components/ui/CopyButton";
import { useNow } from "../hooks/useNow";
import {
  formatLatency,
  networkDisplayName,
  prettyHost,
  relativeTime,
} from "../lib/format";
import {
  needsPortal,
  probeOutcomeMeta,
  statusDescription,
  statusMeta,
} from "../lib/status";
import { api } from "../services/api";
import { useAppStore } from "../stores/appStore";
import type { NetworkStatus } from "../types";

export function OverviewPage() {
  const status = useAppStore((state) => state.status);
  const setView = useAppStore((state) => state.setView);
  const openPortal = useAppStore((state) => state.openPortal);
  const checkConnection = useAppStore((state) => state.checkConnection);
  const checking = useAppStore((state) => state.checking);
  const [showNetworkDetails, setShowNetworkDetails] = useState(false);

  if (!status) {
    return <OverviewSkeleton />;
  }

  const portalNeeded = needsPortal(status.state);
  const canOpen = status.wifi.associated || Boolean(status.ip.ipv4);

  const scrollToDetails = () => {
    setShowNetworkDetails(true);
    window.requestAnimationFrame(() => {
      document
        .getElementById("network-details")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="grid grid-cols-1 items-start gap-5 min-[1060px]:grid-cols-[minmax(0,1.48fr)_minmax(0,1fr)]">
        <HeroCard
          status={status}
          portalNeeded={portalNeeded}
          canOpen={canOpen}
          checking={checking}
          onOpenPortal={openPortal}
          onCheck={() => void checkConnection()}
          onDetails={scrollToDetails}
        />
        <div id="network-details" className="scroll-mt-6">
          <NetworkCard
            status={status}
            expanded={showNetworkDetails}
            onToggleDetails={() => setShowNetworkDetails((value) => !value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 min-[1060px]:grid-cols-[minmax(0,1.48fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {portalNeeded || status.portal ? (
            <PortalCard
              status={status}
              onOpenPortal={openPortal}
              onDetect={() => void checkConnection()}
              detecting={checking}
            />
          ) : null}
          <ConnectivityCard status={status} onSettings={() => setView("settings")} />
        </div>
        <ActivityCard />
      </div>
    </div>
  );
}

function HeroCard({
  status,
  portalNeeded,
  canOpen,
  checking,
  onOpenPortal,
  onCheck,
  onDetails,
}: {
  status: NetworkStatus;
  portalNeeded: boolean;
  canOpen: boolean;
  checking: boolean;
  onOpenPortal: () => void;
  onCheck: () => void;
  onDetails: () => void;
}) {
  const now = useNow(10_000);
  const meta = statusMeta(status.state);
  const Icon = meta.icon;
  const online = meta.isOnline;

  return (
    <Card className="relative min-h-[264px] overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-32 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--brand)_11%,transparent),transparent_68%)]"
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between gap-3">
          <StatusPill
            state={status.state}
            animate={status.state === "connecting"}
          />
          <span className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-tertiary">
            <Clock3 className="h-3 w-3" />
            Checked {relativeTime(status.lastChecked, now).toLowerCase()}
          </span>
        </div>

        <div className="mt-5 flex flex-1 items-start justify-between gap-8">
          <div className="min-w-0 max-w-[430px]">
            <div className="flex items-start gap-4">
              <div
                className={clsx(
                  "flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-2xl border",
                  online
                    ? "border-brand/20 bg-brand-soft text-brand"
                    : portalNeeded
                      ? "border-warning/25 bg-warning-soft text-warning"
                      : "border-hairline bg-surface-muted text-ink-secondary",
                  status.state === "connecting" && "animate-pulse-soft",
                )}
              >
                <Icon
                  className={clsx(
                    "h-6 w-6",
                    status.state === "connecting" && "animate-spin",
                  )}
                  strokeWidth={1.8}
                />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-tertiary">
                  {networkDisplayName(
                    status.wifi.ssid,
                    status.wifi.ssidRestricted,
                  )}
                </p>
                <h2 className="text-balance text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
                  {meta.headline}
                </h2>
                <p className="mt-2 max-w-[390px] text-[12px] leading-relaxed text-ink-secondary">
                  {statusDescription(status)}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={onOpenPortal}
                disabled={!canOpen}
                icon={
                  portalNeeded ? (
                    <LogIn className="h-3.5 w-3.5" />
                  ) : (
                    <Globe2 className="h-3.5 w-3.5" />
                  )
                }
              >
                {portalNeeded
                  ? status.state === "session_expired"
                    ? "Sign in again"
                    : "Open sign-in page"
                  : "Open portal browser"}
              </Button>
              <Button
                variant="secondary"
                loading={checking}
                onClick={onCheck}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Check connection
              </Button>
              <Button
                variant="ghost"
                onClick={onDetails}
                trailingIcon={<ArrowDown className="h-3.5 w-3.5" />}
              >
                Network details
              </Button>
            </div>
          </div>

          <ConnectionRoute status={status} />
        </div>

        {!status.wifi.powered ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-hairline bg-surface-muted px-3 py-2 text-[11px] text-ink-secondary">
            <WifiOff className="h-3.5 w-3.5 text-ink-tertiary" />
            Wi-Fi is off. Turn it on in Control Center, then check again.
            <button
              type="button"
              className="ml-auto font-medium text-brand hover:text-brand-dark"
              onClick={() => void api.openNetworkSettings()}
            >
              Open Network Settings
            </button>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline pt-3 text-[10px] text-ink-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-brand" />
            {online
              ? "System-wide HTTPS access verified"
              : "Verification requires a live HTTPS check"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LockKeyhole className="h-3 w-3" />
            Portal pages stay inside AirLink
          </span>
        </div>
      </div>
    </Card>
  );
}

function ConnectionRoute({ status }: { status: NetworkStatus }) {
  const linkUp = status.wifi.associated || Boolean(status.ip.ipv4);
  const internet = status.connectivity.internetAvailable;
  const portalRequired = needsPortal(status.state);

  const steps = [
    {
      label: "Wi-Fi link",
      detail: linkUp
        ? status.wifi.ssid ?? "Connected"
        : status.wifi.powered
          ? "Searching"
          : "Off",
      icon: Wifi,
      tone: linkUp ? "success" : "muted",
    },
    {
      label: "Portal",
      detail: internet ? "Not required" : portalRequired ? "Sign-in needed" : "Unknown",
      icon: ShieldCheck,
      tone: internet ? "muted" : portalRequired ? "warning" : "muted",
    },
    {
      label: "Internet",
      detail: internet ? "Verified" : "Not available",
      icon: Globe2,
      tone: internet ? "success" : "muted",
    },
  ] as const;

  return (
    <div className="hidden w-[196px] shrink-0 rounded-xl border border-hairline bg-surface-muted/60 p-3 2xl:block">
      <p className="mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-tertiary">
        Connection path
      </p>
      <div className="space-y-0.5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="relative flex gap-2.5 pb-3 last:pb-0">
              {index < steps.length - 1 ? (
                <span className="absolute left-[9px] top-5 h-[calc(100%-12px)] w-px bg-hairline-strong" />
              ) : null}
              <span
                className={clsx(
                  "relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border",
                  step.tone === "success"
                    ? "border-brand/20 bg-brand-soft text-brand"
                    : step.tone === "warning"
                      ? "border-warning/25 bg-warning-soft text-warning"
                      : "border-hairline bg-surface text-ink-tertiary",
                )}
              >
                <Icon className="h-2.5 w-2.5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-medium leading-tight text-ink">
                  {step.label}
                </p>
                <p className="mt-0.5 truncate text-[10px] leading-tight text-ink-tertiary">
                  {step.detail}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortalCard({
  status,
  onOpenPortal,
  onDetect,
  detecting,
}: {
  status: NetworkStatus;
  onOpenPortal: () => void;
  onDetect: () => void;
  detecting: boolean;
}) {
  const portal = status.portal;
  const expired = status.state === "session_expired";
  const methodLabel =
    portal?.detectionMethod === "redirect"
      ? "The network redirected a web request to this page."
      : portal?.detectionMethod === "portal_content"
        ? "The network replaced a connectivity check with this page."
        : portal?.detectionMethod === "known_profile"
          ? "This address comes from your saved campus profile."
          : "The network is intercepting web traffic.";

  return (
    <Card className="overflow-hidden border-warning/25 bg-[linear-gradient(135deg,var(--warning-soft),var(--surface)_55%)] p-5">
      <div className="flex items-start gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-warning/20 bg-warning-soft text-warning">
          <ShieldAlert className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
              {expired ? "Sign in again to restore internet" : "Network sign-in required"}
            </h3>
            {portal ? (
              <span
                className={clsx(
                  "rounded-full border px-2 py-0.5 text-[9.5px] font-medium",
                  portal.trusted
                    ? "border-brand/20 bg-brand-soft text-brand-ink"
                    : "border-warning/25 bg-warning-soft text-warning",
                )}
              >
                {portal.trusted ? "Trusted profile" : "Unrecognized portal"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-[620px] text-[11.5px] leading-relaxed text-ink-secondary">
            {status.message ??
              "This network needs a sign-in before internet access is allowed."}
            {portal ? ` ${methodLabel}` : ""}
          </p>

          {portal ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-1.5">
                {portal.url.startsWith("https") ? (
                  <LockKeyhole className="h-3 w-3 shrink-0 text-brand" />
                ) : (
                  <TriangleAlert className="h-3 w-3 shrink-0 text-warning" />
                )}
                <span className="truncate text-[11px] text-ink-secondary">
                  {prettyHost(portal.url)}
                </span>
                <CopyButton value={portal.url} label="Copy portal link" />
              </div>
              <span className="text-[10px] text-ink-tertiary">
                Detected {relativeTime(portal.detectedAt).toLowerCase()}
              </span>
            </div>
          ) : null}

          {portal && !portal.trusted ? (
            <p className="mt-2.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-tertiary">
              <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              Check the address with your campus IT team before entering a
              password. AirLink never auto-fills credentials.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenPortal}
              icon={<ExternalLink className="h-3.5 w-3.5" />}
            >
              Open sign-in page
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={detecting}
              onClick={onDetect}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Detect again
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function NetworkCard({
  status,
  expanded,
  onToggleDetails,
}: {
  status: NetworkStatus;
  expanded: boolean;
  onToggleDetails: () => void;
}) {
  const locationAuthorization = useAppStore((state) => state.locationAuthorization);
  const requestLocation = useAppStore((state) => state.requestLocation);
  const locationPrompt = useAppStore((state) => state.locationPrompt);
  const refresh = useAppStore((state) => state.refresh);
  const pushToast = useAppStore((state) => state.pushToast);
  const ssid = networkDisplayName(status.wifi.ssid, status.wifi.ssidRestricted);
  const connected = status.wifi.associated || Boolean(status.ip.ipv4);

  const openNetworkSettings = async () => {
    try {
      await api.openNetworkSettings();
    } catch (error) {
      pushToast("error", "Could not open Network Settings", String(error));
    }
  };

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-tertiary">
            Current network
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h3 className="max-w-[220px] truncate text-[17px] font-semibold tracking-[-0.02em] text-ink" title={ssid}>
              {ssid}
            </h3>
            {connected ? <SignalBars bars={status.wifi.signalBars} /> : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-ink-tertiary">
            {status.wifi.interface ? <span>{status.wifi.interface}</span> : null}
            {status.wifi.band ? (
              <>
                <span className="h-2.5 w-px bg-hairline-strong" />
                <span>{status.wifi.band}</span>
              </>
            ) : null}
            {status.wifi.security ? (
              <>
                <span className="h-2.5 w-px bg-hairline-strong" />
                <span>{status.wifi.security}</span>
              </>
            ) : null}
            {status.wifi.signalLabel ? (
              <>
                <span className="h-2.5 w-px bg-hairline-strong" />
                <span>{status.wifi.signalLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline bg-surface-muted text-ink-secondary">
          <Router className="h-4 w-4" strokeWidth={1.7} />
        </div>
      </div>

      {status.wifi.ssidRestricted ? (
        <div className="mt-3 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2.5">
          <p className="text-[11px] font-medium text-warning">
            macOS is hiding the network name.
          </p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-ink-secondary">
            {locationAuthorization === "authorized"
              ? "Location access is granted. If the name is still hidden, refresh the network state or reopen AirLink once."
              : "Location access is required to read SSIDs. AirLink never records or sends your location."}
          </p>
          <Button
            variant="soft"
            size="sm"
            className="mt-2"
            loading={locationPrompt}
            onClick={() =>
              locationAuthorization === "denied" || locationAuthorization === "restricted"
                ? void api.openLocationSettings()
                : locationAuthorization === "authorized"
                  ? void refresh(true)
                  : void requestLocation()
            }
            icon={<KeyRound className="h-3 w-3" />}
          >
            {locationAuthorization === "denied" || locationAuthorization === "restricted"
              ? "Open Location Settings"
              : locationAuthorization === "authorized"
                ? "Refresh network name"
                : "Allow network names"}
          </Button>
        </div>
      ) : null}

      <div className="mt-4 divide-y divide-hairline border-t border-hairline">
        <DetailRow label="IP address" value={status.ip.ipv4} mono copyable />
        <DetailRow label="Gateway" value={status.ip.gateway} mono copyable />
        <DetailRow
          label="DNS"
          value={status.ip.dns.length ? status.ip.dns.join(", ") : null}
          mono
          copyable
        />
        {status.wifi.channel ? (
          <DetailRow
            label="Channel"
            value={`${status.wifi.channel}${
              status.wifi.channelWidthMhz ? ` · ${status.wifi.channelWidthMhz} MHz` : ""
            }`}
          />
        ) : null}
        {expanded ? (
          <>
            {status.ip.subnetMask ? (
              <DetailRow label="Subnet mask" value={status.ip.subnetMask} mono copyable />
            ) : null}
            {status.wifi.bssid ? (
              <DetailRow label="BSSID" value={status.wifi.bssid} mono copyable />
            ) : null}
            {status.ip.macAddress ? (
              <DetailRow label="MAC address" value={status.ip.macAddress} mono copyable />
            ) : null}
            {status.ip.ipv6.length ? (
              <DetailRow
                label="IPv6"
                value={status.ip.ipv6.join(", ")}
                mono
                copyable
              />
            ) : null}
            {status.wifi.phyMode ? (
              <DetailRow label="PHY mode" value={status.wifi.phyMode} />
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="px-1.5"
          onClick={onToggleDetails}
          aria-expanded={expanded}
          trailingIcon={
            expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )
          }
        >
          {expanded ? "Less" : "More details"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          onClick={() => void openNetworkSettings()}
        >
          Network settings
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-[10.5px] text-ink-tertiary">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <span
          className={clsx(
            "truncate text-right text-[11.5px] text-ink",
            mono && "font-mono text-[10.5px]",
          )}
          title={value ?? undefined}
        >
          {value || "—"}
        </span>
        {copyable && value ? <CopyButton value={value} label={`Copy ${label}`} /> : null}
      </div>
    </div>
  );
}

function ConnectivityCard({
  status,
  onSettings,
}: {
  status: NetworkStatus;
  onSettings: () => void;
}) {
  const report = status.connectivity;
  const now = useNow(10_000);
  const [expanded, setExpanded] = useState(false);

  const checks = [
    {
      label: "Internet (HTTPS)",
      ok: report.httpsOk,
      detail: report.httpsOk
        ? `Verified · ${formatLatency(report.latencyMs)}`
        : "Not reachable",
      icon: Globe2,
    },
    {
      label: "Captive probe (HTTP)",
      ok: report.httpOk,
      detail: report.portalSuspected
        ? "Portal intercepted"
        : report.httpOk
          ? "Expected response"
          : "No clean response",
      icon: ShieldCheck,
    },
    {
      label: "DNS resolution",
      ok: report.dnsOk,
      detail: report.dnsOk ? "Resolving normally" : "Lookups failing",
      icon: Router,
    },
    {
      label: "Captive portal",
      ok: !report.portalSuspected,
      detail: report.portalSuspected ? "Sign-in page detected" : "None detected",
      icon: ShieldAlert,
      invert: true,
    },
  ];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
            Connectivity checks
          </h3>
          <p className="mt-0.5 text-[10.5px] text-ink-tertiary">
            Checked {relativeTime(report.checkedAt, now).toLowerCase()} · {formatLatency(report.latencyMs)}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="px-2" onClick={onSettings}>
          Test settings
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {checks.map((check) => {
          const Icon = check.icon;
          const good = check.ok;
          return (
            <div
              key={check.label}
              className="flex items-center gap-2.5 border-b border-hairline py-2.5 last:border-0 sm:[&:nth-last-child(2)]:border-0"
            >
              <span
                className={clsx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  good
                    ? "bg-brand-soft text-brand"
                    : check.invert && report.portalSuspected
                      ? "bg-warning-soft text-warning"
                      : "bg-danger-soft text-danger",
                )}
              >
                {good ? (
                  <Check className="h-3 w-3" strokeWidth={2.4} />
                ) : (
                  <X className="h-3 w-3" strokeWidth={2.4} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-medium text-ink">{check.label}</p>
                <p className="truncate text-[10px] text-ink-tertiary">
                  {check.detail}
                </p>
              </div>
              <Icon className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-3 inline-flex items-center gap-1 text-[10.5px] font-medium text-brand transition-colors hover:text-brand-dark"
      >
        {expanded ? "Hide probe details" : "Show probe details"}
        <ChevronRight
          className={clsx("h-3 w-3 transition-transform", expanded && "rotate-90")}
        />
      </button>

      {expanded ? (
        <div className="mt-2.5 space-y-1.5 rounded-lg border border-hairline bg-surface-muted p-2.5">
          {report.probes.length ? (
            report.probes.map((probe) => {
              const outcome = probeOutcomeMeta[probe.outcome] ?? {
                label: probe.outcome,
                tone: "neutral" as const,
              };
              let host = probe.url;
              try {
                host = new URL(probe.url).host;
              } catch {
                /* keep raw */
              }
              return (
                <div
                  key={`${probe.protocol}-${probe.url}`}
                  className="flex items-center gap-2 text-[10px]"
                >
                  <span className="w-9 shrink-0 rounded border border-hairline bg-surface px-1 py-0.5 text-center font-mono uppercase text-ink-tertiary">
                    {probe.protocol}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-ink-secondary">
                    {host}
                  </span>
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-1.5 py-0.5",
                      outcome.tone === "success"
                        ? "bg-brand-soft text-brand-ink"
                        : outcome.tone === "warning"
                          ? "bg-warning-soft text-warning"
                          : "bg-danger-soft text-danger",
                    )}
                  >
                    {outcome.label}
                  </span>
                  <span className="w-11 shrink-0 text-right tabular text-ink-tertiary">
                    {formatLatency(probe.latencyMs)}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="text-[10.5px] text-ink-tertiary">
              No probes have run yet.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function ActivityCard() {
  const activity = useAppStore((state) => state.activity);
  const now = useNow(15_000);

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-ink-tertiary" />
        <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
          Recent activity
        </h3>
      </div>
      <p className="mt-0.5 text-[10.5px] text-ink-tertiary">
        Local events from this session
      </p>

      <div className="mt-4 flex-1">
        {activity.length ? (
          <ol className="relative space-y-3.5">
            <span
              aria-hidden
              className="absolute left-[7px] top-2 h-[calc(100%-14px)] w-px bg-hairline"
            />
            {activity.map((entry) => {
              const meta = statusMeta(entry.state);
              const Icon = meta.icon;
              return (
                <li key={entry.id} className="relative flex gap-3">
                  <span
                    className={clsx(
                      "relative z-10 mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border bg-surface",
                      meta.tone === "success"
                        ? "border-brand/25 text-brand"
                        : meta.tone === "warning"
                          ? "border-warning/25 text-warning"
                          : meta.tone === "danger"
                            ? "border-danger/25 text-danger"
                            : "border-hairline-strong text-ink-tertiary",
                    )}
                  >
                    <Icon className="h-2 w-2" strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-medium leading-tight text-ink">
                      {entry.label}
                    </p>
                    <p className="mt-0.5 truncate text-[10.5px] leading-tight text-ink-tertiary">
                      {entry.detail}
                    </p>
                    <p className="mt-1 text-[9.5px] text-ink-tertiary/80">
                      {relativeTime(entry.at, now)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="flex h-[150px] flex-col items-center justify-center rounded-xl border border-dashed border-hairline px-6 text-center">
            <MonitorSmartphone className="h-5 w-5 text-ink-tertiary" />
            <p className="mt-2 text-[11px] text-ink-secondary">
              Watching this connection
            </p>
            <p className="mt-0.5 text-[10px] text-ink-tertiary">
              Changes to Wi-Fi or portal access will appear here.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-hairline bg-surface-muted px-2.5 py-2">
        <Signal className="mt-0.5 h-3 w-3 shrink-0 text-brand" />
        <p className="text-[10px] leading-relaxed text-ink-tertiary">
          Monitors the link and internet path on a conservative interval. No
          credentials are ever sent automatically.
        </p>
      </div>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="animate-fade-in space-y-5">
      <div className="grid grid-cols-1 items-start gap-5 min-[1060px]:grid-cols-[minmax(0,1.48fr)_minmax(0,1fr)]">
        <Card className="h-[264px] animate-pulse bg-surface-muted/60" />
        <Card className="h-[264px] animate-pulse bg-surface-muted/60" />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 min-[1060px]:grid-cols-[minmax(0,1.48fr)_minmax(0,1fr)]">
        <Card className="h-[210px] animate-pulse bg-surface-muted/60" />
        <Card className="h-[210px] animate-pulse bg-surface-muted/60" />
      </div>
    </div>
  );
}
