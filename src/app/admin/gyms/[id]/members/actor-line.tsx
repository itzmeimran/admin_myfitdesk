import { describeActor, INFERRED_HINT, type MemberActor } from "@/features/gyms/member-actors";

/**
 * "Added by Priya · Staff" style attribution used across the Members tab.
 * `none` is the wording when no user is attributed (for a payment that is
 * usually an online/system payment, for a member it is "Not recorded").
 * An attribution taken from the member's first membership rather than a direct
 * record gets a dotted underline and a tooltip; `explainInferred` spells it out
 * in text for the drawer, where there is room.
 */
export function ActorLine({
  prefix,
  actor,
  none,
  explainInferred = false,
  large = false,
  className = "",
}: {
  prefix?: string;
  actor: MemberActor | null | undefined;
  none: string;
  explainInferred?: boolean;
  /** 12px instead of 10.5px, for a cell whose main content this is. */
  large?: boolean;
  className?: string;
}) {
  const label = describeActor(actor, none);
  return (
    <span className={`block min-w-0 ${large ? "text-[12px]" : "text-[10.5px]"} ${label.attributed ? "text-mute" : "text-mute3"} ${className}`}>
      {prefix ? <span>{prefix} </span> : null}
      <strong
        className={`font-bold ${label.attributed ? "text-ink2" : "font-normal"} ${label.inferred ? "underline decoration-dotted underline-offset-2" : ""}`}
        title={label.inferred ? INFERRED_HINT : undefined}
      >
        {label.text}
      </strong>
      {label.role ? <span> · {label.role}</span> : null}
      {label.inferred && explainInferred ? <span className="block text-mute3">From their first membership</span> : null}
    </span>
  );
}
