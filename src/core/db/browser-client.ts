import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/core/config/public";
import type { Database } from "./database.types";

/** RLS applies. The only client permitted in 'use client' components. */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
