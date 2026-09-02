import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, Store } from "lucide-react";

import { useAppSession } from "@/hooks/use-app-session";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "BentaKo — Sari-Sari Store POS that works offline" },
      {
        name: "description",
        content:
          "Sell fast, track stock, and record expenses in your sari-sari store — even with no internet. BentaKo syncs automatically when you're back online.",
      },
      { property: "og:title", content: "BentaKo — Sari-Sari Store POS that works offline" },
      {
        property: "og:description",
        content: "Tap product, enter payment, see change. Built for Philippine sari-sari stores.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { status } = useAppSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "ready") void navigate({ to: "/dashboard", replace: true });
    if (status === "no-store") void navigate({ to: "/onboarding", replace: true });
    if (status === "signed-out") void navigate({ to: "/auth", replace: true });
  }, [status, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary text-primary-foreground">
          <Store className="size-8" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-extrabold">BentaKo</h1>
        <p className="mt-2 text-sm text-muted-foreground">Bilis ng tindahan, kahit walang internet.</p>
        <Loader2 className="mx-auto mt-6 size-5 animate-spin text-primary" />
      </div>
    </div>
  );
}
