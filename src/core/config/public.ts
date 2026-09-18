import { z } from "zod";
import type { AdminEnvironment } from "./environments";

/**
 * DEV and PROD are two entirely separate Supabase projects (separate URL +
 * separate publishable key), never one URL with a query param or a runtime
 * branch — that's what actually prevents DEV/PROD data from ever mixing:
 * there is no code path where a request can hold a PROD url alongside a DEV
 * key or vice versa, because they're only ever read together, per
 * environment, from `getPublicSupabaseCredentials`.
 *
 * Both pairs are required at startup (fail closed, same posture as every
 * other env check in this app — see core/auth/get-platform-admin.ts's
 * docblock) rather than letting the app boot with PROD half-configured and
 * discovering that the first time an admin switches to it.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL_DEV: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_DEV: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL_PROD: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_PROD: z.string().min(1),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL_DEV: process.env.NEXT_PUBLIC_SUPABASE_URL_DEV,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_DEV: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_DEV,
  NEXT_PUBLIC_SUPABASE_URL_PROD: process.env.NEXT_PUBLIC_SUPABASE_URL_PROD,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_PROD: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_PROD,
});

if (!parsed.success) {
  throw new Error(
    `Invalid public environment variables:\n${parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n")}`,
  );
}

export type PublicSupabaseCredentials = { url: string; publishableKey: string };

const credentialsByEnvironment: Record<AdminEnvironment, PublicSupabaseCredentials> = {
  dev: {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL_DEV,
    publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_DEV,
  },
  prod: {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL_PROD,
    publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_PROD,
  },
};

/** Safe to import from client components — only ever a project URL and a
 * publishable (anon) key, never a secret. Never add a non-public value
 * here. */
export function getPublicSupabaseCredentials(environment: AdminEnvironment): PublicSupabaseCredentials {
  return credentialsByEnvironment[environment];
}
