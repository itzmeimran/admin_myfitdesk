"use server";

import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { getGymMemberDetail, type MemberDetail } from "@/features/gyms/members";

const idSchema = z.string().uuid();

export async function loadMemberDetail(
  organizationId: string,
  memberId: string,
): Promise<{ data: MemberDetail | null; error: string | null }> {
  const parsedOrganizationId = idSchema.safeParse(organizationId);
  const parsedMemberId = idSchema.safeParse(memberId);
  if (!parsedOrganizationId.success || !parsedMemberId.success) {
    return { data: null, error: "Unable to load member details." };
  }

  try {
    const supabase = await createClient();
    const data = await getGymMemberDetail(supabase, parsedOrganizationId.data, parsedMemberId.data);
    return { data, error: null };
  } catch (error) {
    // Keep PostgREST/schema details in server logs, never in the admin UI.
    console.error("Platform admin member detail read failed", error);
    return { data: null, error: "Unable to load member details. Retry." };
  }
}
