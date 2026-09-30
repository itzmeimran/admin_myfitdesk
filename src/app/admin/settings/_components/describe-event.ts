import type { AccessEvent } from "@/features/settings/security";

const LABEL: Record<string, string> = {
  "platform_admin.invited": "Admin invited",
  "platform_admin.activated": "Admin activated",
  "platform_admin.role_changed": "Role changed",
  "platform_admin.suspended": "Admin suspended",
  "platform_admin.reactivated": "Admin reactivated",
  "platform_admin.revoked": "Admin access revoked",
  "platform_admin.production_access_granted": "Production access granted",
  "platform_admin.production_access_removed": "Production access removed",
  "platform_settings.updated": "Platform setting changed",
  "platform_environment.switched": "Environment switched",
  "platform_security.session_revoked": "Admin session revoked",
  "platform_security.all_admin_sessions_revoked": "All other admin sessions revoked",
  "platform_security.setting_changed": "Security setting changed",
  "platform_integration.updated": "Integration changed",
  "admin.grant": "Admin access granted (legacy)",
  "admin.revoke": "Admin access revoked (legacy)",
};

export function eventLabel(action: string): string {
  return LABEL[action] ?? action;
}

function short(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}

/** One line for WHO/WHAT the event was about: the target's email when the audit
 * row carries one (it never carries secrets — see app.write_admin_audit). */
export function eventTarget(event: AccessEvent): string | null {
  const email = (event.metadata?.email ?? event.newValues?.email ?? event.oldValues?.email) as string | undefined;
  if (email) return email;
  if (event.action === "platform_environment.switched") return null;
  return null;
}

/** "role: support_admin → finance_admin" style lines, capped. */
export function eventChanges(event: AccessEvent): string[] {
  const oldValues = event.oldValues ?? {};
  const newValues = event.newValues ?? {};
  const keys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)])).filter((key) => key !== "email");
  const lines: string[] = [];
  for (const key of keys.slice(0, 5)) {
    const before = oldValues[key];
    const after = newValues[key];
    if (before !== undefined && after !== undefined) lines.push(`${key}: ${short(before)} → ${short(after)}`);
    else if (after !== undefined) lines.push(`${key}: ${short(after)}`);
    else lines.push(`${key}: was ${short(before)}`);
  }
  if (keys.length > 5) lines.push(`+${keys.length - 5} more`);
  const reason = event.metadata?.reason;
  if (typeof reason === "string" && reason) lines.push(`reason: ${short(reason)}`);
  const revoked = event.metadata?.sessions_revoked;
  if (typeof revoked === "number") lines.push(`${revoked} session${revoked === 1 ? "" : "s"}`);
  return lines;
}
