import { describe, expect, it } from "vitest";
import { cartTotal, demoReducer, initialDemoState } from "@/components/landing-demo/demo-data";

describe("landing demo", () => {
  it("totals cart and gives change", () => {
    let s = demoReducer(initialDemoState, { type: "add", id: "lm" });
    s = demoReducer(s, { type: "add", id: "coke" });
    expect(cartTotal(s.cart)).toBe(36);
    s = demoReducer(s, { type: "pay", tendered: 50 });
    expect(s.paid?.change).toBe(14);
    expect(s.cash).toBe(initialDemoState.cash + 36);
  });
  it("Cash In ₱500 with ₱10 fee: GCash −500, cash +510", () => {
    const s = demoReducer(initialDemoState, { type: "gcash", kind: "in", amount: 500, fee: 10 });
    expect(s.gcash).toBe(initialDemoState.gcash - 500);
    expect(s.cash).toBe(initialDemoState.cash + 510);
  });
});
