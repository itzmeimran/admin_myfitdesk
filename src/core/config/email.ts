import "server-only";

/**
 * Optional Nodemailer-over-Resend-SMTP config for the one email this app
 * sends — the gym owner invitation (see src/core/email/). Deliberately kept
 * out of core/config/server.ts's fail-closed schema: that file's contract is
 * "the app cannot boot without these," which is right for the Supabase
 * secret keys but wrong here — an admin panel that can't create a gym
 * because nobody set up SMTP yet is a worse failure than one that creates
 * the gym and tells the admin to copy a link manually (see
 * inviteGymOwner()'s fallback). Mirrors FitDeskApp's own
 * src/features/email/transporter.ts `isEmailConfigured()` pattern exactly —
 * same three required vars, same graceful-degrade posture — copied rather
 * than imported per this repo's D-B (separate app/repo, reuse by copying).
 */
export const emailEnv = {
  RESEND_SMTP_HOST: process.env.RESEND_SMTP_HOST,
  RESEND_SMTP_PORT: process.env.RESEND_SMTP_PORT ? Number(process.env.RESEND_SMTP_PORT) : undefined,
  RESEND_SMTP_USER: process.env.RESEND_SMTP_USER,
  RESEND_SMTP_PASSWORD: process.env.RESEND_SMTP_PASSWORD,
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
  /** Where an invited gym owner's link should land — the tenant-facing
   * FitDeskApp deployment, never this admin app (D-B: this repo has no
   * gym-owner-facing screens). Defaults to the known production origin so a
   * deployment that forgets to set this still sends a working link. */
  MYFITDESK_ORIGIN: process.env.MYFITDESK_ORIGIN || "https://myfitdesk.vercel.app",
};

export function isEmailConfigured(): boolean {
  return Boolean(emailEnv.RESEND_SMTP_HOST && emailEnv.RESEND_SMTP_USER && emailEnv.RESEND_SMTP_PASSWORD);
}
