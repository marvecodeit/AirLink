import clsx from "clsx";
import {
  Check,
  CircleAlert,
  Copy,
  Info,
  Laptop,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Hint, Input, Label } from "../components/ui/Field";
import { Toggle } from "../components/ui/Toggle";
import { api, toApiError } from "../services/api";
import { useAppStore } from "../stores/appStore";
import type { HotspotStatus } from "../types";

function generatePassword(): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function HotspotPage() {
  const status = useAppStore((state) => state.status);
  const setView = useAppStore((state) => state.setView);
  const pushToast = useAppStore((state) => state.pushToast);
  const [hotspot, setHotspot] = useState<HotspotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [copied, setCopied] = useState<"name" | "password" | null>(null);
  const [nameTouched, setNameTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHotspot(await api.getHotspotStatus());
    } catch (error) {
      pushToast("error", "Could not read hotspot status", toApiError(error).message);
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!nameTouched) {
      if (hotspot?.hotspotName) {
        setName(hotspot.hotspotName);
      } else if (status?.wifi.ssid) {
        setName(`${status.wifi.ssid} Hotspot`);
      }
    }
  }, [hotspot?.hotspotName, nameTouched, status?.wifi.ssid]);

  const copyText = async (value: string, field: "name" | "password") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      window.setTimeout(() => setCopied(null), 1_600);
    } catch {
      pushToast("warning", "Could not copy", "Select the field and press ⌘C.");
    }
  };

  const openSharing = async () => {
    try {
      await api.openInternetSharingSettings();
      pushToast(
        "info",
        "Internet Sharing opened",
        "Set the source and Wi-Fi options there. AirLink cannot enable macOS Internet Sharing silently.",
      );
    } catch (error) {
      pushToast("error", "Could not open System Settings", toApiError(error).message);
    }
  };

  return (
    <div className="animate-fade-up mx-auto max-w-[900px] space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand/20 bg-brand-soft text-brand">
              <RadioTower className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                  Internet Sharing hotspot
                </h2>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    hotspot?.sharingActive
                      ? "border-brand/20 bg-brand-soft text-brand-ink"
                      : "border-hairline bg-surface-muted text-ink-tertiary",
                  )}
                >
                  <span
                    className={clsx(
                      "h-1.5 w-1.5 rounded-full",
                      hotspot?.sharingActive ? "bg-brand" : "bg-ink-tertiary",
                    )}
                  />
                  {hotspot?.sharingActive
                    ? hotspot.wifiBroadcast
                      ? "Wi-Fi sharing on"
                      : "Sharing on · Wi-Fi off"
                    : "Sharing off"}
                </span>
              </div>
              <p className="mt-1 max-w-[560px] text-[11.5px] leading-relaxed text-ink-secondary">
                {hotspot?.note ??
                  "Checking macOS Internet Sharing status…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh hotspot status"
              loading={loading}
              onClick={() => void load()}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            />
            <Button variant="primary" size="sm" onClick={() => void openSharing()}>
              Open Internet Sharing
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-muted/50 px-3.5 py-3">
          <div>
            <p className="text-[11.5px] font-medium text-ink">Hotspot on / off</p>
            <p className="mt-0.5 max-w-[520px] text-[10px] leading-relaxed text-ink-tertiary">
              macOS manages Internet Sharing. This switch shows the live Wi-Fi
              broadcast state and opens the real system switch — AirLink cannot
              flip it programmatically without a privileged helper.
            </p>
          </div>
          <Toggle
            label="Open the macOS Internet Sharing switch"
            checked={Boolean(hotspot?.wifiBroadcast)}
            disabled={loading}
            onChange={() => void openSharing()}
          />
        </div>

        <div className="mt-3 grid gap-2 border-t border-hairline pt-4 sm:grid-cols-3">
          <InfoStat
            label="Internet source"
            value={hotspot?.sourceNetwork ?? hotspot?.sourceInterface ?? "—"}
            icon={Wifi}
          />
          <InfoStat
            label="Hotspot name"
            value={
              hotspot?.hotspotName ??
              (hotspot?.wifiBroadcast ? "Configured in macOS" : "Wi-Fi broadcast off")
            }
            icon={RadioTower}
          />
          <InfoStat
            label="Connected devices"
            value={
              hotspot?.clientListAvailable
                ? String(hotspot?.clients.length ?? 0)
                : "Unavailable"
            }
            icon={Laptop}
          />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-muted text-ink-secondary">
            <Wifi className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
              Broadcast name &amp; password
            </h2>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-tertiary">
              macOS keeps the hotspot name and password inside Internet Sharing
              → Wi-Fi Options. AirLink reads the configured name for reference
              and prepares credentials, but cannot apply them through a public
              API.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="hotspot-name">Network name</Label>
            <div className="flex gap-1.5">
              <Input
                id="hotspot-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameTouched(true);
                }}
                placeholder="Campus Lab Hotspot"
                spellCheck={false}
              />
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Copy hotspot name"
                onClick={() => void copyText(name, "name")}
                icon={
                  copied === "name" ? (
                    <Check className="h-3.5 w-3.5 text-brand" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="hotspot-password">Password</Label>
            <div className="flex gap-1.5">
              <Input
                id="hotspot-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="font-mono text-[12px]"
                spellCheck={false}
              />
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Copy hotspot password"
                onClick={() => void copyText(password, "password")}
                icon={
                  copied === "password" ? (
                    <Check className="h-3.5 w-3.5 text-brand" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )
                }
              />
            </div>
          </div>
        </div>

        <Hint>
          Open Internet Sharing, choose the connection AirLink is using as the
          source, select “To computers using: Wi-Fi”, open Wi-Fi Options, paste
          these values, then turn Internet Sharing on.
        </Hint>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void openSharing()}
            icon={<RadioTower className="h-3.5 w-3.5" />}
          >
            Configure in System Settings
          </Button>
          {hotspot?.wifiBroadcast ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-brand-ink">
              <Check className="h-3 w-3" />
              macOS reports Wi-Fi broadcasting on
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("browser")}
            icon={<Wifi className="h-3.5 w-3.5" />}
          >
            Open local links in Browser
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-muted text-ink-secondary">
            <Laptop className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
              Connected devices
            </h2>
            <p className="mt-0.5 text-[10.5px] text-ink-tertiary">
              Read from macOS DHCP leases when available.
            </p>
            {hotspot?.clientListAvailable ? (
              hotspot.clients.length ? (
                <div className="mt-3 space-y-1.5">
                  {hotspot.clients.map((client) => (
                    <div
                      key={`${client.ipAddress}-${client.macAddress}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-muted/60 px-2.5 py-1.5 text-[10.5px]"
                    >
                      <span className="truncate text-ink">
                        {client.name ?? "Unnamed device"}
                      </span>
                      <span className="font-mono text-ink-tertiary">
                        {client.ipAddress}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-hairline px-3 py-4 text-center text-[10.5px] text-ink-tertiary">
                  No active DHCP leases found.
                </p>
              )
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-hairline px-3 py-4 text-center text-[10.5px] leading-relaxed text-ink-tertiary">
                macOS does not expose the Internet Sharing client list to
                third-party apps. Check Internet Sharing in System Settings for
                connected devices.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-warning/20 bg-warning-soft text-warning">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
              macOS hotspot limits
            </h2>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-tertiary">
              AirLink will not show controls that cannot actually enforce these
              settings. macOS Internet Sharing does not provide public APIs for:
            </p>
            <ul className="mt-2 space-y-1.5 text-[10.5px] leading-relaxed text-ink-secondary">
              <li className="flex gap-2">
                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                Data caps or per-client internet limits.
              </li>
              <li className="flex gap-2">
                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                A maximum number of stations.
              </li>
              <li className="flex gap-2">
                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                A captive portal served from the hotspot.
              </li>
            </ul>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-tertiary">
              Those require a privileged network extension or custom access-point
              stack. AirLink keeps the supported macOS path instead of faking
              enforcement.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-hairline bg-surface-muted/60 px-3.5 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
        <p className="text-[10.5px] leading-relaxed text-ink-tertiary">
          Internet Sharing shares the Mac&apos;s current connection — Wi-Fi or
          Ethernet — and requires an administrator password when enabled in
          System Settings. AirLink never stores that password.
        </p>
      </div>
    </div>
  );
}

function InfoStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Wifi;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-muted/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-tertiary">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 truncate text-[11.5px] font-medium text-ink" title={value}>
        {value}
      </p>
    </div>
  );
}
