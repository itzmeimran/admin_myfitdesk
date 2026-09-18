/**
 * Types/constants shared between the server-only query (onboarding.ts,
 * `import "server-only"`) and the Client Component that renders them
 * (owner-invitation-card.tsx). Kept in their own file with no `server-only`
 * import — a Client Component importing a runtime value (not just a type)
 * from a `server-only`-guarded module fails the build outright (confirmed:
 * this split exists because the first draft didn't have it and Turbopack
 * refused to build).
 */

export type OwnerInvitationStatus = "invited" | "email_verified" | "expired" | "active" | "revoked";

export type OwnerInvitation = {
  id: string;
  email: string;
  status: "pending" | "accepted" | "revoked";
  effectiveStatus: OwnerInvitationStatus;
  invitedFirstName: string | null;
  invitedLastName: string | null;
  invitedPhone: string | null;
  invitedAt: string;
  expiresAt: string;
  emailVerifiedAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  resendCount: number;
  lastResentAt: string | null;
};

export const OWNER_INVITATION_STATUS_LABEL: Record<OwnerInvitationStatus, string> = {
  invited: "Invitation sent",
  email_verified: "Email verified",
  expired: "Invitation expired",
  active: "Account active",
  revoked: "Invitation revoked",
};
