import { redirect } from "next/navigation";

/**
 * /admin/plans was the general Plans catalogue (arbitrary plans × billing
 * cycles × dated offers). It has been folded into /admin/packages, which
 * manages every package this product sells, each on up to four terms.
 * Kept as a redirect so bookmarks and the Overview screen's older links
 * still land somewhere useful.
 */
export default function PlansPage() {
  redirect("/admin/packages");
}
