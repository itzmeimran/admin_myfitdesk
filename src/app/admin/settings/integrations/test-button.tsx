"use client";

import { useState, useTransition } from "react";
import type { ConnectionTestResult } from "@/features/settings/integration-tests";
import { SpinnerIcon, RetryIcon } from "@/core/ui/icons";
import { GHOST_BUTTON_CLASS } from "../_components/ui";

/** Runs one server-side connection probe and shows the scrubbed result inline.
 * `run` is a Server Action (credentials never reach the browser). */
export function TestConnectionButton({ run, label = "Test connection" }: { run: () => Promise<ConnectionTestResult>; label?: string }) {
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setResult(await run());
          })
        }
        className={GHOST_BUTTON_CLASS}
      >
        {isPending ? <SpinnerIcon size={13} className="animate-spin" aria-hidden /> : <RetryIcon size={13} aria-hidden />}
        {isPending ? "Testing…" : label}
      </button>
      {result ? (
        <span role="status" className={`text-[11.5px] ${result.ok ? "text-ink" : "text-accent"}`}>
          {result.ok ? "Passed" : "Failed"} — {result.message}
          {result.ms ? ` (${result.ms} ms)` : ""}
        </span>
      ) : null}
    </div>
  );
}
