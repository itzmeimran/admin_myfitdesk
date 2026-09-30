"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NextPageIcon } from "@/core/ui/icons";

export type CustomFilterOption = { value: string; label: string; hint?: string };

/** Design-system filter menu used instead of a browser-native select. It is
 * URL-backed like the existing filters, so server pagination/sorting remain
 * shareable and browser back/forward continue to work. */
export function CustomFilterDropdown({
  param,
  placeholder,
  options,
}: {
  param: string;
  placeholder: string;
  options: CustomFilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get(param) ?? "";
  const selectedOption = options.find((option) => option.value === selected);
  const menuOptions = [{ value: "", label: placeholder }, ...options];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selected ? Math.max(1, options.findIndex((option) => option.value === selected) + 1) : 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function choose(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    next.delete("page");
    setOpen(false);
    router.push(`${pathname}${next.size ? `?${next}` : ""}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActiveIndex((current) => (current + direction + menuOptions.length) % menuOptions.length);
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      choose(menuOptions[activeIndex]?.value ?? "");
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-[150px]">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setActiveIndex(selected ? Math.max(1, options.findIndex((option) => option.value === selected) + 1) : 0);
          setOpen((value) => !value);
        }}
        onKeyDown={onKeyDown}
        className={`flex min-h-[38px] w-full items-center justify-between gap-3 border-[1.5px] bg-paper px-3 text-left text-[11.5px] font-bold transition-colors hover:border-ink ${
          selected ? "border-ink text-ink" : "border-line text-mute"
        }`}
      >
        <span className="truncate">{selectedOption?.label ?? placeholder}</span>
        <NextPageIcon
          size={13}
          aria-hidden
          className={`flex-shrink-0 transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
        />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={placeholder}
          className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-72 min-w-full overflow-y-auto border-[1.5px] border-ink bg-paper p-1 shadow-[4px_4px_0_var(--ink)]"
        >
          {menuOptions.map((option, index) => {
            const isSelected = option.value === selected;
            const isActive = index === activeIndex;
            return (
              <button
                key={option.value || "__all"}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option.value)}
                className={`flex min-h-9 w-full items-center justify-between gap-3 px-2.5 py-2 text-left text-[11.5px] transition-colors ${
                  isSelected ? "bg-ink font-bold text-paper" : isActive ? "bg-sand text-ink" : "text-mute hover:bg-sand hover:text-ink"
                }`}
              >
                <span className="whitespace-nowrap">{option.label}</span>
                {isSelected ? <span aria-hidden>✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
