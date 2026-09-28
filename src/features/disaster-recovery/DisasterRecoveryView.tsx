"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { AddIcon, AlertIcon, DatabaseIcon, DeleteIcon, RestoreIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";
import {
  createManualBackup,
  requestBackupDeletion,
  requestRestore,
  resolveAlert,
  restoreDeletedRecord,
  setBackupProtected,
  setMaintenanceMode,
  type RecoveryActionResult,
} from "./actions";
import type { BackupRow, DisasterRecoveryData } from "./types";

const TABS = ["Backups", "Restore History", "Audit Logs", "Deleted Records", "System Health"] as const;
type Tab = (typeof TABS)[number];
type Confirmation =
  | { kind: "restore"; backup: BackupRow }
  | { kind: "delete"; backup: BackupRow }
  | { kind: "deleted-record"; entityType: string; entityId: string; name: string }
  | { kind: "maintenance"; enabled: boolean }
  | null;

const RESTORE_STAGE: Record<string, string> = {
  queued: "Queued",
  preparing: "Preparing restore",
  backing_up_current: "Creating safety backup",
  downloading: "Downloading backup",
  verifying_checksum: "Verifying checksum",
  restoring: "Restoring database",
  verifying: "Verifying database",
  completing: "Completing",
  completed: "Completed",
  failed: "Failed",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatBytes(value: number | null | undefined) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function Status({ value }: { value: string }) {
  return <span className={PILL_CLASS} style={pillTone(label(value))}>{label(value)}</span>;
}

export function DisasterRecoveryView({ data }: { data: DisasterRecoveryData }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("Backups");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [selected, setSelected] = useState<BackupRow | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [maintenanceReason, setMaintenanceReason] = useState("Planned maintenance");
  const [isPending, startTransition] = useTransition();
  const production = data.environment === "production";
  const hasActiveRestore = data.restores.some((row) => !["completed", "failed"].includes(row.status));

  useEffect(() => {
    if (!hasActiveRestore) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveRestore, router]);

  const filteredBackups = useMemo(() => data.backups.filter((backup) => {
    if (typeFilter !== "all" && backup.backup_type !== typeFilter) return false;
    if (statusFilter !== "all" && backup.status !== statusFilter) return false;
    if (dateFilter && backup.created_at.slice(0, 10) !== dateFilter) return false;
    return backup.status !== "deleted";
  }), [data.backups, dateFilter, statusFilter, typeFilter]);

  function run(operation: () => Promise<RecoveryActionResult>, close = true) {
    startTransition(async () => {
      const result = await operation();
      if (result.error) toast.error(result.error);
      else toast.success(result.message ?? "Done.");
      if (close) setConfirmation(null);
      router.refresh();
    });
  }

  const restorePhrase = production ? "RESTORE PRODUCTION" : "RESTORE DEVELOPMENT";
  const maintenancePhrase = confirmation?.kind === "maintenance"
    ? (confirmation.enabled ? "ENABLE MAINTENANCE" : "DISABLE MAINTENANCE")
    : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-mute">System</span>
          <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">Disaster Recovery</h1>
          <p className="text-[12.5px] text-mute">Private database backups, verified recovery, and system safeguards.</p>
        </div>
        <button
          type="button"
          disabled={isPending || !data.health.configured}
          onClick={() => run(createManualBackup, false)}
          className="press-scale flex min-h-[40px] items-center gap-2 bg-ink px-3.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-hi disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AddIcon size={ICON_SIZE.button} aria-hidden />
          {isPending ? "Queuing…" : "Create backup"}
        </button>
      </div>

      <div className={`border-l-[3px] px-4 py-3 ${production ? "border-accent bg-accent/8" : "border-ink bg-sand"}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`text-[11px] font-bold uppercase tracking-[0.12em] ${production ? "text-accent" : "text-ink"}`}>
            {production ? "Production database" : "Development database"}
          </span>
          <span className="text-[11.5px] text-mute">
            {data.health.configured ? `Identity: ${data.health.databaseIdentifier}` : "Recovery config is not initialized in this database."}
          </span>
          {data.health.maintenanceMode ? <Status value="maintenance enabled" /> : null}
        </div>
      </div>

      <div className="overflow-x-auto border-b-[1.5px] border-ink">
        <div className="flex min-w-max gap-1">
          {TABS.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)}
              className={`min-h-[42px] border-b-[3px] px-3 text-[11.5px] font-bold ${tab === item ? "border-accent text-ink" : "border-transparent text-mute hover:text-ink"}`}>
              {item}
              {item === "System Health" && data.health.openCriticalAlerts ? ` (${data.health.openCriticalAlerts})` : ""}
            </button>
          ))}
        </div>
      </div>

      {tab === "Backups" ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <select aria-label="Backup environment" value={data.environment} disabled className="min-h-[36px] border-[1.5px] border-line bg-sand px-2.5 text-[12px]">
              <option value={data.environment}>{label(data.environment)}</option>
            </select>
            <select aria-label="Backup type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="min-h-[36px] border-[1.5px] border-line bg-paper px-2.5 text-[12px]">
              <option value="all">All types</option>
              {["hourly", "daily", "monthly", "manual", "pre_restore", "pre_migration"].map((value) => <option key={value} value={value}>{label(value)}</option>)}
            </select>
            <select aria-label="Backup status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-[36px] border-[1.5px] border-line bg-paper px-2.5 text-[12px]">
              <option value="all">All statuses</option>
              {["queued", "creating", "ready", "failed", "restoring", "delete_requested", "corrupted"].map((value) => <option key={value} value={value}>{label(value)}</option>)}
            </select>
            <input aria-label="Backup date" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="min-h-[36px] border-[1.5px] border-line bg-paper px-2.5 text-[12px]" />
          </div>

          <div className="border-[1.5px] border-ink bg-paper">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-[12px]">
                <thead><tr>{["Backup date", "Environment", "Type", "Size", "Status", "Verification", "Created by", "Duration", "Actions"].map((heading) => <th key={heading} className="mfd-micro-label whitespace-nowrap border-b border-line px-3 py-2.5 text-left">{heading}</th>)}</tr></thead>
                <tbody>{filteredBackups.map((backup) => (
                  <tr key={backup.id} className="mfd-table-row transition-colors duration-150 hover:bg-sand/70">
                    <td className="whitespace-nowrap border-b border-line px-3 py-2.5 font-bold">{formatDate(backup.created_at)}</td>
                    <td className="border-b border-line px-3 py-2.5"><span className={production ? "font-bold text-accent" : "font-bold"}>{label(backup.environment)}</span></td>
                    <td className="border-b border-line px-3 py-2.5">{label(backup.backup_type)}</td>
                    <td className="whitespace-nowrap border-b border-line px-3 py-2.5">{formatBytes(backup.file_size_bytes)}</td>
                    <td className="border-b border-line px-3 py-2.5"><Status value={backup.protected ? "protected" : backup.status} /></td>
                    <td className="border-b border-line px-3 py-2.5"><Status value={backup.verification_status} /></td>
                    <td className="border-b border-line px-3 py-2.5">{backup.triggered_by ? "Administrator" : "System"}</td>
                    <td className="whitespace-nowrap border-b border-line px-3 py-2.5">{backup.duration_ms ? `${Math.round(backup.duration_ms / 1000)} sec` : "—"}</td>
                    <td className="border-b border-line px-3 py-2.5"><BackupActions backup={backup} busy={isPending} onDetails={setSelected} onConfirm={setConfirmation} onProtect={(value) => run(() => setBackupProtected(backup.id, value), false)} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex flex-col md:hidden">
              {filteredBackups.map((backup) => (
                <article key={backup.id} className="flex flex-col gap-2.5 border-b border-line p-3.5 transition-colors duration-150 last:border-b-0 hover:bg-sand/70">
                  <div className="flex items-start justify-between gap-2"><span><strong className="block text-[13px]">{formatDate(backup.created_at)}</strong><span className="text-[11px] text-mute">{label(backup.environment)} · {label(backup.backup_type)}</span></span><Status value={backup.protected ? "protected" : backup.status} /></div>
                  <div className="grid grid-cols-2 gap-2 text-[11.5px]"><span>Size <strong className="block text-ink">{formatBytes(backup.file_size_bytes)}</strong></span><span>Verification <strong className="block text-ink">{label(backup.verification_status)}</strong></span></div>
                  <BackupActions backup={backup} busy={isPending} onDetails={setSelected} onConfirm={setConfirmation} onProtect={(value) => run(() => setBackupProtected(backup.id, value), false)} />
                </article>
              ))}
            </div>
            {!filteredBackups.length ? <p className="p-8 text-center text-[12.5px] text-mute">No backups match these filters.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "Restore History" ? (
        <section className="flex flex-col gap-3">
          {data.restores.map((restore) => (
            <article key={restore.id} className="border-[1.5px] border-line bg-paper p-4 transition-colors duration-150 hover:bg-sand/70">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span><strong className="block text-[13.5px]">{RESTORE_STAGE[restore.status] ?? label(restore.status)}</strong><span className="text-[11.5px] text-mute">Started {formatDate(restore.started_at)} · {label(restore.environment)}</span></span>
                <Status value={restore.status} />
              </div>
              <div className="mt-3 grid gap-2 text-[11.5px] sm:grid-cols-2 lg:grid-cols-4">
                <span>Backup<strong className="block truncate font-mono text-[10.5px] text-ink">{restore.backup_id}</strong></span>
                <span>Safety backup<strong className="block truncate font-mono text-[10.5px] text-ink">{restore.pre_restore_backup_id ?? "Not created yet"}</strong></span>
                <span>Checksum<strong className="block text-ink">{restore.checksum_verified ? "Verified" : "Pending"}</strong></span>
                <span>Maintenance<strong className="block text-ink">{restore.maintenance_mode_enabled ? "Enabled" : "Disabled"}</strong></span>
              </div>
              {restore.error_message ? <p className="mt-3 border-l-2 border-accent bg-accent/8 px-3 py-2 text-[11.5px] text-accent">{restore.error_message}</p> : null}
            </article>
          ))}
          {!data.restores.length ? <Empty message="No restore has been requested in this environment." /> : null}
        </section>
      ) : null}

      {tab === "Audit Logs" ? (
        <section className="border-[1.5px] border-ink bg-paper">
          {data.audits.map((audit) => (
            <div key={audit.id} className="grid gap-1 border-b border-line px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-sand/70 md:grid-cols-[180px_1fr_180px]">
              <span className="text-[11px] text-mute">{formatDate(audit.created_at)}</span>
              <span className="text-[12.5px] font-bold">{label(audit.action.replaceAll(".", " "))}<small className="ml-2 font-normal text-mute">{audit.entity_type} {audit.entity_id?.slice(0, 8)}</small></span>
              <span className="text-[11px] text-mute md:text-right">{audit.actor_role ?? "system"}</span>
            </div>
          ))}
          {!data.audits.length ? <Empty message="No disaster-recovery audit events yet." /> : null}
        </section>
      ) : null}

      {tab === "Deleted Records" ? (
        <section className="flex flex-col gap-3">
          <div className="border-l-2 border-ink bg-sand px-4 py-3 text-[12px] text-mute">This recycle bin uses MyFitDesk&apos;s existing soft-delete/request-delete fields. Payments are intentionally excluded.</div>
          <div className="border-[1.5px] border-ink bg-paper">
            {data.deletedRecords.map((record) => (
              <div key={`${record.entity_type}-${record.entity_id}`} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-sand/70">
                <span className="mr-auto min-w-0"><strong className="block truncate text-[13px]">{record.display_name}</strong><span className="text-[11px] text-mute">{label(record.entity_type)} · deleted {formatDate(record.deleted_at)}</span></span>
                <button type="button" disabled={isPending} onClick={() => setConfirmation({ kind: "deleted-record", entityType: record.entity_type, entityId: record.entity_id, name: record.display_name })} className="press-scale flex min-h-[34px] items-center gap-1.5 border-[1.5px] border-line px-3 text-[11px] font-bold"><RestoreIcon size={13} aria-hidden /> Restore</button>
              </div>
            ))}
            {!data.deletedRecords.length ? <Empty message="No soft-deleted records are waiting for recovery." /> : null}
          </div>
        </section>
      ) : null}

      {tab === "System Health" ? (
        <section className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Last successful backup", formatDate(data.health.lastSuccessfulBackup)],
              ["Next expected backup", formatDate(data.health.nextExpectedBackup)],
              ["Backup failures", String(data.health.backupFailures)],
              ["Open critical alerts", String(data.health.openCriticalAlerts)],
              ["Oldest retained", formatDate(data.health.oldestRetainedBackup)],
              ["Newest backup", formatDate(data.health.newestBackup)],
              ["Total storage", formatBytes(data.health.totalStorageBytes)],
              ["Verified backups", `${data.health.verifiedBackups} / ${data.health.backupCount}`],
            ].map(([heading, value]) => <div key={heading} className="border-[1.5px] border-line bg-paper p-3.5"><span className="mfd-micro-label block">{heading}</span><strong className="mt-2 block text-[15px]">{value}</strong></div>)}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border-[1.5px] border-ink bg-paper p-4">
              <h2 className="font-display text-[16px]">Storage by backup type</h2>
              <div className="mt-3 flex flex-col gap-2 text-[12px]">
                {["hourly", "daily", "monthly", "manual", "pre_restore", "pre_migration"].map((type) => <div key={type} className="flex justify-between border-b border-line px-1 pb-2 transition-colors duration-150 hover:bg-sand/70"><span>{label(type)}</span><strong>{formatBytes(data.health.storageByType[type] ?? 0)}</strong></div>)}
                <div className="flex justify-between pt-1"><span>Estimated 30-day storage</span><strong>{formatBytes(data.health.estimatedThirtyDayBytes)}</strong></div>
              </div>
            </div>
            <div className={`border-[1.5px] p-4 ${data.health.maintenanceMode ? "border-accent bg-accent/8" : "border-ink bg-paper"}`}>
              <h2 className="font-display text-[16px]">Maintenance mode</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-mute">{data.health.maintenanceMode ? data.health.maintenanceReason || "Maintenance mode is active." : "Normal application access is enabled."}</p>
              <label className="mt-3 flex flex-col gap-1"><span className="mfd-micro-label">Reason</span><input value={maintenanceReason} onChange={(event) => setMaintenanceReason(event.target.value)} maxLength={500} className="min-h-[38px] border-[1.5px] border-line bg-paper px-2.5 text-[12px]" /></label>
              <button type="button" disabled={isPending || !data.health.configured} onClick={() => setConfirmation({ kind: "maintenance", enabled: !data.health.maintenanceMode })} className={`mt-3 min-h-[38px] px-3 text-[11px] font-bold uppercase tracking-[0.09em] ${data.health.maintenanceMode ? "bg-accent text-paper" : "bg-ink text-hi"}`}>{data.health.maintenanceMode ? "Disable maintenance" : "Enable maintenance"}</button>
            </div>
          </div>

          <div className="border-[1.5px] border-ink bg-paper">
            <div className="border-b-[1.5px] border-ink px-4 py-3"><h2 className="font-display text-[16px]">System alerts</h2></div>
            {data.alerts.filter((alert) => !alert.resolved_at).map((alert) => <div key={alert.id} className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-sand/70"><AlertIcon size={16} className={alert.severity === "critical" ? "text-accent" : "text-mute"} aria-hidden /><span className="mr-auto min-w-0 flex-1"><strong className="block text-[12.5px]">{alert.message}</strong><span className="text-[10.5px] text-mute">{label(alert.type)} · {formatDate(alert.created_at)}</span></span><button disabled={isPending} onClick={() => run(() => resolveAlert(alert.id), false)} className="border-[1.5px] border-line px-2.5 py-1.5 text-[10.5px] font-bold">Resolve</button></div>)}
            {!data.alerts.some((alert) => !alert.resolved_at) ? <Empty message="No open system alerts." /> : null}
          </div>
        </section>
      ) : null}

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} eyebrow="Backup details" title={selected?.filename ?? "Backup"}>
        {selected ? <dl className="grid gap-2 text-[12px] sm:grid-cols-2">{[
          ["Environment", label(selected.environment)], ["Type", label(selected.backup_type)], ["Status", label(selected.status)],
          ["Size", formatBytes(selected.file_size_bytes)], ["Created", formatDate(selected.created_at)], ["Completed", formatDate(selected.completed_at)],
          ["Verification", label(selected.verification_status)], ["Protected", selected.protected ? "Yes" : "No"],
          ["Checksum", selected.checksum_sha256 ?? "Pending"], ["Storage key", selected.storage_key ?? "Pending"],
        ].map(([term, value]) => <div key={term} className={term === "Checksum" || term === "Storage key" ? "sm:col-span-2" : ""}><dt className="mfd-micro-label">{term}</dt><dd className="mt-1 break-all font-mono text-[10.5px]">{value}</dd></div>)}</dl> : null}
      </Dialog>

      <ConfirmDialog open={confirmation?.kind === "restore"} danger title={production ? "RESTORE PRODUCTION DATABASE" : "Restore development database"}
        description={confirmation?.kind === "restore" ? `Selected backup: ${formatDate(confirmation.backup.created_at)}. The current application-managed database schema/data will be replaced. A pre-restore emergency backup must complete first.` : ""}
        confirmLabel="Queue restore" pending={isPending} requireTypedConfirmation={restorePhrase}
        onConfirm={() => confirmation?.kind === "restore" && run(() => requestRestore(confirmation.backup.id, restorePhrase))} onCancel={() => setConfirmation(null)} />
      <ConfirmDialog open={confirmation?.kind === "delete"} danger title="Delete private backup?" description="The worker will permanently remove the R2 object. Protected backups cannot be deleted."
        confirmLabel="Delete backup" pending={isPending} requireTypedConfirmation={production ? "DELETE PRODUCTION BACKUP" : undefined}
        onConfirm={() => confirmation?.kind === "delete" && run(() => requestBackupDeletion(confirmation.backup.id, production ? "DELETE PRODUCTION BACKUP" : ""))} onCancel={() => setConfirmation(null)} />
      <ConfirmDialog open={confirmation?.kind === "deleted-record"} title="Restore deleted record?" description={confirmation?.kind === "deleted-record" ? `${confirmation.name} will become available again using its existing record identity.` : ""}
        confirmLabel="Restore record" pending={isPending} onConfirm={() => confirmation?.kind === "deleted-record" && run(() => restoreDeletedRecord(confirmation.entityType, confirmation.entityId))} onCancel={() => setConfirmation(null)} />
      <ConfirmDialog open={confirmation?.kind === "maintenance"} danger={production} title={`${confirmation?.kind === "maintenance" && confirmation.enabled ? "Enable" : "Disable"} maintenance mode?`}
        description="Platform-admin disaster recovery remains accessible. Tenant-app enforcement requires the documented maintenance-mode guard in FitDeskApp."
        confirmLabel="Confirm" pending={isPending} requireTypedConfirmation={production ? maintenancePhrase : undefined}
        onConfirm={() => confirmation?.kind === "maintenance" && run(() => setMaintenanceMode(confirmation.enabled, maintenanceReason, production ? maintenancePhrase : ""))} onCancel={() => setConfirmation(null)} />
    </div>
  );
}

function BackupActions({ backup, busy, onDetails, onConfirm, onProtect }: {
  backup: BackupRow;
  busy: boolean;
  onDetails: (backup: BackupRow) => void;
  onConfirm: (value: Confirmation) => void;
  onProtect: (value: boolean) => void;
}) {
  const actionable = backup.status === "ready";
  return <div className="flex flex-wrap gap-1.5">
    <button type="button" onClick={() => onDetails(backup)} className="min-h-[30px] border border-line px-2 text-[10.5px] font-bold">Details</button>
    <button type="button" disabled={busy || !actionable || backup.verification_status !== "verified"} onClick={() => onConfirm({ kind: "restore", backup })} className="min-h-[30px] border border-line px-2 text-[10.5px] font-bold disabled:opacity-40">Restore</button>
    <button type="button" disabled={busy || !actionable} onClick={() => onProtect(!backup.protected)} className="min-h-[30px] border border-line px-2 text-[10.5px] font-bold disabled:opacity-40">{backup.protected ? "Unprotect" : "Protect"}</button>
    <button type="button" aria-label="Delete backup" disabled={busy || backup.protected || !["ready", "failed", "corrupted"].includes(backup.status)} onClick={() => onConfirm({ kind: "delete", backup })} className="flex min-h-[30px] items-center border border-line px-2 text-accent disabled:opacity-30"><DeleteIcon size={12} aria-hidden /></button>
  </div>;
}

function Empty({ message }: { message: string }) {
  return <div className="flex flex-col items-center gap-2 p-8 text-center"><DatabaseIcon size={22} className="text-mute2" aria-hidden /><p className="text-[12.5px] text-mute">{message}</p></div>;
}
