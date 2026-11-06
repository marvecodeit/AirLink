import { describe, expect, it } from "vitest";
import { isOnlineState, needsPortal, statusMeta } from "./status";

describe("connection state metadata", () => {
  it("marks internet states online", () => {
    expect(isOnlineState("internet_available")).toBe(true);
    expect(isOnlineState("authenticated")).toBe(true);
    expect(isOnlineState("portal_detected")).toBe(false);
  });

  it("marks portal states as needing attention", () => {
    expect(needsPortal("portal_detected")).toBe(true);
    expect(needsPortal("authentication_required")).toBe(true);
    expect(needsPortal("session_expired")).toBe(true);
    expect(needsPortal("internet_available")).toBe(false);
  });

  it("provides a visual tone and label for every state", () => {
    const states = [
      "disconnected",
      "connecting",
      "authentication_required",
      "portal_detected",
      "authenticating",
      "authenticated",
      "internet_available",
      "session_expired",
      "connection_error",
    ] as const;

    for (const state of states) {
      const meta = statusMeta(state);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.headline.length).toBeGreaterThan(0);
      expect(meta.icon).toBeTruthy();
    }
  });
});
