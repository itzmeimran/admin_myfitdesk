"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminActionDialog } from "@/components/AdminActionDialog";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { refreshAlerts, setAlertStatus } from "@/features/gyms/ops/actions";
import {
  EXPORT_DATASETS,
  type FlagRow,
  type LockRow,
  type LockType,
  type OpsAlert,
  type WebhookEvent,
} from "@/features/gyms/ops/types";
import { CreditsDialog, FlagDialog, LockDialog, ResolveAlertDialog, RetryDialog, SessionsDialog } from "./ops-dialogs";
import { SuspendSheet, ReactivateConfirm } from "../gym-row-actions";
import { formatMinor } from "@/core/money/format";
import { exactTime, relativeTime } from "@/features/gyms/ops/timeline-format";
import { StatusPill } from "./ops-ui";

const BTN =
  "min-h-[34px] border-[1.5px] border-ink bg-paper px-3 text-[10.5px] font-bold uppercase tracking-[0.09em] text-ink hover:bg-sand disabled:cursor-not-allowed disabled:opacity-45";
const BTN_PRIMARY = "min-h-[34px] bg-ink px-3 text-[10.5px] font-bold uppercase tracking-[0.09em] text-hi disabled:cursor-not-allowed disabled:opacity-45";
const BTN_DANGER = "min-h-[34px] border-[1.5px] border-accent px-3 text-[10.5px] font-bold uppercase tracking-[0.09em] text-accent hover:bg-accent/8";

/* ---------------------------------------------------------------- WhatsApp */

export function WhatsAppControls({
  organizationId,
  gymName,
  paused,
  retryEligible,
}: {
  organizationId: string;
  gymName: string;
  paused: boolean;
  retryEligible: number;
}) {
  const [panel, setPanel] = useState<"credits" | "retry" | "pause" | null>(null);
  const close = () => setPanel(null);
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={BTN_PRIMARY} onClick={() => setPanel("credits")}>
        Add / remove credits
      </button>
      <button type="button" className={paused ? BTN_PRIMARY : BTN_DANGER} onClick={() => setPanel("pause")}>
        {paused ? "Resume sending" : "Pause sending"}
      </button>
      <button
        type="button"
        className={BTN}
        disabled={retryEligible === 0}
        title={retryEligible === 0 ? "No failed message is currently safe to retry" : undefined}
        onClick={() => setPanel("retry")}
      >
        Retry safe failures ({retryEligible})
      </button>
      <CreditsDialog open={panel === "credits"} onClose={close} organizationId={organizationId} gymName={gymName} />
      <RetryDialog open={panel === "retry"} onClose={close} organizationId={organizationId} />
      <LockDialog open={panel === "pause"} onClose={close} organizationId={organizationId} gymName={gymName} lockType="block_whatsapp" enable={!paused} />
    </div>
  );
}

export function RetryButton({ organizationId, eligible, label }: { organizationId: string; eligible: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={BTN}
        disabled={!eligible}
        title={eligible ? undefined : "Nothing to retry"}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <RetryDialog open={open} onClose={() => setOpen(false)} organizationId={organizationId} />
    </>
  );
}

/* ---------------------------------------------------------------- Locks */

export function LockRowControl({
  organizationId,
  gymName,
  lockType,
  state,
}: {
  organizationId: string;
  gymName: string;
  lockType: LockType;
  state: LockRow | null;
}) {
  const [open, setOpen] = useState(false);
  const active = Boolean(state?.isActive);
  return (
    <>
      <button type="button" className={active ? BTN : BTN_DANGER} onClick={() => setOpen(true)}>
        {active ? "Lift" : "Enable"}
      </button>
      <LockDialog open={open} onClose={() => setOpen(false)} organizationId={organizationId} gymName={gymName} lockType={lockType} enable={!active} />
    </>
  );
}

/* ---------------------------------------------------------------- Flags */

export function FlagRowControl({ organizationId, flag }: { organizationId: string; flag: FlagRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={flag.isEnabled}
        aria-label={`${flag.label}: ${flag.isEnabled ? "enabled" : "disabled"}`}
        onClick={() => setOpen(true)}
        className={`relative h-6 w-11 flex-shrink-0 border-[1.5px] border-ink transition-colors ${flag.isEnabled ? "bg-ink" : "bg-paper"}`}
      >
        <span className={`absolute top-[2px] h-4 w-4 transition-all ${flag.isEnabled ? "left-[22px] bg-hi" : "left-[2px] bg-mute3"}`} />
      </button>
      <FlagDialog open={open} onClose={() => setOpen(false)} organizationId={organizationId} flag={flag} />
    </>
  );
}

/* ---------------------------------------------------------------- Alerts */

