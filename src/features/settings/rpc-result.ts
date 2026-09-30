import "server-only";

/**
 * Every Settings read returns this instead of throwing, so one section that
 * cannot load (migration not applied on this environment, no permission, a
 * transient error) shows an inline error in its own tab rather than taking
 * the whole page down.
 */
export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string; notInstalled: boolean };

type RpcError = { code?: string; message: string };

export function loadedFailure(error: RpcError): Loaded<never> {
  // PGRST202: PostgREST cannot find the function, meaning the Settings
  // migration (supabase/migrations/20260930180000_platform_settings.sql) has
  // not been run on this environment's database yet.
  if (error.code === "PGRST202" || error.code === "42883") {
    return {
      ok: false,
      notInstalled: true,
      error:
        "This section needs the Settings database migration (20260930180000_platform_settings.sql), which hasn't been applied to this environment yet.",
    };
  }
  if (error.code === "42501") {
    return { ok: false, notInstalled: false, error: "You don't have permission to view this." };
  }
  return { ok: false, notInstalled: false, error: error.message };
}

export function loaded<T>(data: T): Loaded<T> {
  return { ok: true, data };
}
