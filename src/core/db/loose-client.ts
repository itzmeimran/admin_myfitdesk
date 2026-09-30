import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * The Supabase client with its generated types switched off, for RPCs that are
 * newer than `database.types.ts` (the Settings-area functions from
 * supabase/migrations/20260930180000_platform_settings.sql). Same technique
 * features/disaster-recovery/queries.ts uses so an additive migration does not
 * block the build. Regenerate the types after the migration is applied on every
 * environment and this shim (and its call sites) can go.
 *
 * NOTE the cast is of the CLIENT, never of `client.rpc` — pulling `.rpc` out
 * into a variable detaches it from `this` and breaks at runtime (CLAUDE.md,
 * "every RPC call was broken"). Always call `loose(client).rpc(...)` inline.
 */
export function loose(client: SupabaseClient<Database>): SupabaseClient {
  return client as unknown as SupabaseClient;
}
