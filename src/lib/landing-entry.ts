export type EntryStatus = "loading" | "signed-out" | "no-store" | "ready";

/** Cached sessions are resolved by AppSessionProvider before this decision. */
export function landingDestination(
  status: EntryStatus,
  platform: "web" | "pwa" | "capacitor",
): "/dashboard" | "/onboarding" | "/auth" | null {
  if (status === "ready") return "/dashboard";
  if (status === "no-store") return "/onboarding";
  if (status === "signed-out" && platform !== "web") return "/auth";
  return null;
}

export function authSearch(search: Record<string, unknown>): {
  mode?: "signin" | "signup";
} {
  return search.mode === "signup" || search.mode === "signin" ? { mode: search.mode } : {};
}
