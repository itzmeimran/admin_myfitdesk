import Link from "next/link";
import { BrandLockup } from "@/core/brand/BrandLockup";
import { SubmitButton } from "@/components/SubmitButton";
import { ADMIN_ENVIRONMENT_LABEL, isAdminEnvironment } from "@/core/config/environments";
import { acceptInvitation, continueToSignIn } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Landing page for a platform-admin invitation email. It never does anything
 * on load (see actions.ts: the token is redeemed only by the button press).
 * Three states: an invitation with a one-time token, a plain "sign in to accept"
 * for someone who already has an account, and an expired/invalid message.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const env = first(sp.env);
  const tokenHash = first(sp.token_hash);
  const type = first(sp.type);
  const error = first(sp.error);

  const environment = isAdminEnvironment(env) ? env : null;
  const envLabel = environment ? ADMIN_ENVIRONMENT_LABEL[environment] : null;
  const hasToken = Boolean(tokenHash) && (type === "invite" || type === "recovery");

  let title = "Platform admin invitation";
  let body = "Open the invitation link from your email.";
  let content: React.ReactNode = null;

  if (error) {
    title = "This invitation can't be used";
    body =
      error === "expired"
        ? "The link has expired or was already used. Ask a Platform Owner to resend your invitation."
        : "The link is incomplete or invalid. Ask a Platform Owner to resend your invitation.";
    content = (
      <Link
        href="/login"
        className="press-scale flex w-full items-center justify-center border-[1.5px] border-line py-3 text-[12px] font-bold uppercase tracking-[0.12em] hover:border-ink"
      >
        Go to sign in
      </Link>
    );
  } else if (environment && hasToken) {
    title = "Accept your invitation";
    body = `You've been invited to the ${envLabel} environment of the admin dashboard. Continue to choose your own password.`;
    content = (
      <form action={acceptInvitation} className="flex flex-col gap-3">
        <input type="hidden" name="env" value={environment} />
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <SubmitButton
          pendingLabel="Checking…"
          className="w-full bg-ink py-3.5 text-[12px] font-bold uppercase tracking-[0.14em] text-hi"
        >
          Accept invitation
        </SubmitButton>
      </form>
    );
  } else if (environment) {
    title = `Sign in to ${envLabel}`;
    body = `You've been given access to the ${envLabel} environment. Sign in with your existing account to accept.`;
    content = (
      <form action={continueToSignIn} className="flex flex-col gap-3">
        <input type="hidden" name="env" value={environment} />
        <SubmitButton
          pendingLabel="Opening…"
          className="w-full bg-ink py-3.5 text-[12px] font-bold uppercase tracking-[0.14em] text-hi"
        >
          Continue to sign in
        </SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col overflow-hidden border-[1.5px] border-ink bg-paper">
        <div className="flex flex-col gap-4 bg-ink px-6 py-8 text-paper">
          <BrandLockup />
          <h1 className="font-display text-[24px] leading-[1.05] tracking-[-0.03em]">{title}</h1>
          <p className="text-[12.5px] leading-relaxed text-mute3">{body}</p>
        </div>
        {content ? <div className="p-6">{content}</div> : null}
      </div>
    </div>
  );
}
