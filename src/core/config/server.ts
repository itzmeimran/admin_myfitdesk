import "server-only";
import { z } from "zod";
import { publicEnv } from "./public";

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

const parsed = serverEnvSchema.safeParse({
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
});

if (!parsed.success) {
  throw new Error(
    `Invalid server environment variables:\n${parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n")}`,
  );
}

/**
 * Server-only. The `import "server-only"` above turns an accidental import
 * from a 'use client' file into a build error, not a runtime leak.
 * SUPABASE_SECRET_KEY bypasses RLS — never pass it to a component prop,
 * never log it, never expose it through an API response.
 */
export const serverEnv = {
  SUPABASE_URL: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SECRET_KEY: parsed.data.SUPABASE_SECRET_KEY,
};
