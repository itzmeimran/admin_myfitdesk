export type GymDeletionRow = {
  id: string;
  organizationId: string;
  gymName: string | null;
  gymCode: string | null;
  city: string | null;
  ownerName: string | null;
  actorName: string | null;
  actorRole: string | null;
  requestedAt: string | null;
  purgeAfter: string | null;
  completedAt: string | null;
  databaseDeletedAt: string | null;
  state: "legacy" | "quarantined" | "purging" | "restored" | "completed" | "database_deleted";
  hasError: boolean;
  gymExists: boolean;
  reason: string | null;
  gymCreatedAt?: string | null;
  attempts?: number;
  cleanupError?: string | null;
  otherGymsWithSameCode?: { organizationId: string; name: string; createdAt: string }[];
};

export function deletionDisplay(row: GymDeletionRow, now = Date.now()) {
  if (row.gymExists && (row.state === "database_deleted" || row.state === "completed" || row.databaseDeletedAt)) return { label: "Gym record exists", description: "A deletion was recorded for this gym ID, but its database record currently exists. Review the current record before treating this gym as deleted." };
  if (row.state === "database_deleted") return { label: "Historical database deletion", description: "This event belongs to the gym ID shown here. A current gym with a different ID has its own lifecycle, even when its name or code matches." };
  if (row.state === "completed") return { label: "Deletion completed", description: "Database, file and eligible login-account cleanup was confirmed." };
  if (row.state === "restored") return { label: "Gym restored", description: "This scheduled deletion was cancelled by restoration." };
  if (row.hasError) return { label: "Cleanup needs attention", description: "A cleanup step failed. Automatic retries remain enabled; the gym stays isolated." };
  if (row.databaseDeletedAt) return { label: "File or account cleanup pending", description: "Database records have been removed. File or login-account cleanup is still pending." };
  if (row.state === "purging") return { label: "Cleanup in progress", description: "The recovery window has ended and permanent cleanup has started." };
  if (row.state === "legacy") return { label: "Earlier deletion request", description: "No automatic cleanup deadline was assigned to this earlier request. It can still be restored." };
  if (row.purgeAfter && new Date(row.purgeAfter).valueOf() <= now) return { label: "Awaiting cleanup", description: "The recovery deadline has passed. The gym remains isolated while it awaits automatic cleanup." };
  return { label: "Pending deletion", description: "The gym is isolated. Restore it before the recovery deadline to cancel automatic deletion." };
}

/** Receipts describe completed work; missing historical evidence is never
 * converted into a successful file/account result. */
export function deletionStages(row: GymDeletionRow) {
  const completed = row.state === "completed" && !row.gymExists;
  const databaseDeleted = !row.gymExists && Boolean(row.databaseDeletedAt);
  const historical = row.state === "database_deleted";
  const cancelled = row.state === "restored";
  return [
    { key: "database", label: "Database", status: row.gymExists ? "Gym record present" : databaseDeleted || completed ? "Deletion recorded; gym record absent" : "Gym record absent",
      detail: row.gymExists ? "This exact gym ID still exists in the selected environment." : completed || (!historical && databaseDeleted) ? "The automatic worker recorded the tenant database purge. A minimal deletion receipt remains." : "The organization delete event is retained. It does not list every related table or row removed." },
    { key: "files", label: "Files and uploads", status: completed ? "Cleanup confirmed" : cancelled ? "Cancelled" : historical ? "No cleanup receipt" : "Not completed",
      detail: completed ? "The worker finished the gym folder cleanup in Supabase Storage and the verified R2 bucket inventory before recording completion." : historical ? "This earlier database event contains no storage cleanup result. Inspect cleanup to check the gym UUID folder in the configured storage inventory now." : cancelled ? "The scheduled deletion was cancelled; no further file cleanup is scheduled for this request." : "File cleanup finishes after the database purge. A database timestamp alone does not confirm file removal." },
    { key: "accounts", label: "Login accounts", status: completed ? "Eligible-account cleanup confirmed" : cancelled ? "Cancelled" : historical ? "No cleanup receipt" : "Not completed",
      detail: completed ? "The worker processed the captured login accounts. Exclusive eligible accounts were removed; accounts referenced by another gym, platform access or surviving records were retained. Per-account IDs and totals are erased after completion." : historical ? "The earlier delete event has no account inventory or account deletion result. Inspect cleanup can check IDs recoverable from retained staff audit events; that may not reconstruct the full original roster." : cancelled ? "The scheduled deletion was cancelled; login-account cleanup was not completed by this request." : "Exclusive eligible accounts are removed after file cleanup. Shared or otherwise referenced accounts are retained." },
  ];
}
