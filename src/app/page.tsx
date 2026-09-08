import { redirect } from "next/navigation";
import { createClient } from "@/core/db/server-client";

/** Copied from FitDeskApp/src/app/page.tsx. Only checks whether *someone*
 * is signed in — whether they're a platform admin is decided by
 * src/app/admin/layout.tsx's fail-closed RPC check, not here. */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/admin" : "/login");
}
