import type { LucideIcon } from "lucide-react";
import {
  CircleAlert,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  ShieldAlert,
  TimerOff,
  WifiOff,
} from "lucide-react";
import type { ConnectionState, NetworkStatus } from "../types";

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

export interface StatusMeta {
  label: string;
  headline: string;
  tone: StatusTone;
  icon: LucideIcon;
  isOnline: boolean;
  needsAttention: boolean;
}

const STATE_META: Record<ConnectionState, StatusMeta> = {
  disconnected: {
    label: "Disconnected",
    headline: "Connect to a Wi-Fi network",
    tone: "neutral",
    icon: WifiOff,
    isOnline: false,
    needsAttention: false,
  },
  connecting: {
    label: "Checking connection",
    headline: "Getting your network ready",
    tone: "info",
    icon: LoaderCircle,
    isOnline: false,
    needsAttention: false,
  },
  authentication_required: {
    label: "Sign-in required",
    headline: "This network needs a sign-in",
    tone: "warning",
    icon: LogIn,
    isOnline: false,
    needsAttention: true,
  },
  portal_detected: {
    label: "Portal detected",
    headline: "The campus network is asking you to sign in",
    tone: "warning",
    icon: ShieldAlert,
    isOnline: false,
    needsAttention: true,
  },
  authenticating: {
    label: "Verifying",
    headline: "Confirming your connection",
    tone: "info",
    icon: LoaderCircle,
    isOnline: false,
    needsAttention: false,
  },
  authenticated: {
    label: "Authenticated",
    headline: "You're signed in and online",
    tone: "success",
    icon: LockKeyhole,
    isOnline: true,
    needsAttention: false,
  },
  internet_available: {
    label: "Internet available",
    headline: "You're connected to the internet",
    tone: "success",
    icon: Globe2,
    isOnline: true,
    needsAttention: false,
  },
  session_expired: {
    label: "Session expired",
    headline: "Your Wi-Fi session has expired",
    tone: "warning",
    icon: TimerOff,
    isOnline: false,
    needsAttention: true,
  },
  connection_error: {
    label: "Connection problem",
    headline: "We can't reach the internet",
    tone: "danger",
    icon: CircleAlert,
    isOnline: false,
    needsAttention: true,
  },
};

export function statusMeta(state: ConnectionState): StatusMeta {
  return STATE_META[state] ?? STATE_META.connection_error;
}

export function isOnlineState(state: ConnectionState): boolean {
  return state === "internet_available" || state === "authenticated";
}

export function needsPortal(state: ConnectionState): boolean {
  return (
    state === "portal_detected" ||
    state === "authentication_required" ||
    state === "session_expired"
  );
}

export function statusDescription(status: NetworkStatus): string {
  if (status.wifi.ssidRestricted && status.wifi.associated) {
    return "macOS is hiding this network's name. Grant Location access to reveal it — your location is never recorded.";
  }
  if (status.message) return status.message;
  return status.connectivity.detail;
}

export function toneClasses(tone: StatusTone): string {
  switch (tone) {
    case "success":
      return "border-brand/20 bg-brand-soft text-brand-dark";
    case "warning":
      return "border-warning/25 bg-warning-soft text-warning";
    case "danger":
      return "border-danger/20 bg-danger-soft text-danger";
    case "info":
      return "border-info/20 bg-info-soft text-info";
    default:
      return "border-hairline bg-surface-muted text-ink-secondary";
  }
}

export function toneDot(tone: StatusTone): string {
  switch (tone) {
    case "success":
      return "bg-brand";
    case "warning":
      return "bg-warning";
    case "danger":
      return "bg-danger";
    case "info":
      return "bg-info";
    default:
      return "bg-ink-tertiary";
  }
}

export const probeOutcomeMeta: Record<
  string,
  { label: string; tone: StatusTone }
> = {
  internet: { label: "Passed", tone: "success" },
  redirect: { label: "Redirected", tone: "warning" },
  portal_content: { label: "Sign-in page", tone: "warning" },
  http_error: { label: "HTTP error", tone: "danger" },
  unexpected_response: { label: "Unexpected reply", tone: "warning" },
  timeout: { label: "Timed out", tone: "danger" },
  dns_failure: { label: "DNS failed", tone: "danger" },
  connection_failure: { label: "Unreachable", tone: "danger" },
  tls_error: { label: "TLS failed", tone: "danger" },
};
