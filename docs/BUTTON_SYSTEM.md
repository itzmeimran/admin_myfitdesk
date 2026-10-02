# Shared buttons

All native actions use `src/components/Button.tsx`. Navigation actions use `ButtonLink.tsx`, which keeps Next.js link behavior and shares the same styles. `SubmitButton` and `AsyncButton` delegate to `Button` for form and imperative loading states. The ESLint rule prevents native `<button>` elements outside the primitive.

```tsx
import { Button } from "@/components/Button";
import { ButtonLink } from "@/components/ButtonLink";
import { ConfirmIcon, CancelIcon } from "@/core/ui/icons";

<Button variant="primary" icon={ConfirmIcon} pending={saving} pendingLabel="Saving…" onClick={save}>Save</Button>
<Button variant="secondary" icon={CancelIcon} onClick={close}>Cancel</Button>
<ButtonLink href="/admin/gyms" variant="secondary">View gyms</ButtonLink>
```

Use existing semantic Lucide aliases from `core/ui/icons`; the migration preserves the icons already associated with each action. `icon` places a consistently sized icon before the label. `iconOnly` provides square sizing and requires an accessible `aria-label`.

| Variant | Purpose |
| --- | --- |
| `primary` | Main action; ink fill, highlight on hover |
| `secondary` (default) | Outlined supporting action |
| `danger` | Filled destructive confirmation |
| `danger-secondary` | Outlined destructive action |
| `ghost` | Quiet toolbar or dismiss action |
| `link` | Inline text action |
| `control` | Navigation and composite widget triggers |
| `surface` | Rich selectable rows or cards |
| `overlay` | Full-screen dismiss backdrops |

Sizes `xs`, `sm`, `md` (default), and `lg` have minimum heights of 28, 36, 40, and 44px. Icon-only buttons use the same square dimensions. `custom` leaves geometry to a composite widget; it is the default for `link`, `control`, `surface`, and `overlay`. Shared action text keeps the app's readability floor of 12px, or 13px on mobile.

`selected` supplies a filled selected state for secondary buttons. Preserve semantic `aria-pressed` for toggles or `aria-current` for active navigation. `tone="inverse"` supports ghost buttons on dark backgrounds; `tone="danger"` marks destructive text actions. Keep `className` for layout such as `w-full`, margins, or flex sizing. Composite widgets may retain their existing selection geometry and responsive styling; ordinary actions should use variants instead of copying appearance classes.

Buttons default to `type="button"`. Use `type="submit"` explicitly or `SubmitButton` inside a form action. Native refs, events, form associations, names, values, and ARIA props pass through. `pending` disables the action, announces `aria-busy`, and shows one spinner; `pendingLabel` is optional. Disabled links block clicks and leave the tab order. `AsyncButton` guards duplicate calls synchronously.

Hover and press animations, color transitions, keyboard focus, and disabled states live in `src/app/globals.css`. Motion respects `prefers-reduced-motion`. Overlay and composite widgets keep stationary geometry. The root global error component retains its inline fallback appearance because global CSS can fail alongside the root layout.

Run `npm run test:buttons`, `npm run typecheck`, and `npm run lint`. The tests check native semantics, icon/loading rendering, disabled link behavior, form pending state, and async duplicate prevention. A source audit during migration also compared every replaced button's original event, form, and accessibility wiring.
