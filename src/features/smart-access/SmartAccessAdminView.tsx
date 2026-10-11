"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { AdminActionDialog } from "@/components/AdminActionDialog";
import { EmptyState } from "@/components/EmptyState";
import { Toggle } from "@/components/Toggle";
import { CancelIcon, ConfirmIcon, CopyIcon, ManageIcon, SmartAccessIcon, TokenIcon, ListIcon } from "@/core/ui/icons";
import { CONFIGURATION_LABEL, CONFIGURATION_STATUSES, type ConfigurationStatus } from "./config";
import {
  issueBiometricIngestToken,
  listBiometricSyncJobs,
  reviewSmartAccessRequest,
  setPackageSmartAccess,
  updateBiometricIntegration,
  type SyncJobRow,
} from "./actions";
import type { SmartAccessPackageRow, SmartAccessRequestRow, SmartAccessRequestStatus } from "./queries";

const FILTERS: { value: SmartAccessRequestStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const STATUS_PILL: Record<SmartAccessRequestStatus, string> = {
  pending: "bg-hi text-ink",
  approved: "bg-ink text-paper",
  rejected: "bg-accent text-paper",
  cancelled: "bg-sand text-mute",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

type Dialog =
  | { kind: "approve" | "reject"; row: SmartAccessRequestRow }
  | { kind: "integration"; row: SmartAccessRequestRow }
  | { kind: "token"; row: SmartAccessRequestRow }
  | { kind: "package"; pkg: SmartAccessPackageRow }
  | null;

export function SmartAccessAdminView({
  requests,
  packages,
  filter,
  error,
  canManage,
  canManagePackages,
}: {
  requests: SmartAccessRequestRow[];
  packages: SmartAccessPackageRow[];
  filter: SmartAccessRequestStatus | "all";
  error: string | null;
  canManage: boolean;
  canManagePackages: boolean;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notes, setNotes] = useState("");
  const [config, setConfig] = useState<ConfigurationStatus>("configuring");
  const [enabled, setEnabled] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{ gym: string; token: string } | null>(null);
  const [jobs, setJobs] = useState<Record<string, SyncJobRow[] | "loading" | string>>({});

  const openIntegration = (row: SmartAccessRequestRow) => {
    setConfig((row.integrationStatus as ConfigurationStatus) ?? "configuring");
    setEnabled(row.integrationEnabled ?? false);
    setDialog({ kind: "integration", row });
  };

  const loadJobs = async (organizationId: string) => {
    setJobs((j) => ({ ...j, [organizationId]: "loading" }));
    const result = await listBiometricSyncJobs(organizationId);
    setJobs((j) => ({ ...j, [organizationId]: result.error ?? result.jobs }));
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-mute">Gyms</span>
        <h1 className="font-display text-2xl tracking-[-0.02em]">Smart Access</h1>
        <p className="max-w-2xl text-[13px] text-mute">
          eSSL biometric activation requests. A gym is active only when its package includes Smart Access, its request is
          approved, and its device is verified and enabled here. Nothing on this page sends a command to a device.
        </p>
      </div>

      {issuedToken ? (
        <div className="flex flex-col gap-2 border-[1.5px] border-accent p-4">
          <span className="text-[13px] font-bold">Ingest token for {issuedToken.gym}. Copy it now: it won&apos;t be shown again.</span>
          <code className="break-all bg-sand px-3 py-2 text-[12px]">{issuedToken.token}</code>
          <div className="flex gap-2">
            <Button icon={CopyIcon} onClick={() => navigator.clipboard?.writeText(issuedToken.token)}>Copy</Button>
            <Button variant="ghost" icon={CancelIcon} onClick={() => setIssuedToken(null)}>I&apos;ve stored it</Button>
          </div>
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter requests">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              href={`/admin/smart-access?status=${f.value}`}
              className={`border-[1.5px] px-3 py-1.5 text-[12px] font-bold ${filter === f.value ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        {error ? <p className="text-[13px] text-accent">{error}</p> : null}
        {requests.length === 0 && !error ? (
          <EmptyState message="No requests here. Gym owners request Smart Access from Settings → Smart Access." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {requests.map((row) => {
            const rowJobs = jobs[row.organizationId];
            return (
              <li key={row.id} className="flex flex-col gap-3 border-[1.5px] border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link href={`/admin/gyms/${row.organizationId}`} className="truncate text-[15px] font-bold hover:text-accent">
                      {row.gymName}
                    </Link>
                    <span className="text-[12px] text-mute">
                      Requested {fmt(row.requestedAt)}
                      {row.requestedByEmail ? ` by ${row.requestedByEmail}` : ""}
                    </span>
                  </div>
                  <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${STATUS_PILL[row.status]}`}>{row.status}</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
                  <div><dt className="text-mute">Package</dt><dd className="font-bold">{row.packageName ?? "Trial / none"}</dd></div>
                  <div><dt className="text-mute">Plan includes Smart Access</dt><dd className={`font-bold ${row.entitled ? "" : "text-accent"}`}>{row.entitled ? "Yes" : "No"}</dd></div>
                  <div><dt className="text-mute">Device</dt><dd className="font-bold">{row.integrationStatus ? CONFIGURATION_LABEL[row.integrationStatus as ConfigurationStatus] ?? row.integrationStatus : "—"}{row.integrationEnabled ? " · enabled" : ""}</dd></div>
                  <div><dt className="text-mute">Last event</dt><dd className="font-bold">{fmt(row.lastEventReceivedAt)}</dd></div>
                </dl>
                {row.ownerNote ? <p className="border-l-2 border-line pl-3 text-[12.5px]">“{row.ownerNote}”</p> : null}
                {row.rejectionReason ? <p className="text-[12px] text-accent">Rejected: {row.rejectionReason}</p> : null}
                {row.adminNotes ? <p className="text-[12px] text-mute">Admin notes: {row.adminNotes}</p> : null}
                {row.lastSyncError ? <p className="text-[12px] text-accent">Last error: {row.lastSyncError}</p> : null}

                <div className="flex flex-wrap gap-2">
                  {canManage && row.status === "pending" ? (
                    <>
                      <Button variant="primary" icon={ConfirmIcon} disabled={!row.entitled} title={row.entitled ? undefined : "The gym's package doesn't include Smart Access"} onClick={() => { setNotes(""); setDialog({ kind: "approve", row }); }}>Approve</Button>
                      <Button icon={CancelIcon} onClick={() => { setNotes(""); setDialog({ kind: "reject", row }); }}>Reject</Button>
                    </>
                  ) : null}
                  {canManage && row.status === "approved" ? (
                    <>
                      <Button icon={ManageIcon} onClick={() => openIntegration(row)}>Configure device</Button>
                      <Button icon={TokenIcon} onClick={() => setDialog({ kind: "token", row })}>{row.hasIngestToken ? "Rotate connector token" : "Issue connector token"}</Button>
                    </>
                  ) : null}
                  {row.integrationStatus ? (
                    <Button variant="ghost" icon={ListIcon} onClick={() => loadJobs(row.organizationId)} pending={rowJobs === "loading"} pendingLabel="Loading…">Sync history</Button>
                  ) : null}
                </div>
                {Array.isArray(rowJobs) ? (
                  rowJobs.length === 0 ? (
                    <p className="text-[12px] text-mute">No sync jobs yet.</p>
                  ) : (
                    <ul className="flex flex-col border-[1.5px] border-line text-[12px]">
                      {rowJobs.map((j) => (
                        <li key={j.id} className="flex flex-wrap justify-between gap-2 border-b border-line px-3 py-2 last:border-b-0">
                          <span className="font-bold">{j.syncType} · {j.status}</span>
                          <span className="text-mute">{fmt(j.createdAt)} · {j.succeeded}/{j.total} ok{j.failed ? ` · ${j.failed} failed` : ""}</span>
                          {j.error ? <span className="w-full text-accent">{j.error}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )
                ) : typeof rowJobs === "string" && rowJobs !== "loading" ? (
                  <p className="text-[12px] text-accent">{rowJobs}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">Packages that include Smart Access</h2>
        <ul className="flex flex-col border-[1.5px] border-line">
          {packages.map((pkg) => (
            <li key={pkg.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 last:border-b-0">
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-bold">{pkg.name} <span className="font-normal text-mute">· {pkg.billingPeriod}{pkg.status !== "active" ? " · archived" : ""}</span></span>
                <span className="text-[11.5px] text-mute">{pkg.gymCount} gym{pkg.gymCount === 1 ? "" : "s"} on this package</span>
              </span>
              <Button
                size="sm"
                variant={pkg.includesSmartAccess ? "primary" : "secondary"}
                icon={SmartAccessIcon}
                disabled={!canManagePackages}
                onClick={() => setDialog({ kind: "package", pkg })}
              >
                {pkg.includesSmartAccess ? "Included" : "Not included"}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {dialog?.kind === "approve" || dialog?.kind === "reject" ? (
        <AdminActionDialog
          open
          onClose={() => setDialog(null)}
          eyebrow="Smart Access"
          title={dialog.kind === "approve" ? `Approve ${dialog.row.gymName}?` : `Reject ${dialog.row.gymName}?`}
          impact={
            dialog.kind === "approve"
              ? "Creates a disabled, unconfigured eSSL integration for this gym only. Nothing becomes active until the device is verified and enabled."
              : "The owner sees your reason and can send a new request."
          }
          reasonLabel={dialog.kind === "reject" ? "Reason shown to the gym owner" : "Reason"}
          confirmLabel={dialog.kind === "approve" ? "Approve" : "Reject"}
          danger={dialog.kind === "reject"}
          onSubmit={(r) => reviewSmartAccessRequest({ requestId: dialog.row.id, approve: dialog.kind === "approve", reason: r, adminNotes: notes })}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-mute">Internal notes (never shown to the gym)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} className="border-[1.5px] border-line bg-paper px-3 py-2 text-[13px]" />
          </label>
        </AdminActionDialog>
      ) : null}

      {dialog?.kind === "integration" ? (
        <AdminActionDialog
          open
          onClose={() => setDialog(null)}
          eyebrow="Smart Access"
          title={`Device setup — ${dialog.row.gymName}`}
          impact="Enabling requires Connected or Verified, an approved request and a package that includes Smart Access. Suspending stops attendance tracking for this gym; the device itself is not changed."
          confirmLabel="Save"
          danger={config === "suspended" || (dialog.row.integrationEnabled === true && !enabled)}
          onSubmit={(r) => updateBiometricIntegration({ organizationId: dialog.row.organizationId, configurationStatus: config, enabled, reason: r })}
        >
          <div className="flex flex-col gap-3">
            <Select
              aria-label="Configuration status"
              value={config}
              onChange={(v) => setConfig(v as ConfigurationStatus)}
              options={CONFIGURATION_STATUSES.map((s) => ({ value: s, label: CONFIGURATION_LABEL[s] }))}
            />
            <Toggle
              checked={enabled}
              onChange={setEnabled}
              disabled={!['connected', 'verified'].includes(config)}
              label="Enabled"
              hint="Attendance is accepted from this gym's connector."
            />
          </div>
        </AdminActionDialog>
      ) : null}

      {dialog?.kind === "token" ? (
        <AdminActionDialog
          open
          onClose={() => setDialog(null)}
          eyebrow="Smart Access"
          title={`${dialog.row.hasIngestToken ? "Rotate" : "Issue"} connector token — ${dialog.row.gymName}`}
          impact={dialog.row.hasIngestToken ? "The current token stops working immediately. The gym's connector must be updated with the new one." : "The token lets this gym's connector post attendance. It is shown once."}
          confirmLabel={dialog.row.hasIngestToken ? "Rotate token" : "Issue token"}
          danger={dialog.row.hasIngestToken}
          onSubmit={async (r) => {
            const result = await issueBiometricIngestToken({ organizationId: dialog.row.organizationId, reason: r });
            if (result.token) setIssuedToken({ gym: dialog.row.gymName, token: result.token });
            return { error: result.error, message: result.token ? "Token issued. Copy it from the banner." : undefined };
          }}
        />
      ) : null}

      {dialog?.kind === "package" ? (
        <AdminActionDialog
          open
          onClose={() => setDialog(null)}
          eyebrow="Packages"
          title={dialog.pkg.includesSmartAccess ? `Remove Smart Access from ${dialog.pkg.name}?` : `Include Smart Access in ${dialog.pkg.name}?`}
          impact={
            dialog.pkg.includesSmartAccess
              ? `This downgrades all ${dialog.pkg.gymCount} gym(s) on this package immediately: attendance tracking and enrollment screens switch off. Their records are kept.`
              : "Gyms on this package become eligible for Smart Access. Each still needs an approved request and a verified device."
          }
          confirmLabel={dialog.pkg.includesSmartAccess ? "Remove" : "Include"}
          danger={dialog.pkg.includesSmartAccess}
          onSubmit={(r) => setPackageSmartAccess({ packageId: dialog.pkg.id, included: !dialog.pkg.includesSmartAccess, reason: r })}
        />
      ) : null}
    </div>
  );
}
