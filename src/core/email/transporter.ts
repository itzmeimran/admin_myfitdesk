import "server-only";
import nodemailer from "nodemailer";
import { emailEnv, isEmailConfigured } from "@/core/config/email";

let cachedTransporter: nodemailer.Transporter | null = null;

/** One Nodemailer transporter for the process's lifetime — same reasoning
 * as FitDeskApp's own core/email/transporter.ts (reuse the SMTP connection
 * rather than opening one per send; a warm Vercel instance keeps this
 * module-level singleton alive between invocations). */
export function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;
  if (!isEmailConfigured()) {
    throw new Error("Email isn't configured on this server yet.");
  }

  const port = emailEnv.RESEND_SMTP_PORT ?? 465;
  cachedTransporter = nodemailer.createTransport({
    host: emailEnv.RESEND_SMTP_HOST,
    port,
    // 465 is implicit TLS; every other Resend-documented port is STARTTLS.
    secure: port === 465,
    auth: { user: emailEnv.RESEND_SMTP_USER, pass: emailEnv.RESEND_SMTP_PASSWORD },
  });
  return cachedTransporter;
}
