// Copied from FitDeskApp/src/components/NavigationPending.tsx (D-B).
// Difference: PendingLink keeps Next's default prefetch behaviour.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";

/**
 * One shared "a navigation is in flight" signal for the whole admin app.
 *
 * Why this exists: a lot of navigation here only changes `?searchParams` on the
 * same route (Operations sections, gym tabs' filters, pagers), which never
 * re-mounts the route segment, so the route's `loading.tsx` never shows — and
 * the admin layout reads cookies/RPCs, which blocks navigation instead of
 * falling back. The result was a click that did nothing visible for a moment,
 * then an abrupt swap.
 *
 * A `useTransition` around `router.push` flips `pending` the instant the click
 * happens, entirely client-side. This lifts it to one provider so every
 * trigger shares it: a thin progress bar shows for any admin navigation, and
 * screens can read `pendingHref` to render their own pending state.
 */

type NavigateOptions = { scroll?: boolean };

type NavigationPendingValue = {
  pending: boolean;
  /** The href the in-flight navigation is heading to, or null when idle. */
  pendingHref: string | null;
  navigate: (href: string, options?: NavigateOptions) => void;
};

const NavigationPendingContext = createContext<NavigationPendingValue | null>(null);

export function NavigationPendingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);

  const navigate = useCallback(
    (href: string, options?: NavigateOptions) => {
      setTarget(href);
      startTransition(() => {
        router.push(href, { scroll: options?.scroll ?? true });
      });
    },
    [router],
  );

  const value = useMemo<NavigationPendingValue>(
    () => ({ pending, pendingHref: pending ? target : null, navigate }),
    [pending, target, navigate],
  );

  return (
    <NavigationPendingContext.Provider value={value}>
      <NavigationProgressBar pending={pending} />
      {children}
    </NavigationPendingContext.Provider>
  );
}

/**
 * Reads the shared pending state. Falls back to a local transition when
 * rendered outside the provider, so a component reused somewhere without it
 * still navigates correctly (just without the shared progress bar).
 */
export function useNavigationPending(): NavigationPendingValue {
  const shared = useContext(NavigationPendingContext);
  const router = useRouter();
  const [localPending, startLocal] = useTransition();
  const [localTarget, setLocalTarget] = useState<string | null>(null);

  const localNavigate = useCallback(
    (href: string, options?: NavigateOptions) => {
      setLocalTarget(href);
      startLocal(() => {
        router.push(href, { scroll: options?.scroll ?? true });
      });
    },
    [router],
  );

  if (shared) return shared;
  return { pending: localPending, pendingHref: localPending ? localTarget : null, navigate: localNavigate };
}

/**
 * A `<Link>` whose plain left-click goes through the shared transition, so it
 * lights up the progress bar and lets screens react to it. Every other kind of
 * click — cmd/ctrl/shift/alt, middle-click, `target="_blank"` — is left to the
 * browser, so "open in new tab" keeps working exactly as a normal link.
 */
export function PendingLink({
  href,
  onClick,
  scroll,
  target,
  ...rest
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { navigate } = useNavigationPending();

  return (
    <Link
      href={href}
      target={target}
      scroll={scroll}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          (target && target !== "_self")
        ) {
          return;
        }
        e.preventDefault();
        navigate(href, { scroll: scroll ?? true });
      }}
    />
  );
}

function NavigationProgressBar({ pending }: { pending: boolean }) {
  return (
    <>
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden transition-opacity duration-200 ${
          pending ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="nav-progress-bar h-full w-2/5 bg-accent" />
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? "Loading" : ""}
      </span>
    </>
  );
}
