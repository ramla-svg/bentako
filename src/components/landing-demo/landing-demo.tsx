import { useReducer, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DEMO_CUSTOMERS,
  DEMO_PRODUCTS,
  cartTotal,
  demoReducer,
  initialDemoState,
  peso,
} from "./demo-data";

const TABS = [
  { id: "home", label: "Dashboard" },
  { id: "pos", label: "Benta" },
  { id: "utang", label: "Utang" },
  { id: "gcash", label: "GCash" },
  { id: "stock", label: "Stock" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function LandingDemo() {
  const [tab, setTab] = useState<Tab>("home");
  const [wide, setWide] = useState(false);
  const [state, dispatch] = useReducer(demoReducer, initialDemoState);
  const [customer, setCustomer] = useState<string | null>(null);
  const [gcashMsg, setGcashMsg] = useState<string | null>(null);
  const total = cartTotal(state.cart);
  const lowStock = DEMO_PRODUCTS.filter((p) => p.stock <= p.low);

  const gcash = (kind: "in" | "out") => {
    dispatch({ type: "gcash", kind, amount: 500, fee: 10 });
    setGcashMsg(
      kind === "in"
        ? "Cash In ₱500 · GCash −₱500 · Cash on hand +₱510"
        : "Cash Out ₱500 · GCash +₱500 · Cash on hand −₱490",
    );
  };

  return (
    <section id="demo" className="landing-demo" aria-labelledby="demo-title">
      <div className="landing-container">
        <span className="landing-section-label">SUBUKAN MO — LIVE DEMO</span>
        <h2 id="demo-title">I-tap ang mismong mga screen ng BentaKo.</h2>
        <p className="demo-notice" role="note">
          Demo lang ito — sample na tindahan, walang totoong datos. Walang nase-save.
        </p>
        <div className="demo-toolbar">
          <div role="group" aria-label="Laki ng demo">
            <button type="button" aria-pressed={!wide} onClick={() => setWide(false)}>Phone</button>
            <button type="button" aria-pressed={wide} onClick={() => setWide(true)}>Desktop</button>
          </div>
          <button type="button" onClick={() => { dispatch({ type: "reset" }); setGcashMsg(null); setCustomer(null); }}>
            Reset demo
          </button>
        </div>

        <div className={wide ? "demo-frame demo-wide" : "demo-frame"}>
          <div className="demo-screen" aria-live="polite">
            {tab === "home" && (
              <div className="demo-stack">
                <p className="demo-greet">Magandang araw, Aling Nena ☀</p>
                <div className="demo-grid">
                  <div className="demo-card mint"><span>Benta ngayon</span><b>{peso(state.sales)}</b></div>
                  <div className="demo-card peach"><span>Cash on hand</span><b>{peso(state.cash)}</b></div>
                  <div className="demo-card sky"><span>GCash balance</span><b>{peso(state.gcash)}</b></div>
                  <div className="demo-card lavender"><span>Mababang stock</span><b>{lowStock.length} item</b></div>
                </div>
                <button type="button" className="demo-primary" onClick={() => setTab("pos")}>+ Bagong benta</button>
              </div>
            )}

            {tab === "pos" && (
              <div className="demo-stack">
                <div className="demo-products">
                  {DEMO_PRODUCTS.map((p) => (
                    <button type="button" key={p.id} className="demo-product" onClick={() => dispatch({ type: "add", id: p.id })}>
                      <span>{p.name}</span><b>{peso(p.price)}</b>
                      {state.cart[p.id] ? <em>×{state.cart[p.id]}</em> : null}
                    </button>
                  ))}
                </div>
                {state.paid ? (
                  <div className="demo-receipt" aria-label="Sample na resibo">
                    <b>SARI-SARI NI ALING NENA</b>
                    <span>Kabuuan: {peso(state.paid.total)}</span>
                    <span>Bayad: {peso(state.paid.tendered)}</span>
                    <strong>Sukli: {peso(state.paid.change)}</strong>
                    <small>Salamat po! (sample na resibo)</small>
                  </div>
                ) : (
                  <div className="demo-cart">
                    <div className="demo-total"><span>Kabuuan</span><b>{peso(total)}</b></div>
                    <div className="demo-quick">
                      {[total, 50, 100, 500].map((amt, i) => (
                        <button type="button" key={i} disabled={total === 0 || amt < total} onClick={() => dispatch({ type: "pay", tendered: amt })}>
                          {i === 0 ? "Exact" : peso(amt)}
                        </button>
                      ))}
                    </div>
                    <p className="demo-hint">{total === 0 ? "I-tap ang produkto para idagdag." : "Pumili ng bayad para makita ang sukli."}</p>
                  </div>
                )}
              </div>
            )}

            {tab === "utang" && (
              <ul className="demo-list">
                {DEMO_CUSTOMERS.map((c) => (
                  <li key={c.name}>
                    <button type="button" aria-expanded={customer === c.name} onClick={() => setCustomer(customer === c.name ? null : c.name)}>
                      <span>{c.name}</span><b>{c.balance ? peso(c.balance) : "Bayad na"}</b>
                    </button>
                    {customer === c.name && <ul className="demo-history">{c.history.map((h) => <li key={h}>{h}</li>)}</ul>}
                  </li>
                ))}
              </ul>
            )}

            {tab === "gcash" && (
              <div className="demo-stack">
                <div className="demo-grid">
                  <div className="demo-card sky"><span>GCash</span><b>{peso(state.gcash)}</b></div>
                  <div className="demo-card peach"><span>Cash on hand</span><b>{peso(state.cash)}</b></div>
                </div>
                <div className="demo-quick">
                  <button type="button" onClick={() => gcash("in")}>Cash In ₱500</button>
                  <button type="button" onClick={() => gcash("out")}>Cash Out ₱500</button>
                </div>
                <p className="demo-hint">{gcashMsg ?? "May ₱10 fee na binayad nang cash. Awtomatikong nag-a-update ang Cash on hand."}</p>
              </div>
            )}

            {tab === "stock" && (
              <ul className="demo-list">
                {DEMO_PRODUCTS.map((p) => (
                  <li key={p.id}>
                    <div className="demo-row">
                      <span>{p.name}</span>
                      <b>{p.stock} pcs {p.stock <= p.low && <em className="demo-low">Mababa</em>}</b>
                    </div>
                  </li>
                ))}
                <li className="demo-hint">Product photos at cloud save: kasama sa Pro.</li>
              </ul>
            )}
          </div>
          <nav className="demo-tabs" aria-label="Demo screens">
            {TABS.map((t) => (
              <button type="button" key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="demo-cta">
          <Button asChild className="landing-button">
            <Link to="/auth" search={{ mode: "signup" }}>Simulan nang libre</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
