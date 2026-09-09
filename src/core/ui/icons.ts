"use client";

/**
 * The application's single icon vocabulary.
 *
 * Every icon in the app comes from **one** react-icons family — Lucide
 * (`react-icons/lu`) — same choice FitDeskApp makes and for the same reason:
 * its 24px stroke geometry matches the "Clay & Rust" design's thin-line,
 * squared-off look. Do not import from `react-icons/fa`, `/md`, `/bs` etc.
 * anywhere else. If a concept is missing, add an alias here rather than
 * importing a one-off icon at the call site.
 *
 * Aliases are named for the *action or destination*, never for the picture,
 * matching this design's own fixed icon↔action vocabulary spec section (a
 * given action never changes glyph across the app).
 *
 * **Why "use client":** the shared button primitives (`SubmitButton`,
 * `AsyncButton`, `ButtonLabel`) are Client Components that take the icon as
 * an `icon={SomeIcon}` prop, and several call sites passing that prop are
 * Server Components (the admin pages themselves). React refuses to
 * serialize a plain function across that boundary — "Functions cannot be
 * passed directly to Client Components" — at *request time only*: `tsc`,
 * `eslint` and `next build` are all silent about it. Marking this module
 * "use client" makes every icon a client reference, which is serializable,
 * so one uniform `icon={SomeIcon}` API works from a Server and a Client
 * Component alike. Copied from FitDeskApp/src/core/ui/icons.ts — see that
 * file's docblock for the full explanation.
 *
 * The cost of that directive is that *every* export here becomes a client
 * reference, including non-component ones — which is why `ICON_SIZE` lives
 * in its own plain module, `@/core/ui/icon-size`, rather than here.
 */
export type { IconType } from "react-icons";

export {
  // Nav destinations (fixed pairing per the design's icon vocabulary)
  LuLayoutDashboard as OverviewIcon,
  LuBuilding2 as GymsIcon,
  LuPackage as PackagesIcon,
  LuReceiptIndianRupee as RevenueIcon,
  LuSettings as SettingsIcon,
  LuMenu as MenuIcon,

  // Create / edit / destroy
  LuPlus as AddIcon,
  LuUserPlus as InviteIcon,
  LuPencil as EditIcon,
  LuArchive as ArchiveIcon,
  LuRotateCcw as RestoreIcon,
  LuUserX as RevokeIcon,

  // Confirm / dismiss
  LuCheck as ConfirmIcon,
  LuX as CancelIcon,
  LuLogOut as SignOutIcon,
  LuLogIn as SignInIcon,

  // Data in / out
  LuDownload as ExportIcon,
  LuSearch as SearchIcon,
  LuList as ListIcon,
  LuChevronLeft as PrevPageIcon,
  LuChevronRight as NextPageIcon,
  LuChevronDown as LoadMoreIcon,

  // Attention / status actions
  LuTriangleAlert as AlertIcon,
  LuRotateCw as RetryIcon,
  LuChartColumn as UsageIcon,
  LuMessageCircle as RemindIcon,
  LuPhone as CallIcon,
  LuBell as NudgeIcon,
  LuCalendarPlus as ExtendIcon,
  LuSlidersHorizontal as ManageIcon,
  LuClock as TrialsIcon,
  LuLock as ReadOnlyIcon,

  // Period toggles
  LuCalendar as CalendarIcon,
  LuCalendarRange as CalendarRangeIcon,
  LuCalendarCheck as CalendarCheckIcon,

  // Misc / chrome
  LuLoaderCircle as SpinnerIcon,
  LuArrowLeft as BackIcon,
  LuMonitor as MonitorIcon,
  LuDatabase as DatabaseIcon,
  LuInbox as InboxIcon,
} from "react-icons/lu";
