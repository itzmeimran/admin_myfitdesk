/**
 * Copied verbatim from FitDeskApp/src/core/text/display-name.ts. Used here
 * for the admin sidebar's identity block and initials badge.
 */
export function displayName(person: { firstName: string | null; lastName: string | null; email?: string | null }): string {
  const fullName = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  if (!person.email) return "there";
  return person.email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Two-letter avatar badge — from initials when a real name is on file,
 * otherwise the same email-derived fallback `displayName` uses. */
export function initialsFor(person: { firstName: string | null; lastName: string | null; email?: string | null }): string {
  if (person.firstName) {
    return `${person.firstName[0]}${person.lastName?.[0] ?? ""}`.toUpperCase();
  }
  return (person.email ?? "??").slice(0, 2).toUpperCase();
}
