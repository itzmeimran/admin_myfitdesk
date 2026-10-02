import { IST_TIME_ZONE } from "@/core/dates/ist";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { checkPermission } from "@/core/auth/access";
import { toCsvText } from "@/core/csv-text";
import { zonedDayRange } from "@/core/dates/zoned-range";
import { getGymDetail } from "@/features/gyms/detail";
import { getTimeline } from "@/features/gyms/ops/queries";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  changeHighlights,
  eventSubject,
  eventTitle,
  exactTime,
  fieldChanges,
  roleLabel,
  sourceLabel,
} from "@/features/gyms/ops/timeline-format";

/**
 * POST /admin/gyms/[id]/activity/export — the filtered timeline as CSV.
 * Uses the same RPC and filters as the on-screen feed (so the file matches
 * what the admin sees), human-readable values, capped at 10,000 rows, and the
 * export itself is written to the audit log. The RPC enforces platform-admin
 * authorization; nothing here trusts the caller.
 */
const MAX_ROWS = 10_000;

const bodySchema = z.object({
  search: z.string().max(200).optional(),
  category: z.string().max(40).optional(),
  actorType: z.string().max(40).optional(),
  status: z.string().max(20).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const allowed = await checkPermission("gyms.view");
  if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: 403 });
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid gym." }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters." }, { status: 400 });

  const supabase = await createClient();
  try {
    const gym = await getGymDetail(supabase, id);
    if (!gym) return NextResponse.json({ error: "Gym not found." }, { status: 404 });
    const tz = IST_TIME_ZONE;
    const f = parsed.data;
    const { rows, total } = await getTimeline(
      supabase,
      id,
      {
        search: f.search,
        category: f.category,
        actorType: f.actorType,
        status: f.status,
        from: f.from ? zonedDayRange(f.from, tz)?.start : undefined,
        to: f.to ? zonedDayRange(f.to, tz)?.end : undefined,
        sortDir: f.sortDir,
      },
      MAX_ROWS,
      0,
    );

    const { error: logError } = await supabase.rpc("admin_log_activity_export", {
      p_organization_id: id,
      p_filters: parsed.data,
      p_rows: rows.length,
    });
    if (logError) return NextResponse.json({ error: logError.message }, { status: 403 });

    const headers = ["Time", "Action", "Details", "Changes", "Actor", "Role", "Category", "Status", "Source", "Reference"];
    const body = rows.map((e) => [
      exactTime(e.occurredAt, tz),
      eventTitle(e),
      eventSubject(e, tz),
      fieldChanges(e, tz)
        .changes.map((c) => `${c.label}: ${c.before} → ${c.after}`)
        .join("; ") || changeHighlights(e, tz).join("; "),
      e.actorLabel,
      roleLabel(e.actorRole),
      CATEGORY_LABEL[e.category] ?? e.category,
      STATUS_LABEL[e.status],
      sourceLabel(e.origin),
      e.entityId ?? "",
    ]);

    return new NextResponse(toCsvText(headers, body), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="activity-${gym.gymCode}.csv"`,
        "x-export-truncated": total > rows.length ? "true" : "false",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The export failed.";
    return NextResponse.json({ error: message }, { status: /not authorized/i.test(message) ? 403 : 500 });
  }
}
