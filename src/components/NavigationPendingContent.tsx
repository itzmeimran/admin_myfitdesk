"use client";

import type { ReactNode } from "react";
import { useNavigationPending } from "./NavigationPending";

/** Same-route query changes do not remount Next's route loading boundary.
 * Keep controls in place while their result area shows its shared skeleton. */
export function NavigationPendingContent({ pathname, fallback, children }: { pathname: string; fallback: ReactNode; children: ReactNode }) {
  const { pending, pendingHref } = useNavigationPending();
  return pending && pendingHref?.split(/[?#]/, 1)[0] === pathname ? fallback : children;
}
