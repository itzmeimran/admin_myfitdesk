"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Dropdown } from '@/components/Dropdown';
import { ButtonLink } from "@/components/ButtonLink";
import { AddIcon, CancelIcon, LinkIcon, NextPageIcon, PrevPageIcon } from "@/core/ui/icons";
import { WINDOW_LABEL, initials, windowState } from "./model";
import type { Conversation, TeamMember } from "./types";

type Props = {
  conversation: Conversation;
  team: TeamMember[];
  /** Open straight into the "create lead" form (from the ⋯ menu). */
  startCreating: boolean;
  onClose: () => void;
  onAssign: (assigneeId: string | null) => void;
  onNote: (note: string, version: number) => Promise<boolean>;
  onCreateLead: (input: { contactName: string; gymName: string }) => Promise<boolean>;
  canManage: boolean;
  canCreateLead: boolean;
  pending: boolean;
};

const FIELD = "min-h-9 border-[1.5px] border-line bg-[#fbf8f3] px-2.5 text-[13px] text-ink outline-none transition-colors focus:border-ink";

/** Right pane: who the contact is, whether they're in the Sales CRM, who owns
 * the conversation, and a private team note. Mount with `key={conversation.id}`
 * so the create-lead draft doesn't leak between conversations. */
export function ContactPanel({ conversation: c, team, startCreating, onClose, onAssign, onNote, onCreateLead, canManage, canCreateLead, pending }: Props) {
  const [creating, setCreating] = useState(startCreating);
  const [leadName, setLeadName] = useState(c.name ?? c.profileName ?? "");
  const [leadGym, setLeadGym] = useState("");
  const [note, setNote] = useState(c.note);
  const [base, setBase] = useState({ note: c.note, version: c.noteVersion ?? 0 });
  const [previous, setPrevious] = useState({ note: c.note, version: c.noteVersion ?? 0 });
  const [noteState, setNoteState] = useState('');
  const saving = useRef(false);
  if (previous.version !== c.noteVersion) {
    setPrevious({ note: c.note, version: c.noteVersion ?? 0 });
    if (note === base.note || note === c.note) { setNote(c.note); setBase({ note: c.note, version: c.noteVersion ?? 0 }); }
  }
  const saveNote = () => {
      if (!canManage || saving.current || note === base.note) return;
      saving.current = true; setNoteState('Awaiting confirmation…');
      void onNote(note, base.version).then(ok => {
        if (ok) { setBase({ note, version: base.version + 1 }); setNoteState('Saved'); }
        else setNoteState('Draft not saved. Your changes are preserved.');
      }).finally(() => { saving.current = false; });
  };

  const state = windowState(c);
  const details = [
    { label: "Phone", value: c.phone },
    { label: "First contacted", value: c.first },
    { label: "Last activity", value: /^\d/.test(c.time) ? `Today, ${c.time}` : c.time },
    { label: "Status", value: state === "expired" ? "Open · window expired" : WINDOW_LABEL[state] },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-[62px] flex-shrink-0 items-center gap-2 border-b border-line pl-4 pr-3">
        <Button variant="ghost" size="custom" iconOnly onClick={onClose} aria-label="Back to chat" className="-ml-2.5 h-11 w-10 border-0 lg:hidden">
          <PrevPageIcon size={20} aria-hidden />
        </Button>
        <span className="flex-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-mute">Contact details</span>
        <Button variant="ghost" size="custom" iconOnly onClick={onClose} aria-label="Close details" className="hidden h-8 w-8 border-0 lg:inline-flex">
          <CancelIcon size={15} aria-hidden />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6 pt-[18px]">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 flex-shrink-0 items-center justify-center bg-sand text-[13px] font-bold">{initials(c.name)}</span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{c.name ?? c.phone}</span>
            <span className="text-[12px] text-mute">{c.name ? c.org : "Not in contacts"}</span>
          </div>
        </div>

        {c.crm ? (
          <div className="flex flex-col gap-2.5 border-[1.5px] border-ink p-3">
            <span className="flex items-center gap-[7px] text-[10.5px] font-bold uppercase tracking-[0.12em]">
              <LinkIcon size={13} aria-hidden />Linked to CRM Lead
            </span>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[13.5px] font-bold">{c.crm.lead}</span>
              <span className="bg-sand px-[7px] py-[3px] text-[11px] font-bold">{c.crm.stage}</span>
            </div>
            <ButtonLink href={c.crm.id ? `/admin/sales?lead=${c.crm.id}` : '/admin/sales'} variant="primary" size="sm" className="w-full">
              View lead<NextPageIcon size={13} aria-hidden />
            </ButtonLink>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 border-[1.5px] border-dashed border-[#c9bcab] p-3">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-mute">Not in CRM</span>
            {creating ? (
              <form
                className="flex flex-col gap-2.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await onCreateLead({ contactName: leadName.trim(), gymName: leadGym.trim() })) setCreating(false);
                }}
              >
                <label className="flex flex-col gap-[5px] text-[11px] font-bold text-mute">
                  Contact name
                  <input required maxLength={100} type="text" value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="e.g. Karan Shah" className={FIELD} />
                </label>
                <label className="flex flex-col gap-[5px] text-[11px] font-bold text-mute">
                  Gym name
                  <input required maxLength={160} type="text" value={leadGym} onChange={(e) => setLeadGym(e.target.value)} placeholder="e.g. Shah Fitness Club" className={FIELD} />
                </label>
                <span className="text-[11.5px] leading-snug text-mute2">Stage: New lead · Source: WhatsApp. Nothing is added to the CRM until you confirm.</span>
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" size="sm" disabled={!canCreateLead || pending} pending={pending} className="flex-1">Create lead</Button>
                  <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-2.5">
                <p className="text-[12.5px] leading-normal text-mute">This number doesn&apos;t match any lead.</p>
                <Button variant="secondary" size="sm" icon={AddIcon} disabled={!canCreateLead || pending} onClick={() => setCreating(true)} className="w-full">Create CRM lead</Button>
              </div>
            )}
          </div>
        )}

        <dl className="m-0 flex flex-col">
          {details.map((d) => (
            <div key={d.label} className="flex gap-3 border-b border-sand py-[9px] text-[12.5px]">
              <dt className="flex-[0_0_108px] text-mute2">{d.label}</dt>
              <dd className="m-0 min-w-0 flex-1 font-medium">{d.value}</dd>
            </div>
          ))}
          <div className="flex items-center gap-3 border-b border-sand py-[7px] text-[12.5px]">
            <dt className="flex-[0_0_108px] text-mute2">Assigned to</dt>
            <dd className="m-0 min-w-0 flex-1">
              <Dropdown
                ariaLabel="Assigned to"
                value={c.assigneeId ?? ""}
                onChange={value => onAssign(value || null)}
                disabled={!canManage || pending}
                size="sm"
                options={[{ value: '', label: 'Unassigned' }, ...team.map(t => ({ value: t.id, label: t.name }))]}
              />
            </dd>
          </div>
        </dl>

        <label className="flex flex-col gap-[7px]">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-mute">Notes</span>
          <textarea
            rows={4}
            value={note}
            disabled={!canManage}
            maxLength={5000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Private note for the team"
            className="resize-y border-[1.5px] border-line bg-[#fbf8f3] p-2.5 text-[13px] leading-normal text-ink outline-none transition-colors placeholder:text-faint focus:border-ink"
          />
          <span role="status" className="text-[11px] text-mute2">{noteState}</span>
          <Button variant="primary" size="sm" pending={pending} disabled={!canManage||pending||note===base.note} onClick={saveNote}>Save note</Button>
        </label>
      </div>
    </div>
  );
}