export function AlertControls({ organizationId, alert }: { organizationId: string; alert: OpsAlert }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [resolving, setResolving] = useState(false);

  if (alert.status === "resolved") return null;

  function acknowledge() {
    startTransition(async () => {
      const result = await setAlertStatus({ organizationId, alertId: alert.id, action: "acknowledge" });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Alert acknowledged.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {alert.status === "open" ? (
        <button type="button" className={BTN} disabled={isPending} onClick={acknowledge}>
          Acknowledge
        </button>
      ) : null}
      <button type="button" className={BTN_PRIMARY} onClick={() => setResolving(true)}>
        Resolve
      </button>
      <ResolveAlertDialog open={resolving} onClose={() => setResolving(false)} organizationId={organizationId} alert={alert} />
    </div>
  );
}

export function RefreshAlertsButton({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={BTN}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await refreshAlerts(organizationId);
          if (result.error) toast.error(result.error);
          else {
            toast.success("Alerts re-checked.");
            router.refresh();
          }
        })
      }
    >
      {isPending ? "Checking…" : "Re-check now"}
    </button>
  );
}

/* ---------------------------------------------------------------- Access */

export function AccessControls({ organizationId, gymName }: { organizationId: string; gymName: string }) {
  const [scope, setScope] = useState<"owner" | "all" | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={BTN} onClick={() => setScope("owner")}>
        Force logout owner
      </button>
      <button type="button" className={BTN_DANGER} onClick={() => setScope("all")}>
        Force logout all users
      </button>
      <SessionsDialog open={scope !== null} onClose={() => setScope(null)} organizationId={organizationId} gymName={gymName} scope={scope ?? "owner"} />
    </div>
  );
}

/* ---------------------------------------------------------------- Webhooks */

