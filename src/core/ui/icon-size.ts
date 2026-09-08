/**
 * The two icon sizes this app uses, in px. Copied verbatim from
 * FitDeskApp/src/core/ui/icon-size.ts — see that file's docblock for why
 * this is a plain (non-"use client") module, separate from icons.ts: a
 * Server Component importing a plain value out of a "use client" module
 * gets a client reference back, not the value, with no build/type error.
 */
export const ICON_SIZE = {
  button: 15,
  nav: 18,
} as const;
