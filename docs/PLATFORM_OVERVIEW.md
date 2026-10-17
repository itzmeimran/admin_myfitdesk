# Compact Platform overview

Implemented 17 October 2026. This change is read-only, scoped to the overview and its supporting components. No financial records, historical SQL migrations or remote migration history were changed.

## Layout and interactions

The header keeps a short IST date and the reusable period selector. Four equal-height cards show Total gyms, Paying gyms, Monthly recurring revenue, and Collections. Member/branch totals sit below. The first three cards are current snapshots; month/quarter/year changes collections only, with a pending spinner and skeletons in the affected areas.

One urgency-ordered follow-up list replaces the old attention tiles and risk table. It includes read-only/overdue/grace issues, trials ending in the next seven IST calendar days, and unresolved latest subscription payment failures from the last 30 days. Retries collapse to one charge issue per gym, later settlements close failures, and overdue/grace states share one subscription issue. Longer lists expand after six entries. Gym IDs are used throughout; names are never join keys.

Actions open the existing gym billing controls with explicit Review trial, Review subscription or Review failed payment labels. No reminder sender exists behind the former disabled Nudge/Remind placeholders, so the page does not claim to send one. Existing write actions retain their own permission checks and confirmations. Navigation links respect resolved gym/revenue/package permissions.

The main desktop grid is approximately two-thirds Collections and one-third Recently added gyms. Collections use daily, weekly or monthly buckets through the current instant, exact paid dates in IST, focus/hover inspection, and an expandable exact-value table. Zero labels are omitted from the chart. Recent gyms cover seven IST calendar days including today, independently of the collection period. Below are Plan breakdown, compact member/branch capacity entries, and a small expandable Billing pipeline panel. Reaching one permitted branch is neutral; only exceeding a limit uses rust warning text. Empty/unlimited usage bars are omitted.

## Financial source audit and calculation policy

The previous headline RPC divided only the literal `yearly` label by 12. The assigned dynamic cycle is labelled `Annual`, so its catalogue price of ₹7,188 was treated as monthly revenue. The separate package-mix RPC used `price × 30 / duration_days`, yielding about ₹590.79 (displayed as ₹591) for the same 365-day catalogue cycle. The old chart was successful cash receipts described as recurring revenue. These incompatible overview calculations are no longer used.

The shared overview model now computes both MRR and plan contributions from the same per-gym result:

- Paying gyms have an assigned paid plan, active/grace access and a current period that has started. Trial, cancelled, read-only and suspended accounts do not contribute MRR.
- Price evidence is exactly one unrefunded succeeded subscription receipt whose gym ID, package ID, period start and period end match the current subscription. Pricing-review receipts and ambiguous duplicates/installments are excluded from reliable MRR. Missing or ambiguous evidence makes the affected plan and total unavailable; current catalogue prices are never substituted.
- The stored receipt amount preserves the actual agreed/discounted price. Calendar cycles normalize by the actual month count, including leap years and IST month-end clamping. ₹7,188 for 12 months is ₹599/month. Non-calendar day-based coverage uses an average Gregorian month (`365.2425 / 12` days), disclosed in the UI.
- Platform billing currently has no customer GST calculation (confirmed against the existing platform invoice implementation). Gateway metadata `fee`/`tax` are provider costs, not subscription tax adjustments; they are not deducted from MRR or collections. Current catalogue offers are not reapplied to historical charges.
- Future renewal setups and queued contracts do not override current coverage. Non-subscription/one-time rows without a package are excluded, and WhatsApp purchases come from separate tables. Mixed currencies are not silently added or converted. Unsafe numeric totals are unavailable.

Collections are gross succeeded/refunded subscription receipts grouped by `paid_at`, with half-open IST period boundaries and future receipts excluded. A refunded receipt remains part of its original gross collection cohort. Recorded partial/full refunds and the cohort's net retained amount are shown separately. Refund processing dates are not retained in this ledger, so the UI explicitly does not describe those refunds as cash refunded during the selected period. Failed/pending receipts are excluded from collections.

## Data access and failure behavior

Existing authenticated admin reads supply the gym directory, subscriptions, packages and platform payments. Reads page explicitly in groups of 500 to avoid PostgREST truncation, while current-price evidence is batched by gym. Selected-period collections and recent payment attempts are filtered in the database. Current receipts are loaded independently of the selected collection period.

The existing webhook RPC omits processing failures from its OK count. The new server-only monitoring wrapper checks `revenue.view` before constructing an elevated client for the selected environment. It returns only three HEAD counts over the last 24 hours: all events, signature failures, and processing failures. Webhook bodies and secrets never reach the view. A verified zero total displays “No webhook events in the last 24 hours”; it is not labelled healthy. Restricted/unavailable monitoring remains unavailable.

Critical snapshot failures use the route retry boundary. Collection/receipt/attempt failures preserve other sections and display an unavailable value or explicit partial-data notice. Missing receipts and missing monitoring are not converted to zero. The page has matching loading, empty, error and unavailable states.

## Verification

- Typecheck and touched-file ESLint.
- Focused overview tests cover normalization, discounts, ambiguity, refund cohorts, mixed currencies, numeric bounds, IST/month-end/leap-year boundaries, period independence, urgency/deduplication, trial eligibility, capacity, recent gym IDs, pagination, privileged monitoring and partial query failures. Existing IST/button/navigation checks also run.
- Browser fixture checks at 1440, 768 and 390 pixels: no page overflow, four/two/stacked metrics, mobile follow-up cards, readable chart dates, exact keyboard inspection, and empty/loading/error/unavailable layouts. Fixtures are removed before delivery.
- Read-only DEV source audit: 2 current gyms, 1 paying gym, 63 members, 2 branches. The current annual receipt is ₹5,319.12 for 12 months, so both headline and plan MRR are ₹443.26. A future ₹599 monthly setup starts after the current annual period and is not substituted. Month/quarter collections are ₹0; year collections and chart total both equal ₹5,319.12. No current follow-ups were eligible; the one reached branch limit is neutral.

Signed-in acceptance on the deployed overview remains a rollout check. Browser fixtures verify the actual components without bypassing the live admin authorization gate. Missing historical current-period price evidence and refund timestamps remain explicit data limitations. Nothing is pushed or deployed by this change.
