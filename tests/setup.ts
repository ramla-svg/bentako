/* eslint-disable @typescript-eslint/no-explicit-any -- test-only global hooks */
import "fake-indexeddb/auto";
import { vi } from "vitest";
import { setCloudBackupEnabled, setSyncContext } from "@/lib/sync-service";

// Isolated test environment: no network, no real backend, no production data.
(globalThis as unknown as { window: unknown }).window = globalThis;

export const upsertMock = vi.fn(async () => ({ error: null as { message: string } | null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () =>
        (globalThis as Record<string, any>).__getSession?.() ?? {
          data: {
            session: {
              access_token: "test",
              user: { id: "user-test" },
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          },
        },
      refreshSession: async () =>
        (globalThis as Record<string, any>).__refreshSession?.() ?? {
          data: {
            session: {
              access_token: "test",
              user: { id: "user-test" },
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          },
          error: null,
        },
    },
    from: (entity: string) => ({
      upsert: (...args: unknown[]) => {
        const request = Promise.resolve().then(() =>
          (globalThis as Record<string, any>).__upsert(...args),
        );
        return Object.assign(request, { abortSignal: () => request });
      },
      select: () => ({
        eq: () => ({
          limit: () => ({
            abortSignal: () =>
              (globalThis as Record<string, any>).__select?.(entity) ??
              Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/platform/network-service", () => ({
  isOnline: () => (globalThis as Record<string, any>).__online ?? false,
  probeReachable: async () => false,
  subscribeNetwork: () => () => {},
}));
(globalThis as Record<string, any>).__upsert = upsertMock;
setSyncContext("user-test", "store-test-a");
setCloudBackupEnabled(true);
