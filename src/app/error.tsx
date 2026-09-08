"use client";

/**
 * The boundary for everything outside /admin — login, and any future
 * password-reset flow. Copied/adapted from FitDeskApp/src/app/error.tsx.
 * Sends people to /login rather than /admin: someone hitting an error on a
 * signed-out screen usually has no session to go back to.
 */

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-sand">
      <ErrorState
        title="Something went wrong"
        description="We couldn't finish loading this page. Nothing was changed — try again, or head back to sign in."
        digest={error.digest}
        onRetry={reset}
        homeHref="/login"
        homeLabel="Go to sign in"
      />
    </main>
  );
}
