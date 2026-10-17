"use client";

import { Button } from "@/components/Button";
import { RetryIcon, AlertIcon } from "@/core/ui/icons";

export default function OverviewError({ reset }: { reset: () => void }) {
  return <div role="alert" className="flex flex-col items-start gap-3 border border-line bg-paper p-5">
    <AlertIcon size={20} className="text-accent" aria-hidden />
    <h2 className="text-[15px] font-bold">Platform data could not be loaded</h2>
    <p className="text-[13px] text-mute">Try again to reload this environment. Your selected collection period will be kept.</p>
    <Button icon={RetryIcon} variant="secondary" onClick={reset}>Try again</Button>
  </div>;
}
