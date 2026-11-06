import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  CircleAlert,
  CircleCheck,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "../lib/format";
import { useAppStore } from "../stores/appStore";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

type Phase =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "installing"
  | "restart-required"
  | "error";

interface Progress {
  downloaded: number;
  total: number;
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "The update operation failed. Check your network connection and try again.";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SoftwareUpdates() {
  const appInfo = useAppStore((state) => state.appInfo);
  const [phase, setPhase] = useState<Phase>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    return () => {
      if (updateRef.current) void updateRef.current.close();
    };
  }, []);

  const checkForUpdates = async () => {
    setPhase("checking");
    setError(null);
    setProgress(null);
    try {
      if (updateRef.current) {
        await updateRef.current.close();
        updateRef.current = null;
      }
      const result = await check({ timeout: 20_000 });
      setLastChecked(new Date().toISOString());
      if (result) {
        updateRef.current = result;
        setUpdate(result);
        setLatestVersion(result.version);
        setPhase("available");
      } else {
        setUpdate(null);
        setLatestVersion(appInfo?.version ?? null);
        setPhase("up-to-date");
      }
    } catch (updateError) {
      setLastChecked(new Date().toISOString());
      setError(messageFrom(updateError));
      setPhase("error");
    }
  };

  const downloadAndInstall = async () => {
    if (!update || phase === "downloading" || phase === "installing") return;
    setPhase("downloading");
    setError(null);
    setProgress({ downloaded: 0, total: 0 });

    try {
      await update.download((event) => {
        if (event.event === "Started") {
          setProgress((current) => ({
            downloaded: current?.downloaded ?? 0,
            total: event.data.contentLength ?? 0,
          }));
        } else if (event.event === "Progress") {
          setProgress((current) => ({
            downloaded: (current?.downloaded ?? 0) + event.data.chunkLength,
            total: current?.total ?? 0,
          }));
        } else if (event.event === "Finished") {
          setProgress((current) => ({
            downloaded: current?.downloaded ?? 0,
            total: current?.total ?? current?.downloaded ?? 0,
          }));
        }
      });

      setPhase("installing");
      await update.install();
      setPhase("restart-required");
    } catch (installError) {
      setError(messageFrom(installError));
      setPhase("error");
    }
  };

  const restart = async () => {
    try {
      await relaunch();
    } catch (relaunchError) {
      // The update is already installed; keep the restart action available.
      setError(messageFrom(relaunchError));
      setPhase("restart-required");
    }
  };

  const busy = phase === "checking" || phase === "downloading" || phase === "installing";
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <Card className="p-5" id="software-updates">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-muted text-ink-secondary">
          <RefreshCw className="h-4 w-4" strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
            Software Updates
          </h2>
          <p className="mt-0.5 text-[10.5px] text-ink-tertiary">
            Signed updates from the AirLink GitHub release feed.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-hairline bg-surface-muted/50 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-tertiary">
            Installed
          </p>
          <p className="mt-1 font-mono text-[12px] text-ink">
            {appInfo?.version ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface-muted/50 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-tertiary">
            Latest available
          </p>
          <p className="mt-1 font-mono text-[12px] text-ink">
            {latestVersion ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface-muted/50 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-tertiary">
            Last checked
          </p>
          <p className="mt-1 text-[12px] text-ink">
            {lastChecked ? formatDateTime(lastChecked) : "Not checked yet"}
          </p>
        </div>
      </div>

      {phase === "available" && update ? (
        <div className="mt-3 rounded-lg border border-brand/20 bg-brand-soft/60 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="text-[11.5px] font-medium text-brand-ink">
                Version {update.version} is available
              </p>
              {update.body ? (
                <div className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-brand/10 bg-surface/70 p-2 text-[10.5px] leading-relaxed text-ink-secondary">
                  {update.body}
                </div>
              ) : (
                <p className="mt-0.5 text-[10.5px] text-ink-secondary">
                  No release notes were provided.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {phase === "up-to-date" ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand/20 bg-brand-soft/60 px-3 py-2.5 text-[11px] text-brand-ink">
          <CircleCheck className="h-3.5 w-3.5 shrink-0" />
          AirLink is up to date.
        </div>
      ) : null}

      {phase === "downloading" ? (
        <div className="mt-3 rounded-lg border border-hairline bg-surface-muted px-3 py-2.5">
          <div className="flex items-center justify-between gap-3 text-[10.5px] text-ink-secondary">
            <span>Downloading signed update…</span>
            <span className="font-mono text-ink-tertiary">
              {percent !== null ? `${percent}%` : progress ? formatBytes(progress.downloaded) : ""}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hairline-strong">
            {percent !== null ? (
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            ) : (
              <div className="indeterminate-bar h-full w-1/3 rounded-full bg-brand" />
            )}
          </div>
          {progress && progress.total > 0 ? (
            <p className="mt-1.5 font-mono text-[9.5px] text-ink-tertiary">
              {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === "installing" ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-hairline bg-surface-muted px-3 py-2.5 text-[11px] text-ink-secondary">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-brand" />
          Installing the verified update…
        </div>
      ) : null}

      {phase === "restart-required" ? (
        <div className="mt-3 rounded-lg border border-brand/20 bg-brand-soft/60 px-3 py-2.5">
          <p className="text-[11.5px] font-medium text-brand-ink">
            Update installed. Restart AirLink to finish.
          </p>
          <p className="mt-0.5 text-[10.5px] text-ink-secondary">
            The new version starts only after the app relaunches.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          <p className="text-[10.5px] leading-relaxed text-danger">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={phase === "checking"}
          disabled={busy || phase === "restart-required"}
          onClick={() => void checkForUpdates()}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Check for Updates
        </Button>
        {phase === "available" ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => void downloadAndInstall()}
            icon={<Download className="h-3.5 w-3.5" />}
          >
            Download &amp; install {update?.version}
          </Button>
        ) : null}
        {phase === "restart-required" ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => void restart()}
            icon={<RotateCcw className="h-3.5 w-3.5" />}
          >
            Restart to Update
          </Button>
        ) : null}
        <span className="inline-flex items-center gap-1.5 text-[9.5px] text-ink-tertiary">
          <ShieldCheck className="h-3 w-3 text-brand" />
          Signature verification is mandatory.
        </span>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-tertiary">
        Updates are fetched from the public AirLink GitHub releases feed and
        verified against the updater public key embedded in this build. AirLink
        never installs an unsigned update.
      </p>
    </Card>
  );
}
