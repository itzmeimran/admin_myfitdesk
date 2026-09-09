"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "@/core/ui/icons";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(param) ?? "";
  const [value, setValue] = useState(urlValue);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync if the URL changes from elsewhere (e.g. a
  // "Reset filters" link) without this component's own debounce firing —
  // adjusted during render rather than in an effect, same pattern
  // PackageSheet already uses for its useActionState result.
  const [lastUrlValue, setLastUrlValue] = useState(urlValue);
  if (urlValue !== lastUrlValue) {
    setLastUrlValue(urlValue);
    setValue(urlValue);
  }

  function push(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.trim()) params.set(param, next.trim());
    else params.delete(param);
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
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
      <SearchIcon size={15} className="text-mute2" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border-0 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-mute2"
      />
    </label>
  );
}
