/**
 * The one branded email this app sends. Plain inline-styled HTML (no
 * templating dependency — every interpolated value goes through
 * escapeHtml()), using this app's own "Clay & Rust" tokens directly rather
 * than importing FitDeskApp's shared layout() (D-B: reuse by copying
 * conventions, not by importing across repos — and this is one email, not
 * a shared system worth porting whole).
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const INK = "#1b1512";
const PAPER = "#f7f2ea";
const ACCENT = "#bf3b15";
const HI = "#f2c14e";
const MUTE = "#6f6259";
const LINE = "#e4dacb";

export function gymOwnerInviteEmail({
  gymName,
  ownerFirstName,
  confirmationUrl,
}: {
  gymName: string;
  ownerFirstName: string;
  confirmationUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `You've been invited to run ${gymName} on MyFitDesk`;
  const safeGym = escapeHtml(gymName);
  const safeName = escapeHtml(ownerFirstName);
  const safeUrl = escapeHtml(confirmationUrl);

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="only light" />
  </head>
  <body style="margin:0;padding:0;background:${PAPER};font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:${PAPER};border:1.5px solid ${INK};">
            <tr>
              <td style="background:${INK};padding:28px 28px;">
                <div style="font-size:11px;font-weight:bold;letter-spacing:0.14em;text-transform:uppercase;color:${HI};">MyFitDesk · Platform</div>
                <div style="margin-top:10px;font-size:22px;font-weight:900;color:${PAPER};">You're invited to run ${safeGym}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">Hi ${safeName || "there"},</p>
                <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">
                  The MyFitDesk team has set up <strong>${safeGym}</strong> on the platform and is inviting you to
                  become its owner. Follow the link below to confirm your email and choose a password — nobody
                  else, including MyFitDesk staff, knows or sets this password for you.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
                  <tr>
                    <td style="background:${ACCENT};">
                      <a href="${safeUrl}" style="display:inline-block;padding:13px 26px;font-size:13px;font-weight:bold;letter-spacing:0.05em;text-transform:uppercase;color:${PAPER};text-decoration:none;">
                        Accept invitation &amp; set password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;font-size:11.5px;line-height:1.6;color:${MUTE};">
                  This link expires soon — if it no longer works, ask MyFitDesk to resend it. If you weren't
                  expecting this, you can ignore this email.
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid ${LINE};padding:16px 28px;font-size:10.5px;color:${MUTE};">
                MyFitDesk Platform &middot; this is a transactional message, no unsubscribe required
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${ownerFirstName || "there"},\n\nThe MyFitDesk team has set up ${gymName} on the platform and is inviting you to become its owner.\n\nFollow the link below to confirm your email and choose a password:\n${confirmationUrl}\n\nThis link expires soon. If you weren't expecting this, you can ignore this email.`;

  return { subject, html, text };
}
