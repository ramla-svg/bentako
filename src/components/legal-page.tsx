/**
 * Shared layout for the public legal pages (Terms, Privacy, Account deletion).
 * These must stay reachable without signing in — Google Play Console links to
 * them directly.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Store } from "lucide-react";
import type { ReactNode } from "react";

export const LEGAL_CONTACT_EMAIL = "ayisha.janna.almar@gmail.com";
export const LEGAL_UPDATED = "11 September 2026";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-5 py-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Store className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-base font-extrabold leading-tight">BentaKo</p>
            <p className="truncate text-xs text-muted-foreground">Sari-sari store point of sale</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <h1 className="font-display text-2xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{intro}</p>
        <p className="mt-1 text-xs text-muted-foreground">Last updated: {LEGAL_UPDATED}</p>

        <div className="mt-6 space-y-6 text-sm leading-relaxed">{children}</div>

        <nav className="mt-10 flex flex-wrap gap-4 border-t pt-5 text-sm">
          <Link to="/" className="flex items-center gap-1 text-primary">
            <ArrowLeft className="size-4" /> Back to BentaKo
          </Link>
          <Link to="/terms" className="text-primary">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-primary">
            Privacy Policy
          </Link>
          <Link to="/delete-account" className="text-primary">
            Delete my account
          </Link>
        </nav>
      </main>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-base font-bold">{heading}</h2>
      {children}
    </section>
  );
}
