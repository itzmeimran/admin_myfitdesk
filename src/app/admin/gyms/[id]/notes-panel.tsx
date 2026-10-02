"use client";

import { Button } from "@/components/Button";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { deleteNote, updateNote } from "@/features/gyms/ops/actions";
import type { NoteRow } from "@/features/gyms/ops/types";
import { AdminNotesForm } from "./admin-notes-form";
import { exactTime } from "@/features/gyms/ops/timeline-format";

/**
 * Private admin notes. Visible only to platform admins (the table has an
 * admin-only SELECT policy and no client write grant). Editing keeps the
 * previous text in the audit log; deleting is a soft delete.
 */
export function NotesPanel({ organizationId, notes, timeZone }: { organizationId: string; notes: NoteRow[]; timeZone: string }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [toDelete, setToDelete] = useState<NoteRow | null>(null);

  function save(note: NoteRow) {
    startTransition(async () => {
      const result = await updateNote({ organizationId, noteId: note.id, content: draft });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Note updated.");
      setEditing(null);
      router.refresh();
    });
  }

  function remove(note: NoteRow) {
    startTransition(async () => {
      const result = await deleteNote({ organizationId, noteId: note.id });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Note deleted.");
      setToDelete(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <AdminNotesForm organizationId={organizationId} />
      {notes.length ? (
        <div className="divide-y divide-line border-[1.5px] border-line bg-paper">
          {notes.map((note) => (
            <article key={note.id} className="flex flex-col gap-1.5 px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-mute3">
                <span>{exactTime(note.createdAt, timeZone)}</span>
                {note.category ? <span className="bg-sand px-1.5 py-0.5 font-bold uppercase tracking-[0.08em] text-ink2">{note.category}</span> : null}
                {note.updatedAt ? <span>· edited {exactTime(note.updatedAt, timeZone)}</span> : null}
                <span className="ml-auto flex gap-3">
                  <Button type="button" onClick={() => { setEditing(note.id); setDraft(note.content); }} variant="link">
                    Edit
                  </Button>
                  <Button tone="danger" type="button" onClick={() => setToDelete(note)} variant="link" size="custom">
                    Delete
                  </Button>
                </span>
              </div>
              {editing === note.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    className="w-full resize-none border-[1.5px] border-line bg-paper px-2.5 py-2 text-[12.5px] outline-none focus:border-ink"
                  />
                  <div className="flex gap-2">
                    <Button type="button" pending={isPending} disabled={!draft.trim()} onClick={() => save(note)} variant="primary" size="sm">
                      Save
                    </Button>
                    <Button type="button" onClick={() => setEditing(null)} variant="secondary" size="sm">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{note.content}</p>
              )}
              <span className="text-[10.5px] text-mute">— {note.createdByEmail ?? "Platform admin"}</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="border-[1.5px] border-line bg-paper px-4 py-8 text-center text-[12.5px] text-mute">No private notes yet.</div>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this note?"
        description="The note disappears from this list. Its text stays in the audit history, so it can be recovered if needed."
        confirmLabel="Delete note"
        danger
        pending={isPending}
        onConfirm={() => toDelete && remove(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
