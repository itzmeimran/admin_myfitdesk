"use client";

import { Button } from "@/components/Button";
import { useState, useTransition } from "react";
import type { ConnectionTestResult } from "@/features/settings/integration-tests";
import { RetryIcon } from "@/core/ui/icons";

/** Runs one server-side connection probe and shows the scrubbed result inline.
 * `run` is a Server Action (credentials never reach the browser). */
export function TestConnectionButton({ run, label = "Test connection" }: { run: () => Promise<ConnectionTestResult>; label?: string }) {
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        icon={RetryIcon}
        pending={isPending}
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setResult(await run());
          })
        }
        variant="secondary" size="sm"
      >
        {isPending ? "Testing…" : label}
      </Button>
      {result ? (
        <span role="status" className={`text-[11.5px] ${result.ok ? "text-ink" : "text-accent"}`}>
          {result.ok ? "Passed" : "Failed"} — {result.message}
          {result.ms ? ` (${result.ms} ms)` : ""}
        </span>
      ) : null}
    </div>
  );
}
