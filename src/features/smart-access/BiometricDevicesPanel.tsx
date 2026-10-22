"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminActionDialog } from "@/components/AdminActionDialog";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Select } from "@/components/Select";
import { AddIcon, CancelIcon, ClockIcon, EditIcon, ManageIcon, RestoreIcon, RevokeIcon, SuspendIcon } from "@/core/ui/icons";
import {
  changeBiometricDeviceSerial,
  linkBiometricDevice,
  listGymBranchChoices,
  loadBiometricDeviceHistory,
  unlinkBiometricDevice,
  updateBiometricDevice,
} from "./actions";
import {
  deviceStatusView,
  historyChanges,
  historyTitle,
  normalizeSerial,
  relativeTime,
  serialProblem,
  type BiometricDeviceRow,
  type DeviceHistoryRow,
} from "./devices";

export type BranchChoice = { id: string; name: string };

/** The server actions the devices screens call. The real ones by default; a preview or test can pass its own. */
export type DevicesApi = {
  listBranches: typeof listGymBranchChoices;
  link: typeof linkBiometricDevice;
  update: typeof updateBiometricDevice;
  changeSerial: typeof changeBiometricDeviceSerial;
  unlink: typeof unlinkBiometricDevice;
  history: typeof loadBiometricDeviceHistory;
};

export const realDevicesApi: DevicesApi = {
  listBranches: listGymBranchChoices,
  link: linkBiometricDevice,
  update: updateBiometricDevice,
  changeSerial: changeBiometricDeviceSerial,
  unlink: unlinkBiometricDevice,
  history: loadBiometricDeviceHistory,
};

const INPUT = "w-full border-[1.5px] border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none focus:border-ink";
const TONE: Record<"ok" | "idle" | "off", string> = {
  ok: "bg-ink text-paper",
  idle: "bg-sand text-mute",
  off: "bg-accent text-paper",
};

function fmt(iso: string): string {
  // ICU spells September "Sept", which is wider than the other months.
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).replace("Sept ", "Sep ");
}

/** A gym's branches, fetched when a form that needs them opens. */
function useBranchChoices(organizationId: string | null, api: DevicesApi) {
  const [state, setState] = useState<{ organizationId: string | null; loading: boolean; error: string | null; branches: BranchChoice[] }>({
    organizationId: null,
    loading: false,
    error: null,
    branches: [],
  });
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    api.listBranches(organizationId).then((result) => {
      if (!cancelled) setState({ organizationId, loading: false, error: result.error, branches: result.branches });
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, api]);
  return organizationId && state.organizationId === organizationId ? state : { organizationId, loading: Boolean(organizationId), error: null, branches: [] };
}

