"use server";

import { z } from "zod";
import { createClient } from "@/core/db/server-client";
import { resolveMemberAvatarUrls } from "@/core/storage/member-avatar";
import { getGymMemberDetail, getMemberActors, getMemberAvatarKeys, getMemberSubscriptionActors, type MemberDetail } from "@/features/gyms/members";
import type { MemberActor } from "@/features/gyms/member-actors";

const idSchema = z.string().uuid();

export type MemberDetailWithAvatar = MemberDetail & {
  avatarUrl: string | null;
  /** Who added the member; null when the attribution read is unavailable. */
  addedBy: MemberActor | null;
  /** subscription id → who assigned that membership. */
  membershipActors: Record<string, MemberActor>;
};

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
    // The photo and the "who did it" attribution are best-effort: neither may
    // block or fail the detail load.
    const [detail, avatarKeys, actors, membershipActors] = await Promise.all([
      getGymMemberDetail(supabase, parsedOrganizationId.data, parsedMemberId.data),
      getMemberAvatarKeys(supabase, parsedOrganizationId.data, [parsedMemberId.data]),
      getMemberActors(supabase, parsedOrganizationId.data, [parsedMemberId.data]),
      getMemberSubscriptionActors(supabase, parsedOrganizationId.data, parsedMemberId.data),
    ]);
    const avatars = await resolveMemberAvatarUrls(supabase, parsedOrganizationId.data, avatarKeys);
    return {
      data: {
        ...detail,
        avatarUrl: avatars[parsedMemberId.data] ?? null,
        addedBy: actors.get(parsedMemberId.data)?.addedBy ?? null,
        membershipActors: Object.fromEntries(membershipActors),
      },
      error: null,
    };
  } catch (error) {
    // Keep PostgREST/schema details in server logs, never in the admin UI.
    console.error("Platform admin member detail read failed", error);
    return { data: null, error: "Unable to load member details. Retry." };
  }
}
