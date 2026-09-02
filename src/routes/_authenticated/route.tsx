import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { useAppSession } from "@/hooks/use-app-session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { status } = useAppSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "signed-out") void navigate({ to: "/auth", replace: true });
    if (status === "no-store") void navigate({ to: "/onboarding", replace: true });
  }, [status, navigate]);

  if (status !== "ready") {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return <Outlet />;
}
