"use client";

/**
 * One shared, process-wide refresh scheduler for every realtime listener in
 * the admin app (the Gym Details channel and the directory-level channel).
 *
 * Why it exists: every realtime message means "some server-rendered data is
 * stale", and the cure is `router.refresh()` — which re-runs the current
 * route's Server Components. Ten rapid events (a bulk import, a webhook burst)
 * must cost ONE refresh, and two channels reporting the same change (an
 * organization_subscriptions update lands on both the gym topic and the
 * directory topic) must not each trigger their own. A module-level scheduler
 * gives both for free, without a provider.
 *
 * - Trailing debounce (DEBOUNCE_MS): waits for a burst to settle.
 * - Max wait (MAX_WAIT_MS): a continuous stream still refreshes periodically
 *   instead of starving forever.
 * - Min interval (MIN_INTERVAL_MS): back-to-back refreshes are spaced out, so
 *   a refresh that itself causes writes can never spin into a loop.
 * - Hidden tab: nothing is fetched while the tab is in the background; one
 *   refresh runs when it becomes visible again. An idle admin costs zero
 *   requests, and the returning admin sees current data.
 */

const DEBOUNCE_MS = 700;
const MAX_WAIT_MS = 3_000;
const MIN_INTERVAL_MS = 1_500;

type Refreshable = { refresh: () => void };

const targets = new Set<Refreshable>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
let lastRunAt = 0;
let dirtyWhileHidden = false;
let visibilityBound = false;

function clearTimers() {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (maxWaitTimer) clearTimeout(maxWaitTimer);
  debounceTimer = null;
  maxWaitTimer = null;
}

function flush() {
  clearTimers();
  if (!targets.size) return;

  if (typeof document !== "undefined" && document.hidden) {
    dirtyWhileHidden = true;
    return;
  }

  const sinceLast = Date.now() - lastRunAt;
  if (sinceLast < MIN_INTERVAL_MS) {
    debounceTimer = setTimeout(flush, MIN_INTERVAL_MS - sinceLast);
    return;
  }

  lastRunAt = Date.now();
  const pending = [...targets];
  targets.clear();
  pending.forEach(target => target.refresh());
}

function bindVisibility() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && dirtyWhileHidden) {
      dirtyWhileHidden = false;
      flush();
    }
  });
}

/** Ask for a (coalesced) `router.refresh()`. Safe to call as often as you like. */
export function requestRefresh(target: Refreshable) {
  bindVisibility();
  targets.add(target);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flush, DEBOUNCE_MS);
  if (!maxWaitTimer) maxWaitTimer = setTimeout(flush, MAX_WAIT_MS);
}

/** A targeted view may unmount before a queued refresh runs. */
export function cancelRefresh(target: Refreshable) { targets.delete(target); }