export function WebhookEventList({ events, timeZone }: { events: WebhookEvent[]; timeZone: string }) {
  const [selected, setSelected] = useState<WebhookEvent | null>(null);
  return (
    <>
      <div className="divide-y divide-line border-[1.5px] border-line">
        {events.map((e) => {
          const failed = Boolean(e.processingError) || e.signatureVerified === false;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e)}
              className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-3 py-2.5 text-left hover:bg-sand/50 sm:grid-cols-[1.2fr_1fr_auto]"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12.5px] font-bold text-ink">{e.eventType}</span>
                <span className="truncate font-mono text-[10.5px] text-mute3">{e.paymentId ?? e.orderId ?? e.id}</span>
              </span>
              <span className="hidden text-[11px] text-mute sm:block">{relativeTime(e.receivedAt)}</span>
              <StatusPill tone={failed ? "Down" : e.processedAt ? "Healthy" : "Attention"}>{failed ? "Failed" : e.processedAt ? "Processed" : "Pending"}</StatusPill>
            </button>
          );
        })}
      </div>
      <Sheet open={selected !== null} onClose={() => setSelected(null)} eyebrow="Razorpay webhook event" title={selected?.eventType ?? ""}>
        {selected ? (
          <div className="flex flex-col gap-3 text-[12.5px]">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <Detail label="Received" value={exactTime(selected.receivedAt, timeZone)} />
              <Detail label="Processed" value={selected.processedAt ? exactTime(selected.processedAt, timeZone) : "Not processed"} />
              <Detail label="Attempts" value={String(selected.attempts)} />
              <Detail label="Signature" value={selected.signatureVerified === null ? "Unknown" : selected.signatureVerified ? "Verified" : "Invalid"} />
              <Detail label="Amount" value={selected.amountMinor !== null ? formatMinor(selected.amountMinor) : "—"} />
              <Detail label="Gateway status" value={selected.gatewayStatus ?? "—"} />
              <Detail label="Order" value={selected.orderId ?? "—"} mono />
              <Detail label="Payment" value={selected.paymentId ?? "—"} mono />
            </dl>
            {selected.processingError ? (
              <div className="border-[1.5px] border-accent bg-accent/5 p-3 text-[12px] text-ink2">
                <strong className="text-accent">Error:</strong> {selected.processingError}
              </div>
            ) : null}
            <div className="border-[1.5px] border-line bg-sand/50 p-3 text-[11.5px] leading-relaxed text-mute">
              <strong className="text-ink2">Retry processing is not available here.</strong> Webhook handlers live in the gym app, and re-running one
              safely (without creating a second payment) has to happen there. The exact requirement is in docs/gym-command-center.md.
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute3">{label}</dt>
      <dd className={`break-words text-ink ${mono ? "font-mono text-[11px]" : "font-bold"}`}>{value}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- Exports */

export function ExportPanel({ organizationId }: { organizationId: string }) {
  const [dataset, setDataset] = useState<string>(EXPORT_DATASETS[0].key);
  const [open, setOpen] = useState(false);
  const label = EXPORT_DATASETS.find((d) => d.key === dataset)?.label ?? dataset;

  async function download(reason: string): Promise<{ error: string | null; message?: string }> {
    const response = await fetch(`/admin/gyms/${organizationId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataset, reason }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return { error: body?.error ?? "The export failed." };
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { error: null, message: `${label} export downloaded.` };
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-mute">Dataset</span>
        <select
          value={dataset}
          onChange={(e) => setDataset(e.target.value)}
          className="min-h-[38px] cursor-pointer border-[1.5px] border-line bg-paper px-2.5 text-[12.5px] outline-none hover:border-ink focus:border-ink"
        >
          {EXPORT_DATASETS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={BTN_PRIMARY} onClick={() => setOpen(true)}>
        Export CSV…
      </button>
      <AdminActionDialog
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Data export"
        title={`Export ${label}`}
        confirmLabel="Download CSV"
        impact={`Downloads every ${label.toLowerCase()} record for this gym as a CSV. The file contains personal data, so the request is logged with your reason. Datasets over 20,000 rows are refused (background exports are not available yet).`}
        onSubmit={download}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Danger zone */

export function DangerZone({
  organizationId,
  gymName,
  suspended,
  activeLocks,
}: {
  organizationId: string;
  gymName: string;
  suspended: boolean;
  activeLocks: LockType[];
}) {
  const [panel, setPanel] = useState<
    null | "suspend" | "unsuspend" | "read_only" | "block_whatsapp" | "block_financial_edits" | "sessions"
  >(null);
  const close = () => setPanel(null);
  const has = (t: LockType) => activeLocks.includes(t);

  const rows: { key: NonNullable<typeof panel>; title: string; text: string; label: string; danger: boolean; disabled?: boolean; hint?: string }[] = [
    suspended
      ? { key: "unsuspend", title: "Unsuspend gym", text: "Restores normal access for this gym.", label: "Unsuspend", danger: false }
      : { key: "suspend", title: "Suspend gym", text: "Flags the gym as suspended across the admin panel and records who did it and why. The gym app does not yet block sign-in for suspended gyms.", label: "Suspend gym", danger: true },
    { key: "read_only", title: has("read_only") ? "Lift read-only mode" : "Enable read-only mode", text: "The gym can view data but nothing may be created, edited or sent.", label: has("read_only") ? "Lift" : "Enable", danger: !has("read_only") },
    { key: "block_whatsapp", title: has("block_whatsapp") ? "Resume WhatsApp" : "Block WhatsApp", text: "Stops all WhatsApp sending for this gym; queued messages wait.", label: has("block_whatsapp") ? "Resume" : "Block", danger: !has("block_whatsapp") },
    { key: "block_financial_edits", title: has("block_financial_edits") ? "Unlock financial edits" : "Lock financial operations", text: "Existing payments, expenses and invoices cannot be edited or voided.", label: has("block_financial_edits") ? "Unlock" : "Lock", danger: !has("block_financial_edits") },
    { key: "sessions", title: "Revoke all sessions", text: "Signs out every user of this gym on every device.", label: "Revoke sessions", danger: true },
    { key: "suspend", title: "Archive gym", text: "Archiving is not supported — suspend the gym instead. Nothing is ever permanently deleted from here.", label: "Not available", danger: false, disabled: true, hint: "Not supported" },
  ];

  const lockDialog = panel === "read_only" || panel === "block_whatsapp" || panel === "block_financial_edits" ? panel : null;

  return (
    <div className="divide-y divide-line border-[1.5px] border-accent bg-paper">
      {rows.map((row, i) => (
        <div key={`${row.key}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <strong className="text-[13px] text-ink">{row.title}</strong>
            <span className="text-[11.5px] leading-relaxed text-mute">{row.text}</span>
          </div>
          <button
            type="button"
            disabled={row.disabled}
            title={row.hint}
            onClick={() => setPanel(row.key)}
            className={row.danger ? BTN_DANGER : BTN}
          >
            {row.label}
          </button>
        </div>
      ))}
      <SuspendSheet open={panel === "suspend"} organizationId={organizationId} name={gymName} onClose={close} />
      <ReactivateConfirm open={panel === "unsuspend"} organizationId={organizationId} name={gymName} onClose={close} />
      <SessionsDialog open={panel === "sessions"} onClose={close} organizationId={organizationId} gymName={gymName} scope="all" />
      {lockDialog ? (
        <LockDialog
          open
          onClose={close}
          organizationId={organizationId}
          gymName={gymName}
          lockType={lockDialog}
          enable={!has(lockDialog)}
        />
      ) : null}
    </div>
  );
}

