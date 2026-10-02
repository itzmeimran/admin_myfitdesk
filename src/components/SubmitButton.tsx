"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./Button";

/** Shared Button with form pending state. Render inside its <form action={...}>. */
export function SubmitButton({ pendingLabel, ...props }: Omit<ButtonProps, "type" | "pending"> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      {...props}
      type="submit"
      pending={pending}
      pendingLabel={pendingLabel}
    />
  );
}
