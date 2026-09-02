import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  LayoutGrid,
  MoreHorizontal,
  Package,
  Receipt,
  Settings,
  ShoppingBasket,
  Store,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import { ConnectionChip, useConnection } from "@/components/connection-chip";
import { useAppSession } from "@/hooks/use-app-session";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/pos", label: "POS", icon: ShoppingBasket },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  action?: ReactNode | undefined;
  children: ReactNode;
}) {
  const { store } = useAppSession();
  const { connection } = useConnection();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-6xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 border-r bg-sidebar p-4 lg:flex">
          <div className="mb-4 flex items-center gap-2">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Store className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold">{store?.name ?? "BentaKo"}</p>
              <p className="text-xs text-muted-foreground">BentaKo</p>
            </div>
          </div>
          {NAV.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </aside>

        <div className="min-w-0 flex-1 pb-28 lg:pb-8">
          <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-bold leading-tight sm:text-xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {action}
                <ConnectionChip />
                <button
                  type="button"
                  aria-label="Sign out"
                  onClick={async () => {
                    await signOut();
                    void navigate({ to: "/auth", replace: true });
                  }}
                  className="grid size-9 place-items-center rounded-xl border text-muted-foreground active:bg-accent/10"
                >
                  <LogOut className="size-4" />
                </button>
              </div>

            </div>
            {connection === "offline" ? (
              <p className="bg-warning/15 px-4 py-1.5 text-center text-xs font-medium text-accent-foreground">
                Offline mode — sales are saved here and sync automatically later.
              </p>
            ) : null}
          </header>

          <main className="px-4 py-4">{children}</main>
        </div>
      </div>

      <BottomNav pathname={pathname} />
    </div>
  );
}

const MOBILE_NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutGrid },
  { to: "/products", label: "Products", icon: Package },
  { to: "/pos", label: "POS", icon: ShoppingBasket },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/more", label: "More", icon: MoreHorizontal },
] as const;

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pb-1 pt-1.5">
        {MOBILE_NAV.map((item) => {
          const active = pathname.startsWith(item.to);
          if (item.to === "/pos") {
            return (
              <li key={item.to} className="flex justify-center">
                <Link
                  to="/pos"
                  aria-label="Open POS"
                  className="-mt-7 flex size-16 flex-col items-center justify-center gap-0.5 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95"
                >
                  <ShoppingBasket className="size-6" />
                  <span className="text-[10px] font-bold uppercase tracking-wide">POS</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function EmptyState({
  icon: Icon = Package,
  title,
  description,
  action,
}: {
  icon?: typeof Package;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 font-display text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
