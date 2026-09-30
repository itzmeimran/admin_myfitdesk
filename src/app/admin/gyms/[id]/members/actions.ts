"use server";

import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { resolveMemberAvatarUrls } from "@/core/storage/member-avatar";
import { getGymMemberDetail, getMemberAvatarKeys, type MemberDetail } from "@/features/gyms/members";

const idSchema = z.string().uuid();

export type MemberDetailWithAvatar = MemberDetail & { avatarUrl: string | null };

export async function loadMemberDetail(
  organizationId: string,
  memberId: string,
): Promise<{ data: MemberDetailWithAvatar | null; error: string | null }> {
  const parsedOrganizationId = idSchema.safeParse(organizationId);
  const parsedMemberId = idSchema.safeParse(memberId);
  if (!parsedOrganizationId.success || !parsedMemberId.success) {
    return { data: null, error: "Unable to load member details." };
  }

  try {
    const supabase = await createClient();
    // The photo is best-effort: it must never block or fail the detail load.
    const [detail, avatarKeys] = await Promise.all([
      getGymMemberDetail(supabase, parsedOrganizationId.data, parsedMemberId.data),
      getMemberAvatarKeys(supabase, parsedOrganizationId.data, [parsedMemberId.data]),
    ]);
    const avatars = await resolveMemberAvatarUrls(supabase, parsedOrganizationId.data, avatarKeys);
    return { data: { ...detail, avatarUrl: avatars[parsedMemberId.data] ?? null }, error: null };
  } catch (error) {
    // Keep PostgREST/schema details in server logs, never in the admin UI.
    console.error("Platform admin member detail read failed", error);
    return { data: null, error: "Unable to load member details. Retry." };
  }
}
