import { describe, expect, it } from "vitest";
import { authSearch, landingDestination } from "@/lib/landing-entry";

describe("public landing entry", () => {
  it("keeps logged-out browser visitors on the landing page", () => {
    expect(landingDestination("signed-out", "web")).toBeNull();
  });
  it("never redirects an unresolved session", () => {
    for (const platform of ["web", "pwa", "capacitor"] as const) {
      expect(landingDestination("loading", platform)).toBeNull();
    }
  });
  it("takes resolved and cached store sessions directly to dashboard", () => {
    for (const platform of ["web", "pwa", "capacitor"] as const) {
      expect(landingDestination("ready", platform)).toBe("/dashboard");
    }
  });
  it("keeps store-less users in onboarding", () => {
    expect(landingDestination("no-store", "web")).toBe("/onboarding");
    expect(landingDestination("no-store", "capacitor")).toBe("/onboarding");
  });
  it("keeps installed signed-out users in the existing login flow", () => {
    expect(landingDestination("signed-out", "pwa")).toBe("/auth");
    expect(landingDestination("signed-out", "capacitor")).toBe("/auth");
  });
  it("opens signup explicitly and ignores invalid mode values", () => {
    expect(authSearch({ mode: "signup" })).toEqual({ mode: "signup" });
    expect(authSearch({ mode: "signin" })).toEqual({ mode: "signin" });
    expect(authSearch({ mode: "unexpected" })).toEqual({});
    expect(authSearch({})).toEqual({});
  });
});