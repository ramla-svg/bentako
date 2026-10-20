import { describe, expect, it } from "vitest";
import { selectedQuickCashIndex } from "@/lib/format";

describe("quick cash selection", () => {
  it("gives Exact precedence over duplicate denominations at rounded cents", () => {
    expect(selectedQuickCashIndex("100", 100, true)).toBe(0);
    expect(selectedQuickCashIndex("100.004", 100.003, true)).toBe(0);
  });

  it("tracks manual cash edits and changed cart totals without stored selection", () => {
    expect(selectedQuickCashIndex("50", 35, true)).toBe(2);
    expect(selectedQuickCashIndex("35", 35, true)).toBe(0);
    expect(selectedQuickCashIndex("35", 36, true)).toBe(-1);
    expect(selectedQuickCashIndex("50", 50, true)).toBe(0);
    expect(selectedQuickCashIndex("50", 60, true)).toBe(2);
    expect(selectedQuickCashIndex("50.01", 60, true)).toBe(-1);
  });

  it("does not select Exact for empty or invalid input or an empty cart", () => {
    for (const cash of ["", " ", ".", "1.2.3", "Infinity", "-20"]) {
      expect(selectedQuickCashIndex(cash, 20, true)).toBe(-1);
    }
    expect(selectedQuickCashIndex("0", 0, false)).toBe(-1);
    expect(selectedQuickCashIndex("35", 35, false)).toBe(-1);
    expect(selectedQuickCashIndex("20", 20, false)).toBe(1);
  });

  it("selects each preset denomination", () => {
    [20, 50, 100, 200, 500, 1000].forEach((amount, index) => {
      expect(selectedQuickCashIndex(String(amount), 12, true)).toBe(index + 1);
    });
  });
});
