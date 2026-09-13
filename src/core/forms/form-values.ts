/**
 * `FormData.get()` returns `null` — not `undefined` — for a field that is
 * absent from the submission, and `File` for a file input. Zod's
 * `z.string().optional().default("")` only substitutes on `undefined`, so a
 * `null` reaches the string check and fails with the opaque
 * "Invalid input: expected string, received null" instead of the field's own
 * message. That is exactly the error the New package form surfaced in
 * production, and it can happen to ANY field the browser doesn't submit
 * (a control that never mounted, a stale action bound to a different form
 * shape, a sheet re-rendered mid-submit).
 *
 * Every Server Action in this app reads form fields through these helpers
 * rather than calling `formData.get()` directly, so a missing field becomes
 * an empty string and the schema's own required-message is what the admin
 * sees.
 */

/** A text field's value, or "" when the field is absent or a file. */
export function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Same as `text`, but `undefined` (not "") when absent — for schema fields
 * that carry a `.default(...)` the caller wants applied. */
export function optionalText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}
