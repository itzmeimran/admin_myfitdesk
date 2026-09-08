/**
 * Mock data for the Packages catalogue — copied field-for-field from the
 * design canvas's `PACKAGES_M` / `PACKAGES_Y` / `FORM_FIELDS` (design-audit.md's
 * Packages section). Two fields the audit's `<script>` dump elided with
 * `desc: "..."` (each card's one-line description) are not literally
 * recoverable from that transcript — the Growth tier's is inferable
 * verbatim from FORM_FIELDS' own "Description" sample value, whose caps
 * (3 branches / 500 members / 8 staff) match Growth's exactly; the others
 * are written to match the same voice and are flagged inline below rather
 * than silently presented as extracted design copy.
 *
 * TODO(real-data): platform_packages is the real table (design-audit.md's
 * Data mapping section) — gyms/mrr/share per tier come from
 * organization_subscriptions joined to platform_packages, summed and
 * normalised (yearly ÷ 12), excluding trialing/cancelled rows.
 */

export type PackageCap = { k: string; v: string };
export type PackageState = "Active" | "Archived";

export type Package = {
  name: string;
  code: string;
  price: string;
  per: string;
  desc: string;
  state: PackageState;
  gyms: string;
  mrr: string;
  share: string;
  caps: PackageCap[];
  featured?: boolean;
  secondary: "Archive" | "Restore";
};

export const PACKAGES_M: Package[] = [
  {
    name: "Starter",
    code: "starter_monthly",
    price: "₹449",
    per: "/ month",
    desc: "For a single-location gym just getting started.", // inferred, see docblock
    state: "Active",
    gyms: "61",
    mrr: "₹27,389",
    share: "36%",
    caps: [
      { k: "Branches", v: "1" },
      { k: "Members", v: "300" },
      { k: "Staff logins", v: "3" },
    ],
    secondary: "Archive",
  },
  {
    name: "Growth",
    code: "growth_monthly",
    price: "₹649",
    per: "/ month",
    desc: "For a two-location gym with a small team.", // verbatim, matches FORM_FIELDS sample
    state: "Active",
    gyms: "44",
    mrr: "₹28,556",
    share: "38%",
    caps: [
      { k: "Branches", v: "3" },
      { k: "Members", v: "500" },
      { k: "Staff logins", v: "8" },
    ],
    featured: true,
    secondary: "Archive",
  },
  {
    name: "Pro",
    code: "pro_monthly",
    price: "₹849",
    per: "/ month",
    desc: "For a multi-location gym with no caps to manage.", // inferred, see docblock
    state: "Active",
    gyms: "23",
    mrr: "₹19,527",
    share: "26%",
    caps: [
      { k: "Branches", v: "Unlimited" },
      { k: "Members", v: "Unlimited" },
      { k: "Staff logins", v: "Unlimited" },
    ],
    secondary: "Archive",
  },
];

export const PACKAGES_Y: Package[] = [
  {
    name: "Starter",
    code: "starter_yearly",
    price: "₹4,490",
    per: "/ year",
    desc: "For a single-location gym just getting started.",
    state: "Active",
    gyms: "9",
    mrr: "₹3,367",
    share: "18%",
    caps: [
      { k: "Branches", v: "1" },
      { k: "Members", v: "300" },
      { k: "Staff logins", v: "3" },
    ],
    secondary: "Archive",
  },
  {
    name: "Growth",
    code: "growth_yearly",
    price: "₹6,490",
    per: "/ year",
    desc: "For a two-location gym with a small team.",
    state: "Active",
    gyms: "14",
    mrr: "₹7,572",
    share: "40%",
    caps: [
      { k: "Branches", v: "3" },
      { k: "Members", v: "500" },
      { k: "Staff logins", v: "8" },
    ],
    featured: true,
    secondary: "Archive",
  },
  {
    name: "Pro",
    code: "pro_yearly",
    price: "₹8,490",
    per: "/ year",
    desc: "For a multi-location gym with no caps to manage.",
    state: "Active",
    gyms: "11",
    mrr: "₹7,782",
    share: "42%",
    caps: [
      { k: "Branches", v: "Unlimited" },
      { k: "Members", v: "Unlimited" },
      { k: "Staff logins", v: "Unlimited" },
    ],
    secondary: "Archive",
  },
  {
    name: "Pro annual (legacy)",
    code: "pro_yearly_legacy",
    price: "₹5,990",
    per: "/ year",
    desc: "Grandfathered pricing — no longer sold.", // inferred, see docblock
    state: "Archived",
    gyms: "2",
    mrr: "₹998",
    share: "5%",
    caps: [
      { k: "Branches", v: "Unlimited" },
      { k: "Members", v: "Unlimited" },
      { k: "Staff logins", v: "Unlimited" },
    ],
    secondary: "Restore",
  },
];

export async function listPackages(period: "Monthly" | "Yearly"): Promise<Package[]> {
  return period === "Yearly" ? PACKAGES_Y : PACKAGES_M;
}

export type FormField = {
  label: string;
  required: boolean;
  value: string;
  placeholder: string;
  hint: string;
  basis: string;
  /** Not literal to the design (every field renders as `<input
   * type="text">` there — see design-audit.md's Packages section note) —
   * this app uses real input types per the task brief, since a form that
   * demonstrably knows Price is a number shouldn't accept "five hundred". */
  inputType: "text" | "number" | "select" | "textarea";
};

export const FORM_FIELDS: FormField[] = [
  { label: "Display name", required: true, value: "Studio", placeholder: "Shown to gym owners", hint: "platform_packages.name", basis: "220px", inputType: "text" },
  { label: "Code", required: true, value: "studio_monthly", placeholder: "tier_period", hint: "Stable machine name, unique, never reused", basis: "220px", inputType: "text" },
  { label: "Price (₹)", required: true, value: "549", placeholder: "549", hint: "Stored as price_minor — 549 becomes 54900", basis: "150px", inputType: "number" },
  { label: "Billing period", required: true, value: "Monthly", placeholder: "Monthly / Yearly", hint: "Yearly rows are priced at 10× monthly today", basis: "170px", inputType: "select" },
  { label: "Duration (days)", required: true, value: "30", placeholder: "30", hint: "Explicit, so a 3-for-2 offer is just a row", basis: "150px", inputType: "number" },
  { label: "Max branches", required: false, value: "2", placeholder: "Blank = unlimited", hint: "Enforced on branch creation", basis: "150px", inputType: "number" },
  { label: "Max members", required: false, value: "400", placeholder: "Blank = unlimited", hint: "Blocks new members at the cap", basis: "150px", inputType: "number" },
  { label: "Max staff", required: false, value: "5", placeholder: "Blank = unlimited", hint: "Counts staff and trainer logins", basis: "150px", inputType: "number" },
  { label: "Description", required: false, value: "For a two-location gym with a small team.", placeholder: "One sentence", hint: "Shown under the tier name on the owner's Subscription screen", basis: "100%", inputType: "textarea" },
];

export const FEATURE_CHIPS = [
  "Member profiles, search, restore",
  "Plans and renewals",
  "Payment recording",
  "UPI confirmation workflow",
  "Branded receipts",
  "Live dashboard",
  "WhatsApp & SMS reminders",
  "Financial reports + export",
  "Staff and trainer roles",
];
