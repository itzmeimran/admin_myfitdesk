/** Deep snake_case → camelCase key conversion for the JSON the curated admin
 * RPCs return. Only used on JSON the RPCs themselves shape; free-form row
 * snapshots (audit old/new values) are deliberately left untouched so a
 * column name is never renamed on the way to a diff. */
function camelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function camelize<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((item) => camelize(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) out[camelKey(key)] = camelize(inner);
    return out as T;
  }
  return value as T;
}
