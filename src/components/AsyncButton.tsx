"use client";

import { useCallback, useRef, useState } from "react";
import { Button, type ButtonProps } from "./Button";

/** Pending state and a synchronous guard against duplicate imperative actions. */
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
): { run: (...args: Args) => void; pending: boolean } {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(
    (...args: Args) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      void Promise.resolve().then(() => action(...args)).finally(() => {
        inFlight.current = false;
        setPending(false);
      });
    },
    [action],
  );

  return { run, pending };
}

/** Shared Button that manages its own imperative action's pending state. */
export function AsyncButton({
  onClick,
  pendingLabel,
  ...props
}: Omit<ButtonProps, "onClick" | "pending"> & {
  onClick: () => Promise<void>;
  pendingLabel: string;
}) {
  const { run, pending } = useAsyncAction(onClick);
  return (
    <Button
      {...props}
      pending={pending}
      pendingLabel={pendingLabel}
      onClick={() => run()}
    />
  );
}
