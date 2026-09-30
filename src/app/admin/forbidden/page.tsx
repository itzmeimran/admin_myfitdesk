import Link from "next/link";
import { getAdminAccess } from "@/core/auth/access";

/**
 * Where a server-side permission guard (core/auth/access.ts requirePermission)
 * sends an admin whose role does not include the section they asked for.
 * Deliberately NOT guarded itself, and it never reveals what exists behind the
 * section — only which role the person holds.
 */
export default async function ForbiddenPage() {
  const access = await getAdminAccess();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 border-[1.5px] border-line bg-paper px-6 py-12 text-center">
      <div
        aria-hidden="true"
        className="flex h-11 w-11 items-center justify-center border-[1.5px] border-accent bg-accent/8 text-[20px] font-bold text-accent"
      >
        !
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[19px] tracking-[-0.015em]">You don&apos;t have access to that section</h1>
        <p className="text-[12.5px] leading-relaxed text-mute">
          {access
            ? `Your role (${access.roleLabel}) doesn't include it. Ask a Platform Owner if you need it.`
            : "Your account isn't an active platform admin on this environment."}
        </p>
      </div>
      <Link
        href="/admin"
        className="press-scale border-[1.5px] border-line px-3.5 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink hover:border-ink"
      >
        Back to overview
      </Link>
    </div>
  );
}
