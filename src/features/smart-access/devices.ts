/**
 * Smart Access devices as the platform admin sees them: rules and wording that
 * the screens and their tests share. Pure (no database, no React), so it can be
 * tested by compiling this one file.
 */

export type DeviceStatus = "active" | "disabled";

export type BiometricDeviceRow = {
  id: string;
  serial: string;
  organizationId: string;
  gymName: string;
  branchId: string;
  branchName: string;
  label: string | null;
  firmware: string | null;
  status: DeviceStatus;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  coveredUntil: string | null;
  integrationStatus: string | null;
  integrationEnabled: boolean;
};

export type UnclaimedDeviceRow = {
  serial: string;
  firmware: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type DeviceHistoryEvent = "linked" | "serial_changed" | "moved" | "disabled" | "enabled" | "relabelled" | "unlinked";

export type DeviceHistoryRow = {
  id: string;
  deviceId: string;
  serial: string;
  event: DeviceHistoryEvent;
  details: Record<string, unknown>;
  reason: string;
  actorEmail: string | null;
  at: string;
};

/** What the database accepts: the serial exactly as printed on the unit. */
export const SERIAL_PATTERN = /^[A-Z0-9_-]{1,64}$/;

/** Serials are stored upper-case with no surrounding spaces. */
export function normalizeSerial(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Why a typed serial cannot be used yet, in words, or null when it can. */
export function serialProblem(raw: string): string | null {
  const serial = normalizeSerial(raw);
  if (serial === "") return "Enter the device serial.";
  if (serial.length > 64) return "A serial is at most 64 characters.";
  if (!SERIAL_PATTERN.test(serial)) return "Use only letters, digits, - and _, exactly as printed on the device.";
  return null;
}

const EVENT_TITLE: Record<DeviceHistoryEvent, string> = {
  linked: "Linked to the gym",
  serial_changed: "Serial changed",
  moved: "Moved to another branch",
  disabled: "Disabled",
  enabled: "Enabled",
  relabelled: "Renamed",
  unlinked: "Unlinked",
};

export function historyTitle(event: string): string {
  return EVENT_TITLE[event as DeviceHistoryEvent] ?? "Changed";
}

const STATUS_WORD: Record<string, string> = { active: "Active", disabled: "Disabled" };

function fromTo(value: unknown): { from: unknown; to: unknown } | null {
  if (value && typeof value === "object" && "from" in value && "to" in value) {
    const pair = value as { from: unknown; to: unknown };
    return { from: pair.from, to: pair.to };
  }
  return null;
}

const text = (value: unknown, empty = "none") => (typeof value === "string" && value.trim() !== "" ? value : empty);

/**
 * One plain line per thing that changed, e.g. "Serial: ABC1 → ABC2". A link or
 * an unlink lists what the device was. `branchNames` turns branch ids into
 * names; an id it does not know (a branch that no longer exists) reads as
 * "another branch" rather than showing an id.
 */
export function historyChanges(row: Pick<DeviceHistoryRow, "event" | "details">, branchNames: ReadonlyMap<string, string>): string[] {
  const branch = (id: unknown) => (typeof id === "string" ? (branchNames.get(id) ?? "another branch") : "none");
  const lines: string[] = [];

  if (row.event === "linked" || row.event === "unlinked") {
    lines.push(`Serial: ${text(row.details.serial)}`);
    if (row.details.branch_id) lines.push(`Branch: ${branch(row.details.branch_id)}`);
    if (typeof row.details.label === "string" && row.details.label.trim() !== "") lines.push(`Name: ${row.details.label}`);
    return lines;
  }

  const serial = fromTo(row.details.serial);
  if (serial) lines.push(`Serial: ${text(serial.from)} → ${text(serial.to)}`);
  const moved = fromTo(row.details.branch_id);
  if (moved) lines.push(`Branch: ${branch(moved.from)} → ${branch(moved.to)}`);
  const status = fromTo(row.details.status);
  if (status) lines.push(`Status: ${STATUS_WORD[String(status.from)] ?? text(status.from)} → ${STATUS_WORD[String(status.to)] ?? text(status.to)}`);
  const label = fromTo(row.details.label);
  if (label) lines.push(`Name: ${text(label.from)} → ${text(label.to)}`);
  return lines;
}

/** "3 min ago", "5 h ago", "2 days ago"; older than a month reads as a date. */
export function relativeTime(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days <= 30) return `${days} days ago`;
  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export type DeviceStatusView = { label: string; detail: string | null; tone: "ok" | "idle" | "off" };

/**
 * How a device reads in the list. A device is "connected" when it has been in
 * touch in the last 3 minutes (the same window the gym's own screens use).
 */
export function deviceStatusView(device: Pick<BiometricDeviceRow, "status" | "lastSeenAt">, now: Date): DeviceStatusView {
  if (device.status === "disabled") {
    return { label: "Disabled", detail: "Its punches are refused until it is enabled.", tone: "off" };
  }
  const seen = relativeTime(device.lastSeenAt, now);
  if (!seen) return { label: "Never connected", detail: "Waiting for the device to contact MyFitDesk.", tone: "idle" };
  const recent = now.getTime() - new Date(device.lastSeenAt as string).getTime() < 3 * 60_000;
  return { label: recent ? "Connected" : "Not connected", detail: `Last contact ${seen}`, tone: recent ? "ok" : "idle" };
}

/** The unlinked serials a gym could be linked to, newest contact first. */
export function sortUnclaimed(rows: UnclaimedDeviceRow[]): UnclaimedDeviceRow[] {
  return [...rows].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

/** Devices grouped by gym id, each gym's list in the order given. */
export function groupDevicesByGym(devices: BiometricDeviceRow[]): Map<string, BiometricDeviceRow[]> {
  const grouped = new Map<string, BiometricDeviceRow[]>();
  for (const device of devices) {
    const list = grouped.get(device.organizationId) ?? [];
    list.push(device);
    grouped.set(device.organizationId, list);
  }
  return grouped;
}
