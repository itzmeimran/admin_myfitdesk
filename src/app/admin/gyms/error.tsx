"use client";

import { Button } from "@/components/Button";
import { RetryIcon, AlertIcon } from "@/core/ui/icons";

export default function GymsError({ reset }: { reset: () => void }) {
  return <div role="alert" className="flex flex-col items-start gap-3 border border-line bg-paper p-6">
    <AlertIcon size={22} className="text-accent" aria-hidden />
    <h2 className="font-bold">Gyms could not be loaded</h2>
    <p className="text-sm text-mute">Please try again. Your search and filters will be kept.</p>
    <Button icon={RetryIcon} variant="secondary" onClick={reset}>Try again</Button>
  </div>;
}
