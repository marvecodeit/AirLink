import { describe, expect, it } from "vitest";
import {
  formatLatency,
  isValidHttpUrl,
  networkDisplayName,
  normalizeDomain,
  prettyHost,
  relativeTime,
  shortenMiddle,
} from "./format";

describe("relativeTime", () => {
  const now = Date.parse("2026-11-04T14:00:00Z");

  it("returns a friendly fallback for missing or invalid dates", () => {
    expect(relativeTime(null, now)).toBe("Not checked yet");
    expect(relativeTime("not-a-date", now)).toBe("Not checked yet");
  });

  it("formats recent and older timestamps", () => {
    expect(relativeTime("2026-11-04T13:59:56Z", now)).toBe("Just now");
    expect(relativeTime("2026-11-04T13:59:00Z", now)).toBe("1 minute ago");
  });
});

describe("url helpers", () => {
  it("only accepts http and https URLs", () => {
    expect(isValidHttpUrl("https://portal.example.edu/login")).toBe(true);
    expect(isValidHttpUrl("http://10.0.0.1")).toBe(true);
    expect(isValidHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("portal")).toBe(false);
  });

  it("prints hosts with a path", () => {
    expect(prettyHost("https://portal.example.edu/login?next=1")).toBe(
      "portal.example.edu/login",
    );
    expect(prettyHost("https://portal.example.edu/")).toBe(
      "portal.example.edu",
    );
  });

  it("normalizes trusted domains", () => {
    expect(normalizeDomain(" HTTPS://Login.Example.EDU/path ")).toBe(
      "login.example.edu",
    );
    expect(normalizeDomain("*.example.edu")).toBe("example.edu");
  });
});

describe("display helpers", () => {
  it("handles restricted network names", () => {
    expect(networkDisplayName("Campus", false)).toBe("Campus");
    expect(networkDisplayName(null, true)).toBe("Wi-Fi network hidden");
    expect(networkDisplayName(null, false)).toBe("No Wi-Fi network");
  });

  it("shortens long values in the middle", () => {
    expect(shortenMiddle("short", 10)).toBe("short");
    expect(shortenMiddle("abcdefghijklmnop", 9)).toContain("…");
  });

  it("formats latency", () => {
    expect(formatLatency(null)).toBe("—");
    expect(formatLatency(21.6)).toBe("22 ms");
  });
});
