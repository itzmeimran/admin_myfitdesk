"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { ButtonLink } from "@/components/ButtonLink";

/**
 * The app's one tab control, from the Claude Design "MyFitDesk Admin Tabs"
 * canvas. Two looks of the same list:
 *
 *  - 2a "Segmented" (below `xl`): one bordered bar, the active tab filled ink,
 *    scrolls sideways when the tabs don't fit.
 *  - 2d "Side rail" (from `xl`): a vertical list on the left of the content,
 *    the active tab marked by an accent bar on the rail's edge.
 *
 * Wrap the page body in `TabsLayout` so the rail has a column to sit in; a
 * contained strip (a drawer, a narrow list header) passes `variant="segmented"`
 * and stays 2a at every width, with no layout wrapper.
 *
 * Items with an `href` are real navigations (each tab is its own route), items
 * without one switch local state through `onSelect`.
 */

export type TabItem = {
  key: string;
  label: string;
  /** Present → a link (route tab); absent → a button that calls `onSelect`. */
  href?: string;
  scroll?: boolean;
  /** Count pill, e.g. items needing attention. Hidden when 0. */
  badge?: number;
  /** Quiet trailing text, e.g. a row count. */
  meta?: string;
};

type TabsNavProps = {
  items: TabItem[];
  activeKey: string;
  ariaLabel: string;
  onSelect?: (key: string) => void;
  /** `responsive` = 2a below `xl`, 2d from `xl`. `segmented` = 2a always. */
  variant?: "responsive" | "segmented";
  size?: "md" | "sm";
  /** Segmented only: stretch the tabs to share the full width equally. */
  fill?: boolean;
  /** Keep the segmented bar pinned to the top of the page while scrolling. */
  sticky?: boolean;
  className?: string;
};

export function TabsNav({
  items,
  activeKey,
  ariaLabel,
  onSelect,
  variant = "responsive",
  size = "md",
  fill = false,
  sticky = false,
  className = "",
}: TabsNavProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const isLinks = items.some((item) => item.href);

  // Bring the active tab into view inside the scrolling bar. Done by hand on
  // the bar's own scrollLeft so the page itself never jumps.
  useEffect(() => {
    const bar = barRef.current;
    const active = bar?.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
    if (!bar || !active) return;
    bar.scrollLeft = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
  }, [activeKey]);

  function renderItem(item: TabItem, kind: "seg" | "rail") {
    const active = item.key === activeKey;
    const className = kind === "seg" ? segmentClass(active, size, fill) : railClass(active);
    const body = (
      <>
        <span>{item.label}</span>
        {item.meta ? <span className={`text-[0.85em] font-normal ${active && kind === "seg" ? "text-mute3" : "text-mute2"}`}>{item.meta}</span> : null}
        {item.badge ? (
          <span
            className={`flex h-[18px] min-w-[18px] items-center justify-center px-1 text-[10px] font-bold ${
              active && kind === "seg" ? "bg-hi text-ink" : "bg-ink text-hi"
            } ${kind === "rail" ? "ml-auto" : ""}`}
          >
            {item.badge}
          </span>
        ) : null}
      </>
    );

    if (item.href) {
      return (
        <ButtonLink
          key={item.key}
          href={item.href}
          scroll={item.scroll}
          aria-current={active ? "page" : undefined}
          variant="ghost"
          layout="control"
          size="custom"
          className={className}
        >
          {body}
        </ButtonLink>
      );
    }
    return (
      // Tab labels are text-only in the design, so no action icon here.
      // eslint-disable-next-line mfd-ui/button-icon
      <Button
        key={item.key}
        type="button"
        role="tab"
        aria-selected={active}
        variant="ghost"
        layout="control"
        size="custom"
        onClick={() => onSelect?.(item.key)}
        className={className}
      >
        {body}
      </Button>
    );
  }

  const barProps = isLinks ? {} : { role: "tablist", "aria-label": ariaLabel };
  const bar = (
    <div
      ref={barRef}
      {...barProps}
      className={`relative flex max-w-full overflow-x-auto border border-line bg-[#fffdf8] [scrollbar-width:none] ${fill ? "w-full" : "w-fit"}`}
    >
      {items.map((item) => renderItem(item, "seg"))}
    </div>
  );
  const rail = (
    <div
      {...barProps}
      aria-orientation={isLinks ? undefined : "vertical"}
      className="hidden border-l-[1.5px] border-line xl:sticky xl:top-4 xl:flex xl:flex-col"
    >
      {items.map((item) => renderItem(item, "rail"))}
    </div>
  );

  const stickyClass = sticky ? "md:sticky md:top-0 md:z-10 md:bg-paper" : "";
  const segmentedOnly = variant === "segmented";

  // Link tabs are navigation landmarks; button tabs are a tablist (set above).
  if (isLinks) {
    return (
      <>
        <nav aria-label={ariaLabel} className={`${segmentedOnly ? "" : "xl:hidden"} ${stickyClass} ${className}`}>
          {bar}
        </nav>
        {segmentedOnly ? null : (
          <nav aria-label={ariaLabel} className="hidden xl:block xl:sticky xl:top-4">
            {rail}
          </nav>
        )}
      </>
    );
  }
  return (
    <>
      <div className={`${segmentedOnly ? "" : "xl:hidden"} ${stickyClass} ${className}`}>{bar}</div>
      {segmentedOnly ? null : rail}
    </>
  );
}

function segmentClass(active: boolean, size: "md" | "sm", fill: boolean): string {
  const dims =
    size === "sm"
      ? "min-h-[36px] px-3 text-[12px]"
      : "min-h-[44px] px-4 text-[13px] sm:px-6 sm:text-[14px]";
  const tone = active
    ? "bg-ink text-paper hover:bg-ink hover:text-paper"
    : "bg-[#fffdf8] text-mute hover:bg-sand hover:text-ink";
  return `flex-shrink-0 gap-2 whitespace-nowrap font-medium ${fill ? "flex-1" : ""} ${dims} ${tone}`;
}

function railClass(active: boolean): string {
  return `-ml-[1.5px] min-h-[48px] justify-start gap-3 border-0 border-l-2 px-5 py-3 text-left text-[15px] font-medium ${
    active ? "border-l-accent text-ink hover:bg-transparent" : "border-l-transparent text-mute hover:text-ink"
  }`;
}

/**
 * Page body for a tabbed screen: below `xl` the tabs stack above the content,
 * from `xl` the tabs become the left rail and the content takes the rest.
 */
export function TabsLayout({
  nav,
  children,
  className = "",
  contentClassName = "gap-4",
}: {
  nav: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-4 xl:grid xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start xl:gap-8 ${className}`}>
      {nav}
      <div className={`flex min-w-0 flex-col ${contentClassName}`}>{children}</div>
    </div>
  );
}
