const relativeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "Not checked yet";
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "Not checked yet";
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absolute = Math.abs(diffSeconds);

  if (absolute < 10) return "Just now";
  if (absolute < 60) return relativeFormatter.format(diffSeconds, "second");
  if (absolute < 3600) {
    return relativeFormatter.format(Math.round(diffSeconds / 60), "minute");
  }
  if (absolute < 86_400) {
    return relativeFormatter.format(Math.round(diffSeconds / 3600), "hour");
  }
  return relativeFormatter.format(Math.round(diffSeconds / 86_400), "day");
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatLatency(latency: number | null): string {
  if (latency === null) return "—";
  return `${Math.round(latency)} ms`;
}

export function prettyHost(value: string | null): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.host + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return value;
  }
}

export function shortenMiddle(value: string, max = 42): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\*\./, "");
}

export function networkDisplayName(ssid: string | null, restricted: boolean): string {
  if (ssid) return ssid;
  if (restricted) return "Wi-Fi network hidden";
  return "No Wi-Fi network";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
