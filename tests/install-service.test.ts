import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetInstallForTests,
  canInstall,
  installGuideFor,
  isInstallPromptSnoozed,
  promptInstall,
  snoozeInstallPrompt,
} from "@/lib/platform/install-service";

const mem = new Map<string, string>();
const memStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  clear: () => mem.clear(),
};
Object.defineProperty(globalThis, "localStorage", {
  value: memStorage,
  configurable: true,
  writable: true,
});

function fakeEvent(outcome: "accepted" | "dismissed", fail = false) {
  return Object.assign({ type: "beforeinstallprompt" } as unknown as Event, {
    prompt: vi.fn(async () => {
      if (fail) throw new Error("x");
    }),
    userChoice: Promise.resolve({ outcome }),
  });
}

describe("install prompt", () => {
  beforeEach(() => {
    __resetInstallForTests();
    localStorage.clear();
  });
  it("consumes the event after accepted", async () => {
    __resetInstallForTests(fakeEvent("accepted"));
    expect(await promptInstall()).toBe("accepted");
    expect(canInstall()).toBe(false);
  });
  it("consumes the event after dismissed, no re-prompt", async () => {
    const e = fakeEvent("dismissed");
    __resetInstallForTests(e);
    expect(await promptInstall()).toBe("dismissed");
    expect(await promptInstall()).toBe("unavailable");
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });
  it("error clears the event and reports unavailable", async () => {
    __resetInstallForTests(fakeEvent("accepted", true));
    expect(await promptInstall()).toBe("unavailable");
    expect(canInstall()).toBe(false);
  });
  it("double click prompts once", async () => {
    const e = fakeEvent("accepted");
    __resetInstallForTests(e);
    const [a, b] = await Promise.all([promptInstall(), promptInstall()]);
    expect([a, b]).toEqual(["accepted", "busy"]);
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });
  it("snooze lasts 7 days", () => {
    const now = 1_000_000;
    snoozeInstallPrompt(now);
    expect(isInstallPromptSnoozed(now + 6.9 * 864e5)).toBe(true);
    expect(isInstallPromptSnoozed(now + 7.1 * 864e5)).toBe(false);
  });
  it("blocked storage does not crash", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    Object.defineProperty(globalThis, "localStorage", { value: blocked, configurable: true });
    expect(() => snoozeInstallPrompt()).not.toThrow();
    expect(isInstallPromptSnoozed()).toBe(false);
    Object.defineProperty(globalThis, "localStorage", { value: memStorage, configurable: true });
  });
  it("picks manual guides per browser", () => {
    expect(
      installGuideFor("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17 Mobile Safari/604.1"),
    ).toBe("ios-safari");
    expect(installGuideFor("Mozilla/5.0 (iPhone) CriOS/120 Mobile Safari")).toBe("ios-other");
    expect(installGuideFor("Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/17 Safari/605")).toBe(
      "mac-safari",
    );
    expect(installGuideFor("Mozilla/5.0 (Android 14) Gecko Firefox/125")).toBe("firefox");
    expect(installGuideFor("Mozilla/5.0 (Android 14) FBAV/400 Chrome/120")).toBe("in-app");
    expect(installGuideFor("Mozilla/5.0 (Windows) Chrome/120 Safari/537 Edg/120")).toBe(
      "chromium-desktop",
    );
  });
  it("distinguishes desktop installation from Android home-screen guidance", () => {
    expect(installGuideFor("Mozilla/5.0 (Android 14) Chrome/120 Mobile Safari/537")).toBe(
      "chromium",
    );
    expect(installGuideFor("Mozilla/5.0 (Macintosh) Chrome/120 Safari/537")).toBe(
      "chromium-desktop",
    );
    expect(installGuideFor("Mozilla/5.0 (Linux x86_64) Chromium/120")).toBe("chromium-desktop");
  });
});