/** Serial + branch + name: the fields for linking a device. Used for a gym's own Add device and for linking an unclaimed serial. */
export function LinkDeviceDialog({
  open,
  onClose,
  organizationId,
  gymName,
  fixedSerial,
  api = realDevicesApi,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  gymName: string;
  fixedSerial?: string;
  api?: DevicesApi;
}) {
  const [serial, setSerial] = useState(fixedSerial ?? "");
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const choices = useBranchChoices(open ? organizationId : null, api);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSerial(fixedSerial ?? "");
      setName("");
      setBranchId("");
    }
  }
  // A gym with one branch needs no choice.
  const effectiveBranch = branchId || (choices.branches.length === 1 ? choices.branches[0].id : "");
  const problem = fixedSerial ? null : serialProblem(serial);

  return (
    <AdminActionDialog
      open={open}
      onClose={onClose}
      eyebrow="Smart Access devices"
      title={`Add a device to ${gymName}`}
      impact="From now on this serial's punches are stored against this gym, in this branch's timezone. The gym must already have an approved Smart Access request."
      confirmLabel="Add device"
      reasonLabel="Why (kept in the device history)"
      reasonPlaceholder="e.g. Gym requested Smart Access, device handed over on site"
      extraValid={problem === null && effectiveBranch !== ""}
      onSubmit={(reason) => api.link({ serial: fixedSerial ?? serial, organizationId, branchId: effectiveBranch, label: name, reason })}
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-mute">Device serial</span>
          {fixedSerial ? (
            <code className="bg-sand px-3 py-2 text-[13px]">{fixedSerial}</code>
          ) : (
            <>
              <input
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="As printed on the device"
                aria-invalid={serial !== "" && problem !== null}
                className={INPUT}
              />
              {serial !== "" && problem ? <span className="text-[11.5px] text-accent">{problem}</span> : null}
            </>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-mute">Branch the device is in</span>
          {choices.error ? (
            <span className="text-[12px] text-accent">{choices.error}</span>
          ) : (
            <Select
              aria-label="Branch"
              value={effectiveBranch}
              onChange={setBranchId}
              placeholder={choices.loading ? "Loading branches…" : "Choose a branch"}
              options={choices.branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-mute">Name (optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Front door" className={INPUT} />
        </label>
      </div>
    </AdminActionDialog>
  );
}

type Dialogs =
  | { kind: "add" }
  | { kind: "serial"; device: BiometricDeviceRow }
  | { kind: "details"; device: BiometricDeviceRow }
  | { kind: "toggle"; device: BiometricDeviceRow }
  | { kind: "unlink"; device: BiometricDeviceRow }
  | { kind: "history"; device: BiometricDeviceRow | null }
  | null;

const deviceName = (d: BiometricDeviceRow) => d.label ?? "Unnamed device";

export function BiometricDevicesPanel({
  organizationId,
  gymName,
  devices,
  canManage,
  nowIso,
  api = realDevicesApi,
}: {
  organizationId: string;
  gymName: string;
  devices: BiometricDeviceRow[];
  canManage: boolean;
  nowIso: string;
  api?: DevicesApi;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = () => setDialog(null);

  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">Devices</h3>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" icon={ClockIcon} onClick={() => setDialog({ kind: "history", device: null })}>
            History
          </Button>
          {canManage ? (
            <Button size="sm" variant="primary" icon={AddIcon} onClick={() => setDialog({ kind: "add" })}>
              Add device
            </Button>
          ) : null}
        </div>
      </div>

      {devices.length === 0 ? (
        <p className="text-[12.5px] text-mute">
          No device is linked yet. Add the serial printed on the device once the gym has handed it over. Until then its punches are
          refused and the device keeps them.
        </p>
      ) : (
        <ul className="flex flex-col border-[1.5px] border-line">
          {devices.map((device) => {
            const status = deviceStatusView(device, now);
            return (
              <li key={device.id} className="flex flex-col gap-2 border-b border-line px-3 py-2.5 last:border-b-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-bold">{deviceName(device)}</span>
                    <code className="text-[12px] text-mute">{device.serial}</code>
                  </div>
                  <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${TONE[status.tone]}`}>{status.label}</span>
                </div>
                <p className="text-[12px] text-mute">
                  {device.branchName}
                  {status.detail ? ` · ${status.detail}` : ""}
                  {device.firmware ? ` · ${device.firmware}` : ""}
                </p>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon={EditIcon} onClick={() => setDialog({ kind: "serial", device })}>
                      Edit serial
                    </Button>
                    <Button size="sm" icon={ManageIcon} onClick={() => setDialog({ kind: "details", device })}>
                      Name and branch
                    </Button>
                    <Button
                      size="sm"
                      icon={device.status === "active" ? SuspendIcon : RestoreIcon}
                      onClick={() => setDialog({ kind: "toggle", device })}
                    >
                      {device.status === "active" ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" icon={RevokeIcon} tone="danger" onClick={() => setDialog({ kind: "unlink", device })}>
                      Unlink
                    </Button>
                    <Button size="sm" variant="ghost" icon={ClockIcon} onClick={() => setDialog({ kind: "history", device })}>
                      History
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Button size="sm" variant="ghost" icon={ClockIcon} onClick={() => setDialog({ kind: "history", device })}>
                      History
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <LinkDeviceDialog open={dialog?.kind === "add"} onClose={close} organizationId={organizationId} gymName={gymName} api={api} />
      {dialog?.kind === "serial" ? <ChangeSerialDialog device={dialog.device} onClose={close} api={api} /> : null}
      {dialog?.kind === "details" ? <DetailsDialog device={dialog.device} onClose={close} api={api} /> : null}
      {dialog?.kind === "toggle" ? <ToggleDialog device={dialog.device} onClose={close} api={api} /> : null}
      {dialog?.kind === "unlink" ? <UnlinkDialog device={dialog.device} onClose={close} api={api} /> : null}
      {dialog?.kind === "history" ? (
        <HistoryDialog organizationId={organizationId} gymName={gymName} device={dialog.device} nowIso={nowIso} onClose={close} api={api} />
      ) : null}
    </div>
  );
}

function ChangeSerialDialog({ device, onClose, api }: { device: BiometricDeviceRow; onClose: () => void; api: DevicesApi }) {
  const [next, setNext] = useState("");
  const problem = serialProblem(next);
  const same = normalizeSerial(next) === device.serial;
  return (
    <AdminActionDialog
      open
      onClose={onClose}
      eyebrow="Smart Access devices"
      title={`Change the serial of ${deviceName(device)}`}
      impact={
        <>
          Use this to fix a typo or when the gym gets a replacement unit. The old serial stops working at once: its punches are refused
          and the unit keeps them. The new unit starts as never connected, and any enrollment still waiting for the old one is cancelled.
          Punches already stored stay with the gym. This is recorded in the device history.
        </>
      }
      danger
      confirmLabel="Change serial"
      reasonLabel="Why the serial is changing (kept in the device history)"
      reasonPlaceholder="e.g. Original unit replaced under warranty, ticket 4471"
      extraValid={problem === null && !same}
      onSubmit={(reason) => api.changeSerial({ deviceId: device.id, newSerial: next, reason })}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-mute">Current serial</span>
          <code className="bg-sand px-3 py-2 text-[13px]">{device.serial}</code>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-mute">New serial</span>
          <input
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="As printed on the device"
            aria-invalid={next !== "" && (problem !== null || same)}
            className={INPUT}
          />
          {next !== "" && problem ? <span className="text-[11.5px] text-accent">{problem}</span> : null}
          {next !== "" && !problem && same ? <span className="text-[11.5px] text-accent">That is already this device&apos;s serial.</span> : null}
        </label>
      </div>
    </AdminActionDialog>
  );
}

function DetailsDialog({ device, onClose, api }: { device: BiometricDeviceRow; onClose: () => void; api: DevicesApi }) {
  const [name, setName] = useState(device.label ?? "");
  const [branchId, setBranchId] = useState(device.branchId);
  const choices = useBranchChoices(device.organizationId, api);
  const nameChanged = name.trim() !== (device.label ?? "");
  const branchChanged = branchId !== device.branchId;
  return (
    <AdminActionDialog
      open
      onClose={onClose}
      eyebrow="Smart Access devices"
      title={`Name and branch — ${deviceName(device)}`}
      impact="Moving a device to another branch changes the timezone its punches are read in from the next punch on. Punches already stored are not changed."
      confirmLabel="Save"
      reasonLabel="Why (kept in the device history)"
      extraValid={nameChanged || branchChanged}
      onSubmit={(reason) =>
        api.update({ deviceId: device.id, label: nameChanged ? name.trim() : null, branchId: branchChanged ? branchId : null, reason })
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-mute">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Front door" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-mute">Branch</span>
          {choices.error ? (
            <span className="text-[12px] text-accent">{choices.error}</span>
          ) : (
            <Select
              aria-label="Branch"
              value={branchId}
              onChange={setBranchId}
              placeholder={choices.loading ? "Loading branches…" : "Choose a branch"}
              options={choices.branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          )}
        </label>
      </div>
    </AdminActionDialog>
  );
}

function ToggleDialog({ device, onClose, api }: { device: BiometricDeviceRow; onClose: () => void; api: DevicesApi }) {
  const disabling = device.status === "active";
  return (
    <AdminActionDialog
      open
      onClose={onClose}
      eyebrow="Smart Access devices"
      title={`${disabling ? "Disable" : "Enable"} ${deviceName(device)}?`}
      impact={
        disabling
          ? "Its punches are refused while it is disabled, and the device keeps them. They are stored when you enable it again. The device itself is not changed."
          : "Its punches are accepted again, including any the device kept while it was disabled."
      }
      danger={disabling}
      confirmLabel={disabling ? "Disable" : "Enable"}
      reasonLabel="Why (kept in the device history)"
      onSubmit={(reason) => api.update({ deviceId: device.id, status: disabling ? "disabled" : "active", reason })}
    />
  );
}

function UnlinkDialog({ device, onClose, api }: { device: BiometricDeviceRow; onClose: () => void; api: DevicesApi }) {
  return (
    <AdminActionDialog
      open
      onClose={onClose}
      eyebrow="Smart Access devices"
      title={`Unlink ${deviceName(device)}?`}
      impact={
        <>
          <code>{device.serial}</code> becomes an unknown serial again: its punches are refused and the device keeps them. Attendance
          already stored and this device&apos;s history are kept.
        </>
      }
      danger
      confirmLabel="Unlink"
      reasonLabel="Why (kept in the device history)"
      onSubmit={(reason) => api.unlink({ deviceId: device.id, reason })}
    />
  );
}

function HistoryDialog({
  organizationId,
  gymName,
  device,
  nowIso,
  onClose,
  api,
}: {
  organizationId: string;
  gymName: string;
  device: BiometricDeviceRow | null;
  nowIso: string;
  onClose: () => void;
  api: DevicesApi;
}) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; rows: DeviceHistoryRow[]; branchNames: Map<string, string> }>({
    loading: true,
    error: null,
    rows: [],
    branchNames: new Map(),
  });
  useEffect(() => {
    let cancelled = false;
    api.history(organizationId, device?.id ?? null).then((result) => {
      if (!cancelled) {
        setState({ loading: false, error: result.error, rows: result.rows, branchNames: new Map(Object.entries(result.branchNames)) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, device?.id, api]);
  const now = new Date(nowIso);

  return (
    <Dialog open onClose={onClose} eyebrow="Smart Access devices" title={device ? `History — ${deviceName(device)}` : `Device history — ${gymName}`}>
      <div className="flex flex-col gap-3">
        {state.loading ? <p className="text-[12.5px] text-mute">Loading…</p> : null}
        {state.error ? <p className="text-[12.5px] text-accent">{state.error}</p> : null}
        {!state.loading && !state.error && state.rows.length === 0 ? <p className="text-[12.5px] text-mute">Nothing has happened to this device yet.</p> : null}
        <ol className="flex flex-col">
          {state.rows.map((row) => {
            const changes = historyChanges(row, state.branchNames);
            return (
              <li key={row.id} className="flex flex-col gap-1 border-b border-line py-2.5 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] font-bold">{historyTitle(row.event)}</span>
                  <span className="text-[11.5px] text-mute" title={fmt(row.at)}>
                    {relativeTime(row.at, now)} · {fmt(row.at)}
                  </span>
                </div>
                {device === null ? <code className="text-[11.5px] text-mute">{row.serial}</code> : null}
                {changes.length > 0 ? (
                  <ul className="text-[12px] text-ink2">
                    {changes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="border-l-2 border-line pl-2.5 text-[12.5px]">“{row.reason}”</p>
                <p className="text-[11.5px] text-mute">{row.actorEmail ? `by ${row.actorEmail}` : "by the system or a direct database change"}</p>
              </li>
            );
          })}
        </ol>
        <div className="flex justify-end">
          <Button icon={CancelIcon} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
