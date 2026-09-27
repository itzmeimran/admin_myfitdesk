import "server-only";

type DispatchResult = { dispatched: true } | { dispatched: false; reason: string };

/** Dispatch a long-running worker without exposing GitHub, DB, or R2 secrets
 * to the browser. Without optional dispatch config the request stays queued
 * and can be run manually from Actions; it is never reported as completed. */
export async function dispatchRecoveryWorkflow(
  workflow: "database-backup.yml" | "database-restore.yml",
  inputs: Record<string, string>,
): Promise<DispatchResult> {
  const token = process.env.BACKUP_GITHUB_TOKEN?.trim();
  const repository = process.env.BACKUP_GITHUB_REPOSITORY?.trim();
  const ref = process.env.BACKUP_GITHUB_REF?.trim() || "main";
  if (!token || !repository) {
    return { dispatched: false, reason: "GitHub dispatch is not configured; run the queued request from GitHub Actions." };
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return { dispatched: false, reason: "BACKUP_GITHUB_REPOSITORY is invalid." };
  }
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref, inputs }),
    cache: "no-store",
  });
  if (!response.ok) {
    return { dispatched: false, reason: `GitHub workflow dispatch failed (${response.status}). Run the queued request manually.` };
  }
  return { dispatched: true };
}
