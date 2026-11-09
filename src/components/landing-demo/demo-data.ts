// Sample data and pure state logic for the landing-page demo.
// Demo only: never imports the device database or the cloud.

export type DemoProduct = { id: string; name: string; price: number; stock: number; low: number };
export type DemoCustomer = { name: string; balance: number; history: string[] };

export const DEMO_PRODUCTS: DemoProduct[] = [
  { id: "lm", name: "Lucky Me Pancit Canton", price: 16, stock: 24, low: 10 },
  { id: "coke", name: "Coke Mismo", price: 20, stock: 3, low: 6 },
  { id: "kopiko", name: "Kopiko 3-in-1", price: 12, stock: 40, low: 10 },
  { id: "safeguard", name: "Safeguard Soap", price: 35, stock: 8, low: 5 },
  { id: "bread", name: "Pandesal (10 pcs)", price: 30, stock: 2, low: 5 },
  { id: "egg", name: "Itlog (1 pc)", price: 9, stock: 30, low: 12 },
];

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  { name: "Aling Rosa", balance: 250, history: ["Nob 2 · Utang ₱150", "Nob 5 · Utang ₱100"] },
  { name: "Mang Jun", balance: 85, history: ["Nob 6 · Utang ₱120", "Nob 7 · Bayad ₱35"] },
  { name: "Ate Liza", balance: 0, history: ["Nob 1 · Utang ₱60", "Nob 4 · Bayad ₱60"] },
];

export type DemoState = {
  cart: Record<string, number>;
  sales: number;
  cash: number;
  gcash: number;
  paid: { total: number; tendered: number; change: number } | null;
};

export const initialDemoState: DemoState = {
  cart: {},
  sales: 1840,
  cash: 2350,
  gcash: 5000,
  paid: null,
};

export type DemoAction =
  | { type: "add"; id: string }
  | { type: "remove"; id: string }
  | { type: "pay"; tendered: number }
  | { type: "gcash"; kind: "in" | "out"; amount: number; fee: number }
  | { type: "reset" };

export function cartTotal(cart: Record<string, number>): number {
  return DEMO_PRODUCTS.reduce((sum, p) => sum + (cart[p.id] ?? 0) * p.price, 0);
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "add":
      return { ...state, paid: null, cart: { ...state.cart, [action.id]: (state.cart[action.id] ?? 0) + 1 } };
    case "remove": {
      const cart = { ...state.cart };
      const qty = cart[action.id] ?? 0;
      if (qty <= 1) delete cart[action.id];
      else cart[action.id] = qty - 1;
      return { ...state, cart };
    }
    case "pay": {
      const total = cartTotal(state.cart);
      if (total <= 0 || action.tendered < total) return state;
      return {
        ...state,
        cart: {},
        sales: state.sales + total,
        cash: state.cash + total,
        paid: { total, tendered: action.tendered, change: action.tendered - total },
      };
    }
    case "gcash": {
      // Cash In: customer gives cash, store sends GCash. Cash Out: the opposite. Fee paid in cash.
      const sign = action.kind === "in" ? 1 : -1;
      return {
        ...state,
        gcash: state.gcash - sign * action.amount,
        cash: state.cash + sign * action.amount + action.fee,
      };
    }
    case "reset":
      return initialDemoState;
  }
}

export const peso = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
