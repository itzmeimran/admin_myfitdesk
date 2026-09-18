import "server-only";
import { emailEnv } from "@/core/config/email";
import { getTransporter } from "./transporter";
import { describeEmailError } from "./errors";

export type SendSystemEmailResult = { ok: true } | { ok: false; error: string };

/** The one email this app sends — a gym owner invitation, before that
 * owner has any account at all, so (mirroring FitDeskApp's own
 * sendSystemEmail()) there is no per-org log table to write this against. */
export async function sendSystemEmail(input: { to: string; subject: string; html: string; text: string }): Promise<SendSystemEmailResult> {
  try {
    const transporter = getTransporter();
    const fromName = emailEnv.EMAIL_FROM_NAME || "MyFitDesk";
    const fromAddress = emailEnv.EMAIL_FROM || "no-reply@myfitdesk.app";
    await transporter.sendMail({
      from: `${fromName} <${fromAddress}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeEmailError(err) };
  }
}
