"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { RetryIcon } from "@/core/ui/icons";
import { useAdminEnvironment } from "@/core/env/context";
import type { CleanupInspection } from "@/features/gyms/deletion-inspection";
import { inspectDeletionCleanup } from "./_server/actions";

export function CleanupInspectionControl({ organizationId }: { organizationId: string }) {
  const environment = useAdminEnvironment();
  return <InspectionResult key={`${environment}:${organizationId}`} organizationId={organizationId} environment={environment} />;
}

function InspectionResult({ organizationId, environment }: { organizationId: string; environment: "dev" | "prod" }) {
  const [result, setResult] = useState<CleanupInspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  function inspect() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const response = await inspectDeletionCleanup(organizationId);
        setResult(response.data); setError(response.error);
      } catch { setError("Cleanup inspection could not finish. Try again."); }
      finally { inFlight.current = false; }
    });
  }
  return <div className="flex flex-col gap-3 border-t border-line pt-3">
    <div><Button icon={RetryIcon} size="sm" pending={pending} pendingLabel="Inspecting cleanup…" onClick={inspect}>{result ? "Inspect cleanup again" : "Inspect cleanup now"}</Button></div>
    {pending ? <p role="status" className="text-[12px] text-mute">Checking the gym record, configured storage folders and recoverable login-account IDs in {environment === "dev" ? "development" : "production"}…</p> : null}
    {error ? <p role="alert" className="text-[12px] text-accent">{error}</p> : null}
    {result && !pending ? <div className="flex flex-col gap-3" role="status">
      <p className="text-[11px] text-mute">Read-only inspection · {environment === "dev" ? "Development" : "Production"} · {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(result.checkedAt))} IST</p>
      {(["database", "files", "accounts"] as const).map(key => <div key={key} className="text-[12px]">
        <strong>{key === "database" ? "Database" : key === "files" ? "Files and uploads" : "Login accounts"}: {result[key].status}</strong>
        <p className="mt-1 text-mute">{result[key].detail}</p>
      </div>)}
    </div> : null}
  </div>;
}
