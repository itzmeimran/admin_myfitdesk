import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { checkPermission } from "@/core/auth/access";
import { toCsvText } from "@/core/csv-text";

/**
 * POST /admin/gyms/[id]/export — one gym's dataset as CSV.
 *
 * Route handlers sit outside the /admin layout's gate, so authorization is
 * NOT assumed here: `admin_export_gym_dataset` re-checks
 * `app.is_platform_admin()` itself, refuses datasets over 20,000 rows,
 * requires a reason and writes the audit-log row. POST (never GET) because
 * the request has a side effect — the audit entry.
 */
const bodySchema = z.object({
  dataset: z.enum(["members", "memberships", "payments", "expenses", "inventory", "whatsapp"]),
  reason: z.string().trim().min(3, "Enter a reason (at least 3 characters).").max(500),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const allowed = await checkPermission("gyms.manage");
  if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: 403 });
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid gym." }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_export_gym_dataset", {
    p_organization_id: id,
    p_dataset: parsed.data.dataset,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const status = /not authorized/i.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  const result = data as { columns: string[]; rows: unknown[][] };
  return new NextResponse(toCsvText(result.columns, result.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${parsed.data.dataset}.csv"`,
      "cache-control": "no-store",
    },
  });
}
