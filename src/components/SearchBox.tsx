"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SearchIcon, SpinnerIcon } from "@/core/ui/icons";
import { useNavigationPending } from "./NavigationPending";

const DEBOUNCE_MS = 300;

/**
 * URL-driven search box shared by every server-paginated table in the admin
 * app (Gyms list, and each Gym Detail tab). Writes to the `param` query
 * param (debounced, so every keystroke doesn't trigger a server round trip)
 * and always resets `page` back to 1 — a stale page number past the end of
 * a newly-filtered result set is worse than restarting at page 1.
 *
 * Deliberately not a form/submit button: every other filter on these pages
 * (status, package, sort) is a plain navigation already, so search matches
 * that same "the URL is the state" model rather than introducing a second
 * one.
 */
export function SearchBox({
  param = "q",
  placeholder = "Search",
  className = "",
}: {
  param?: string;
  placeholder?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const urlValue = searchParams.get(param) ?? "";
  const [value, setValue] = useState(urlValue);
  const { pending, pendingHref, navigate } = useNavigationPending();
  const [target, setTarget] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, [query, pendingHref]);

  // Keep the input in sync if the URL changes from elsewhere (e.g. a
  // "Reset filters" link) without this component's own debounce firing —
  // adjusted during render rather than in an effect, same pattern
  // PackageSheet already uses for its useActionState result.
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setValue(urlValue);
  }

  function push(next: string) {
    const params = new URLSearchParams(query);
    if (next.trim()) params.set(param, next.trim());
    else params.delete(param);
    params.delete("page");
    const href = `${pathname}?${params.toString()}`;
    setTarget(href);
    navigate(href, { scroll: false });
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), DEBOUNCE_MS);
  }

  return (
    <label
      className={`flex min-h-[36px] flex-1 items-center gap-2 border-[1.5px] border-line bg-paper px-3 ${className}`}
      style={{ minWidth: 220 }}
    >
      {pending && pendingHref === target ? <SpinnerIcon size={15} className="flex-shrink-0 animate-spin text-mute" aria-hidden /> : <SearchIcon size={15} className="flex-shrink-0 text-mute2" aria-hidden />}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-busy={(pending && pendingHref === target) || undefined}
        className="w-full border-0 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-mute2"
      />
      {pending && pendingHref === target ? <span role="status" className="sr-only">Searching…</span> : null}
    </label>
  );
}
