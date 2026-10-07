"use client";

import { useId, useState } from "react";
import { Button } from "@/components/Button";
import { formatMinor, formatMinorWhole } from "@/core/money/format";
import { AddIcon, ArchiveIcon, EditIcon, RestoreIcon, WhatsAppIcon } from "@/core/ui/icons";
import type { WhatsAppCreditPackage } from "./queries";

const PACKAGE_HEADERS = [
  "bg-sand text-ink",
  "bg-ink text-hi",
  "bg-accent text-paper",
];

export function CreditPackageCatalog({
  packages,
  onEdit,
  onStatusChange,
  pending,
  busyKey,
}: {
  packages: WhatsAppCreditPackage[];
  onEdit: (pkg: WhatsAppCreditPackage | "new") => void;
  onStatusChange: (pkg: WhatsAppCreditPackage) => void;
  pending: boolean;
  busyKey: string | null;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const catalogId = useId();
  const active = packages.filter((pkg) => pkg.status === "active");
  const archived = packages.filter((pkg) => pkg.status === "archived");

  function renderCard(pkg: WhatsAppCreditPackage, index: number) {
    const isArchived = pkg.status === "archived";
    const saving = busyKey === `status-${pkg.id}`;
    const price = pkg.priceMinor % 100 === 0
      ? formatMinorWhole(pkg.priceMinor, pkg.currency)
      : formatMinor(pkg.priceMinor, pkg.currency);

    return (
      <article key={pkg.id} className="flex min-w-0 flex-col gap-2.5">
        <div className={`flex flex-1 flex-col border-[1.5px] ${isArchived ? "border-line" : "border-ink"}`}>
          <div className={`flex flex-1 flex-col px-5 py-5 sm:px-6 ${isArchived ? "bg-sand text-mute" : PACKAGE_HEADERS[index % PACKAGE_HEADERS.length]}`}>
            <h3 className="break-words text-[11px] font-bold uppercase tracking-[0.12em]">{pkg.name}</h3>
            <strong className="mt-1 break-words font-display text-[32px] leading-tight tracking-[-0.03em] sm:text-[36px]">
              {pkg.credits.toLocaleString("en-IN")}
            </strong>
            <span className="mt-0.5 text-[13px]">WhatsApp messages</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 bg-paper px-5 py-5 sm:px-6">
            <strong className="break-all font-display text-[25px] leading-tight tracking-[-0.02em] sm:text-[28px]">{price}</strong>
            <span className="text-[12px] text-mute">
              {pkg.credits > 0 ? `${formatMinor(pkg.priceMinor / pkg.credits, pkg.currency)} each` : "—"}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-1 px-0.5">
          <code className="min-w-0 break-all text-[10.5px] text-mute">{pkg.code}</code>
          {isArchived ? <span className="text-[10px] font-bold uppercase tracking-wider text-mute">Archived</span> : null}
        </div>
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          <Button icon={EditIcon} variant="secondary" size="lg" className="min-w-0" onClick={() => onEdit(pkg)} aria-label={`Edit ${pkg.name}`}>
            Edit
          </Button>
          <Button
            icon={isArchived ? RestoreIcon : ArchiveIcon}
            variant="secondary"
            size="lg"
            className="min-w-0"
            disabled={pending}
            pending={saving}
            pendingLabel="Saving…"
            aria-label={`${isArchived ? "Restore" : "Archive"} ${pkg.name}`}
            onClick={() => onStatusChange(pkg)}
          >
            {isArchived ? "Restore" : "Archive"}
          </Button>
        </div>
      </article>
    );
  }

  return (
    <section aria-labelledby={`${catalogId}-title`} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start gap-2.5 text-[12px] sm:items-center">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-ink text-hi"><WhatsAppIcon size={15} aria-hidden /></span>
        <p className="leading-relaxed">
          <strong className="mr-2">Checkout preview</strong>
          <span className="text-mute">Cards mirror what gym owners see; admin details sit beneath.</span>
        </p>
      </div>
      <div className="border-[1.5px] border-ink bg-paper p-4 sm:p-6 lg:p-7">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 id={`${catalogId}-title`} className="font-display text-[24px] tracking-[-0.025em] sm:text-[28px]">Credit packages</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-mute">As shown at gym-owner checkout, in this order.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:shrink-0">
            <Button icon={ArchiveIcon} variant="secondary" size="lg" selected={showArchived} aria-expanded={showArchived} aria-controls={`${catalogId}-archived`} onClick={() => setShowArchived((value) => !value)}>
              Archived ({archived.length})
            </Button>
            <Button icon={AddIcon} variant="primary" size="lg" onClick={() => onEdit("new")}>New package</Button>
          </div>
        </div>
        {active.length ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2 xl:grid-cols-3">{active.map(renderCard)}</div>
        ) : (
          <p className="border-[1.5px] border-dashed border-line bg-sand/40 p-6 text-center text-[12.5px] leading-relaxed text-mute">
            No active credit packages. Create a new package{archived.length ? " or restore an archived one" : ""} to make it available at checkout.
          </p>
        )}
        <div id={`${catalogId}-archived`} hidden={!showArchived}>
          {showArchived ? (
            <div className="mt-6 border-t border-line pt-5">
              <h3 className="mb-4 text-[12px] font-bold uppercase tracking-[0.1em] text-mute">Archived packages · {archived.length}</h3>
              {archived.length ? (
                <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2 xl:grid-cols-3">{archived.map(renderCard)}</div>
              ) : <p className="text-[12.5px] text-mute">No archived credit packages.</p>}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
