"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { LinkIcon } from "@/core/ui/icons";
import { LinkDeviceDialog, realDevicesApi, type DevicesApi } from "./BiometricDevicesPanel";
import { relativeTime, sortUnclaimed, type UnclaimedDeviceRow } from "./devices";

/**
 * Devices that have called MyFitDesk but belong to no gym. Their punches are
 * refused (the device keeps them), so once a gym asks for Smart Access the
 * admin links the serial here and the stored punches arrive.
 */
export function UnclaimedDevicesSection({
  devices,
  gyms,
  canManage,
  nowIso,
  api = realDevicesApi,
}: {
  api?: DevicesApi;
  devices: UnclaimedDeviceRow[];
  /** Gyms whose Smart Access request is approved: the only ones a device can be linked to. */
  gyms: { id: string; name: string }[];
  canManage: boolean;
  nowIso: string;
}) {
  const now = new Date(nowIso);
  const [target, setTarget] = useState<{ serial: string; gymId: string } | null>(null);
  const [pickedGym, setPickedGym] = useState<Record<string, string>>({});

  if (devices.length === 0) return null;
  const gymName = (id: string) => gyms.find((g) => g.id === id)?.name ?? "this gym";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">Devices waiting to be linked</h2>
        <p className="max-w-2xl text-[12.5px] text-mute">
          These serials contacted MyFitDesk but are not linked to a gym, so their punches are refused and the devices keep them. Link one
          to the gym that requested Smart Access.
        </p>
      </div>
      <ul className="flex flex-col border-[1.5px] border-line">
        {sortUnclaimed(devices).map((device) => {
          const gymId = pickedGym[device.serial] ?? "";
          return (
            <li key={device.serial} className="flex flex-col gap-2 border-b border-line px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col">
                <code className="text-[13px] font-bold">{device.serial}</code>
                <span className="text-[12px] text-mute">
                  Last contact {relativeTime(device.lastSeenAt, now) ?? "unknown"}
                  {device.firmware ? ` · ${device.firmware}` : ""}
                </span>
              </div>
              {canManage ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="sm:w-[220px]">
                    <Select
                      aria-label={`Gym for ${device.serial}`}
                      value={gymId}
                      onChange={(value) => setPickedGym((p) => ({ ...p, [device.serial]: value }))}
                      placeholder={gyms.length === 0 ? "No approved gyms yet" : "Choose a gym"}
                      options={gyms.map((g) => ({ value: g.id, label: g.name }))}
                      disabled={gyms.length === 0}
                    />
                  </div>
                  <Button size="sm" variant="primary" icon={LinkIcon} disabled={!gymId} onClick={() => setTarget({ serial: device.serial, gymId })}>
                    Link to gym
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {target ? (
        <LinkDeviceDialog
          open
          onClose={() => setTarget(null)}
          organizationId={target.gymId}
          gymName={gymName(target.gymId)}
          fixedSerial={target.serial}
          api={api}
        />
      ) : null}
    </section>
  );
}
