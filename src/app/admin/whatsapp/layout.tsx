import { requirePermission } from "@/core/auth/access";

/** Server-side section guard for everything under /admin/whatsapp (the inbox
 * and its future sibling pages). `whatsapp.view` is the same permission the
 * credits page uses; a role without it never reaches a page here, whatever URL
 * it types. The nav link being hidden is only a convenience. */
export default async function WhatsAppSectionLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("whatsapp.view");
  return children;
}
