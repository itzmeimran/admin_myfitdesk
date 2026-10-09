"use server";

import { z } from "zod";
import { checkPermission } from "@/core/auth/access";
import { createClient } from "@/core/db/server-client";
import { getTimeline, type TimelineFilters } from "@/features/gyms/ops/queries";

const filtersSchema = z.object({
  search: z.string().max(200).optional(),
  actorSearch: z.string().max(200).optional(),
  category: z.string().max(40).optional(),
  actorType: z.string().max(40).optional(),
  status: z.string().max(20).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

/** Read one member's original events under exactly the feed's filters. Each
 * page is bounded; a long member history cannot inflate the initial RSC payload. */
export async function loadActivityGroup(organizationId: string, memberId: string, filters: TimelineFilters, offset: number) {
  const allowed = await checkPermission("gyms.view");
  if (!allowed.ok) return { data: null, error: allowed.error };
  const parsed = filtersSchema.safeParse(filters);
  if (!z.string().uuid().safeParse(organizationId).success || !z.string().uuid().safeParse(memberId).success || !parsed.success || !Number.isInteger(offset) || offset < 0 || offset > 2_147_483_647) {
    return { data: null, error: "Invalid activity filters." };
  }
  try {
    const client = await createClient();
    const data = await getTimeline(client, organizationId, { ...parsed.data, sortDir: "desc" }, 25, offset, { memberId });
    return { data, error: null };
  } catch {
    return { data: null, error: "Unable to load this member's activities. Retry." };
  }
}
