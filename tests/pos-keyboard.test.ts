import { describe, expect, it } from "vitest";
import { shouldFocusPosSearch } from "@/lib/pos-keyboard";

const key = { key: "k", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false };
describe("POS search shortcuts", () => {
  it("accepts Ctrl K, Cmd K and bare slash", () => {
    expect(shouldFocusPosSearch(key, false, false)).toBe(true);
    expect(shouldFocusPosSearch({ ...key, ctrlKey: false, metaKey: true }, false, false)).toBe(true);
    expect(shouldFocusPosSearch({ ...key, key: "/", ctrlKey: false }, false, false)).toBe(true);
  });
  it("does not steal text entry or keys inside an overlay", () => {
    expect(shouldFocusPosSearch(key, true, false)).toBe(false);
    expect(shouldFocusPosSearch(key, false, true)).toBe(false);
  });
  it("ignores composing, repeat and checkout keys", () => {
    expect(shouldFocusPosSearch({ ...key, isComposing: true }, false, false)).toBe(false);
    expect(shouldFocusPosSearch({ ...key, repeat: true }, false, false)).toBe(false);
    expect(shouldFocusPosSearch({ ...key, key: "Enter" }, false, false)).toBe(false);
  });
});