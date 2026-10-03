import "fake-indexeddb/auto";
import { vi } from "vitest";

// Isolated test environment: no network, no real backend, no production data.
(globalThis as unknown as { window: unknown }).window = globalThis;

export const upsertMock = vi.fn(async () => ({ error: null as { message: string } | null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "test" } } }) },
    from: () => ({ upsert: (...args: unknown[]) => (globalThis as any).__upsert(...args) }),
  },
}));
vi.mock("@/lib/platform/network-service", () => ({
  isOnline: () => (globalThis as any).__online ?? false,
  probeReachable: async () => false,
  subscribeNetwork: () => () => {},
}));
(globalThis as any).__upsert = upsertMock;
