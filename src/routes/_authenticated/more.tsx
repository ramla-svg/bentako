import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Banknote,
  BarChart3,
  Boxes,
  ChevronRight,
  Coins,
  HandCoins,
  LogOut,
  Settings,
  Wallet,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { useAppSession } from "@/hooks/use-app-session";

export const Route = createFileRoute("/_authenticated/more")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "More — BentaKo" },
      { name: "description", content: "Inventory, expenses, reports, and settings for your store." },
      { property: "og:title", content: "More — BentaKo" },
      { property: "og:description", content: "All the other BentaKo tools in one place." },
    ],
  }),
  component: MorePage,
});

const LINKS = [
  { to: "/inventory", label: "Inventory", description: "Stock in, adjust, and history", icon: Boxes },
  { to: "/cash", label: "Cash ledger", description: "Drawer, GCash, Maya, bank", icon: Coins },
  { to: "/utang", label: "Utang", description: "Who owes you and how much", icon: HandCoins },
  { to: "/payments", label: "Payments", description: "Everything you received", icon: Banknote },
  { to: "/expenses", label: "Expenses", description: "Daily store costs", icon: Wallet },
  { to: "/reports", label: "Reports", description: "Sales, profit, best sellers", icon: BarChart3 },
  { to: "/settings", label: "Settings", description: "Store details, sync, account", icon: Settings },
] as const;

function MorePage() {
  const { store, role, signOut } = useAppSession();
  const queryClient = useQueryClient();

  return (
    <AppShell title="More" subtitle={`${store?.name ?? ""} · ${role === "owner" ? "Owner" : "Cashier"}`}>
      <ul className="space-y-2">
        {LINKS.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="flex items-center gap-3 rounded-2xl border bg-card p-4 active:bg-accent/10"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <item.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{item.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={async () => {
          await queryClient.cancelQueries();
          queryClient.clear();
          await signOut();
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border p-4 font-semibold text-destructive active:bg-accent/10"
      >
        <LogOut className="size-4" /> Sign out
      </button>
    </AppShell>
  );
}
