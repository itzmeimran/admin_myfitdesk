/** Maps a Nodemailer/SMTP failure to a message safe to show an admin — never
 * a raw SMTP response, which can echo back credentials-adjacent detail. */
export function describeEmailError(err: unknown): string {
  const code = hasStringProp(err, "code") ? err.code : undefined;
  switch (code) {
    case "EAUTH":
      return "Email sending isn't configured correctly on the server.";
    case "ECONNECTION":
    case "ETIMEDOUT":
    case "ESOCKET":
    case "EDNS":
      return "Couldn't reach the email server. Try again shortly.";
    case "EENVELOPE":
      return "That email address couldn't be delivered to.";
  }
  return "Couldn't send this email right now.";
}

function hasStringProp<K extends string>(value: unknown, key: K): value is Record<K, string> {
  return typeof value === "object" && value !== null && key in value && typeof (value as Record<K, unknown>)[key] === "string";
}
