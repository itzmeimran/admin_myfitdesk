"use client";

import { Button } from "@/components/Button";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminSession } from "@/features/settings/security";
import { revokeAdminSession } from "@/features/settings/admin-actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { useAdminEnvironment } from "@/core/env/context";
import { RevokeIcon } from "@/core/ui/icons";
import { StatusPill, timeAgo } from "../_components/ui";

/** A browser/OS summary from a user-agent string — enough to recognise "my
 * laptop" vs "a phone I don't own", without pretending to be a parser. */
function describeAgent(agent: string | null): string {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const os = /Windows/.test(agent) ? "Windows" : /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Mac OS/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function SessionsTable({ sessions, canManage }: { sessions: AdminSession[]; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const environment = useAdminEnvironment();
  const [target, setTarget] = useState<AdminSession | null>(null);
  const [isPending, startTransition] = useTransition();

  if (sessions.length === 0) return <EmptyState message="No active admin sessions found." />;

  function revoke(confirmation: string) {
    if (!target) return;
    const session = target;
    startTransition(async () => {
      const { error } = await revokeAdminSession(session.sessionId, confirmation);
      setTarget(null);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`Session for ${session.email} ended.`);
      router.refresh();
    });
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-line border-[1.5px] border-line">
        {sessions.map((session) => (
          <li key={session.sessionId} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-ink">
                {session.email}
                {session.isCurrent ? <StatusPill label="This session" tone="Trialing" /> : null}
              </span>
              <span className="text-[11.5px] text-mute">
                {describeAgent(session.userAgent)}
                {session.ip ? ` · ${session.ip}` : ""} · started {timeAgo(session.createdAt)}
                {session.refreshedAt ? ` · last active ${timeAgo(session.refreshedAt)}` : ""}
              </span>
            </div>
            {canManage && !session.isCurrent ? (
              <Button icon={RevokeIcon} type="button" disabled={isPending} onClick={() => setTarget(session)} variant="secondary" tone="danger" size="sm" >
                 End session
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={target !== null}
        danger
        title="End this session?"
        description={target ? `${target.email} will be signed out on ${describeAgent(target.userAgent)} the next time it refreshes.` : ""}
        confirmLabel="End session"
        pending={isPending}
        requireTypedConfirmation={environment === "prod" ? "PRODUCTION" : undefined}
        onConfirm={revoke}
        onCancel={() => setTarget(null)}
      />
    </>
  );
}
