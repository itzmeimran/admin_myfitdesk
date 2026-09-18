/**
 * Plain constants (no "server-only"/"use client" split needed — a cookie
 * name and max-age are not secrets) shared by the server-side reader
 * (@/core/env/active-environment) and the Server Action that writes it
 * (@/core/env/actions). Kept in its own module so neither side needs to
 * import the other's file just to agree on the cookie's name.
 */
export const ADMIN_ENV_COOKIE = "mfd-admin-env";

/** ~1 year — "remember my selection across a refresh" (task requirement),
 * not a session-length cookie. Re-set on every explicit switch, so it never
 * actually goes a full year without being refreshed by an active admin. */
export const ADMIN_ENV_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
