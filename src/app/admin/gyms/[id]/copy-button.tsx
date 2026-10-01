"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { ConfirmIcon, CopyIcon } from "@/core/ui/icons";

/** Small icon button beside a header fact that copies its value to the clipboard. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error(`Couldn't copy the ${label.toLowerCase()}.`);
      return;
    }
    setCopied(true);
    toast.success(`${label} copied`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label.toLowerCase()}`}
      title={`Copy ${label.toLowerCase()}`}
      className={`press-scale inline-flex h-6 w-6 flex-shrink-0 items-center justify-center border-[1.5px] border-transparent transition-colors hover:border-line hover:bg-sand focus-visible:border-ink focus-visible:outline-none ${
        copied ? "text-live" : "text-mute3 hover:text-ink"
      }`}
    >
      {copied ? <ConfirmIcon size={13} aria-hidden /> : <CopyIcon size={13} aria-hidden />}
    </button>
  );
}
