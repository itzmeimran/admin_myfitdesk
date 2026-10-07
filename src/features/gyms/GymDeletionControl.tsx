"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Sheet } from "@/components/Sheet";
import { Dropdown } from "@/components/Dropdown";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useAdminEnvironment } from "@/core/env/context";
import { DeleteIcon, RestoreIcon, CancelIcon } from "@/core/ui/icons";
import { requestGymDeletion, restoreGymDeletion } from "./deletion-actions";

export type GymDeletionStatus = { requestedAt: string; purgeAfter: string; state: "quarantined" | "purging"; canRestore: boolean; hasError: boolean };

export function GymDeletionControl({ organizationId, name, status, legacyRequested = false }: { organizationId: string; name: string; status: GymDeletionStatus | null; legacyRequested?: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<"delete" | "restore" | null>(null);
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [typedName, setTypedName] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const environment = useAdminEnvironment();
  const deadline = status ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(status.purgeAfter)) : null;

  function apply() {
    if (pending) return;
    startTransition(async () => {
      const restoring = confirmation === "restore";
      try {
        const result = restoring ? await restoreGymDeletion(organizationId) : await requestGymDeletion({ organizationId, days: Number(days), reason, confirmation: typedName });
        if (result.error) { toast.error(result.error); return; }
        toast.success(restoring ? `${name} restored.` : `${name} isolated. Restore within ${days} days to cancel deletion.`);
        setConfirmation(null); setOpen(false); setReason(""); setTypedName("");
        router.refresh();
      } catch { toast.error("Couldn't apply this change. Refresh and try again."); }
    });
  }

  return <div className="flex flex-col gap-3 border-[1.5px] border-accent bg-paper p-4">
    <strong className="text-[13px] text-ink">{status || legacyRequested ? "Gym pending deletion" : "Delete gym"}</strong>
    <p className="text-[12px] text-mute">{status ? `The gym is isolated. Recovery ends ${deadline} IST. After that, its records, uploads and eligible login accounts are permanently removed.` : legacyRequested ? "This is an earlier deletion request. It has no automatic deletion deadline and can still be restored." : "Isolate this gym for 3–7 days. Restore it during that window, or its data will be permanently removed automatically."}</p>
    {status?.hasError ? <p className="text-[12px] text-accent">Cleanup needs attention and will retry. The gym remains isolated.</p> : null}
    {status || legacyRequested ? <Button icon={RestoreIcon} disabled={pending || (status !== null && !status.canRestore)} onClick={() => setConfirmation("restore")}>
      {status && !status.canRestore ? "Recovery window ended" : "Restore gym"}
    </Button> : <Button icon={DeleteIcon} variant="secondary" tone="danger" onClick={() => { setReason(""); setTypedName(""); setDays("7"); setOpen(true); }}>Initiate deletion</Button>}
    <Sheet open={open} title={`Delete ${name}`} eyebrow="Recoverable for 3–7 days" onClose={() => { if (!pending) setOpen(false); }}>
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-mute">Gym access and changes will be blocked immediately. Automatic deletion is permanent once the recovery deadline passes. Existing suspension and billing dates are preserved if you restore.</p>
        <label className="flex flex-col gap-1 text-[12px]">Recovery window
          <Dropdown ariaLabel="Recovery window" value={days} options={[3,4,5,6,7].map(d => ({ value: String(d), label: `${d} days` }))} onChange={setDays} disabled={pending} />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">Reason
          <textarea value={reason} onChange={e => setReason(e.target.value)} disabled={pending} maxLength={500} rows={3} className="border-[1.5px] border-line bg-paper p-2 outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">Type &quot;{name}&quot; exactly to confirm
          <input value={typedName} onChange={e => setTypedName(e.target.value)} disabled={pending} autoComplete="off" className="border-[1.5px] border-line bg-paper p-2 outline-none focus:border-accent" />
        </label>
        <div className="flex gap-2">
          <Button icon={CancelIcon} onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button icon={DeleteIcon} variant="primary" tone="danger" disabled={pending || typedName !== name || reason.trim().length < 3} onClick={() => setConfirmation("delete")}>Review deletion</Button>
        </div>
      </div>
    </Sheet>
    <ConfirmDialog open={confirmation !== null} title="Are you sure?" description={confirmation === "restore" ? `Restore access to ${name} and cancel its scheduled deletion?` : `Isolate ${name} now and permanently delete its data after ${days} days unless restored?`} danger={confirmation === "delete"} confirmLabel={confirmation === "restore" ? "Restore gym" : "Isolate and schedule deletion"} pending={pending} requireTypedConfirmation={environment === "prod" ? "PRODUCTION" : undefined} onConfirm={apply} onCancel={() => { if (!pending) setConfirmation(null); }} />
  </div>;
}
