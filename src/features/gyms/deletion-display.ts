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
};

export function deletionDisplay(row: GymDeletionRow, now = Date.now()) {
  if (row.state === "database_deleted") return { label: "Database deleted", description: "The gym database record was deleted. File and login-account cleanup cannot be confirmed from this audit record." };
  if (row.state === "completed") return { label: "Deletion completed", description: "Database, file and eligible login-account cleanup was confirmed." };
  if (row.state === "restored") return { label: "Gym restored", description: "This scheduled deletion was cancelled by restoration." };
  if (row.hasError) return { label: "Cleanup needs attention", description: "A cleanup step failed. Automatic retries remain enabled; the gym stays isolated." };
  if (row.databaseDeletedAt) return { label: "File or account cleanup pending", description: "Database records have been removed. File or login-account cleanup is still pending." };
  if (row.state === "purging") return { label: "Cleanup in progress", description: "The recovery window has ended and permanent cleanup has started." };
  if (row.state === "legacy") return { label: "Earlier deletion request", description: "No automatic cleanup deadline was assigned to this earlier request. It can still be restored." };
  if (row.purgeAfter && new Date(row.purgeAfter).valueOf() <= now) return { label: "Awaiting cleanup", description: "The recovery deadline has passed. The gym remains isolated while it awaits automatic cleanup." };
  return { label: "Pending deletion", description: "The gym is isolated. Restore it before the recovery deadline to cancel automatic deletion." };
}
