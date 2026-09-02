import { Link, createFileRoute } from "@tanstack/react-router";
import { BarChart3, Boxes, ChevronRight, Settings, Wallet } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { useAppSession } from "@/hooks/use-app-session";

export const Route = createFileRoute("/_authenticated/more")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "More — SariPOS" },
      { name: "description", content: "Inventory, expenses, reports, and settings for your store." },
      { property: "og:title", content: "More — SariPOS" },
      { property: "og:description", content: "All the other SariPOS tools in one place." },
    ],
  }),
  component: MorePage,
});

const LINKS = [
  { to: "/inventory", label: "Inventory", description: "Stock in, adjust, and history", icon: Boxes },
  { to: "/expenses", label: "Expenses", description: "Daily store costs", icon: Wallet },
  { to: "/reports", label: "Reports", description: "Sales, profit, best sellers", icon: BarChart3 },
  { to: "/settings", label: "Settings", description: "Store details, sync, account", icon: Settings },
] as const;

function MorePage() {
  const { store, role } = useAppSession();

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
    </AppShell>
  );
}
