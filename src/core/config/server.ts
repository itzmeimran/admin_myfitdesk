import "server-only";
import { z } from "zod";
import { getPublicSupabaseCredentials } from "./public";
import type { AdminEnvironment } from "./environments";

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY_DEV: z.string().min(1),
  SUPABASE_SECRET_KEY_PROD: z.string().min(1),
});

const parsed = serverEnvSchema.safeParse({
  SUPABASE_SECRET_KEY_DEV: process.env.SUPABASE_SECRET_KEY_DEV,
  SUPABASE_SECRET_KEY_PROD: process.env.SUPABASE_SECRET_KEY_PROD,
});

if (!parsed.success) {
  throw new Error(
    `Invalid server environment variables:\n${parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n")}`,
  );
}

const secretKeyByEnvironment: Record<AdminEnvironment, string> = {
  dev: parsed.data.SUPABASE_SECRET_KEY_DEV,
  prod: parsed.data.SUPABASE_SECRET_KEY_PROD,
};

export type ServiceSupabaseCredentials = { url: string; secretKey: string };

/**
 * Server-only. The `import "server-only"` above turns an accidental import
 * from a 'use client' file into a build error, not a runtime leak.
 * A secret key bypasses RLS — never pass it to a component prop, never log
 * it, never expose it through an API response. Keyed by environment so a
 * caller can never accidentally pair a PROD url with a DEV secret or vice
 * versa — both come from the same lookup, for the same environment.
 */
export function getServiceSupabaseCredentials(environment: AdminEnvironment): ServiceSupabaseCredentials {
  return {
    url: getPublicSupabaseCredentials(environment).url,
    secretKey: secretKeyByEnvironment[environment],
  };
}
