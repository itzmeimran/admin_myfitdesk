/**
 * Who did what to a member, as shown in the Members tab. The tenant schema has
 * no `created_by` on members, so "added by" comes from the audit trail:
 * the member's own INSERT row when one exists, otherwise the actor of their
 * first membership (flagged `inferred`, because members created before the
 * members audit trigger started on 2026-09-30 have no row of their own).
 * Payments carry `recorded_by` directly.
 *
 * No `server-only` import so list and drawer components can share the labels.
 */

export type ActorSource = "record" | "first_membership";

export type MemberActor = {
  /** Resolved staff name, or null when the user no longer maps to a staff row. */
  name: string | null;
  /** owner | staff | trainer */
  role: string | null;
  /** true when the action was attributed to a user id at all. */
  known: boolean;
  /** For "added by" only: where the attribution came from. */
  source: ActorSource | null;
};

export type MemberActors = {
  addedBy: MemberActor;
  /** Recorder of the member's most recent payment (known=false: system / online). */
  lastPaymentRecordedBy: MemberActor;
};

export type ActorLabel = {
  /** Person, or a plain explanation when there is no person. */
  text: string;
  /** "Owner" / "Staff" / "Trainer", when a person was resolved. */
  role: string | null;
  /** True when the attribution is inferred rather than recorded directly. */
  inferred: boolean;
  /** False when nothing is known, so the UI can render it as muted. */
  attributed: boolean;
};

const ROLE_LABEL: Record<string, string> = { owner: "Owner", staff: "Staff", trainer: "Trainer" };

/** `none` is what to show when no user is attributed at all. */
export function describeActor(actor: MemberActor | null | undefined, none: string): ActorLabel {
  if (!actor || !actor.known) return { text: none, role: null, inferred: false, attributed: false };
  if (!actor.name) return { text: "Former staff member", role: null, inferred: actor.source === "first_membership", attributed: true };
  return {
    text: actor.name,
    role: actor.role ? (ROLE_LABEL[actor.role] ?? actor.role) : null,
    inferred: actor.source === "first_membership",
    attributed: true,
  };
}

export const INFERRED_HINT = "Taken from the member's first membership. No direct record exists for members added before 30 Sep 2026.";
