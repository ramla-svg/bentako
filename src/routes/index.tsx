import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, Store } from "lucide-react";
import { PublicLanding } from "@/components/public-landing";
import { landingDestination } from "@/lib/landing-entry";
import { platformKind } from "@/lib/platform/platform-service";

import { useAppSession } from "@/hooks/use-app-session";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "BentaKo — Benta, Stock at Utang para sa Sari-Sari Store" },
      {
        name: "description",
        content:
          "Itala ang benta, bantayan ang stock, at subaybayan ang utang sa BentaKo. May libreng plano at offline na pagtatala para sa sari-sari store.",
      },
      { property: "og:title", content: "BentaKo — Benta, Stock at Utang para sa Sari-Sari Store" },
      {
        property: "og:description",
        content: "Mas malinaw ang takbo ng tindahan. Benta, stock, utang at gastos sa isang app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://bentako.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://bentako.lovable.app/" }],
  }),
  component: Landing,
});

function Landing() {
  const { status } = useAppSession();
  const navigate = useNavigate();

  useEffect(() => {
    const destination = landingDestination(status, platformKind());
    if (destination) void navigate({ to: destination, replace: true });
  }, [status, navigate]);

  if (status === "signed-out" && !landingDestination(status, platformKind())) {
    return <PublicLanding />;
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary text-primary-foreground">
          <Store className="size-8" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-extrabold">BentaKo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bilis ng tindahan, kahit walang internet.
        </p>
        <Loader2 className="mx-auto mt-6 size-5 animate-spin text-primary" />
      </div>
    </div>
  );
}
