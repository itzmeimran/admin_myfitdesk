/**
 * Styled 404. Copied/adapted from FitDeskApp/src/app/not-found.tsx — a
 * Server Component: there is nothing to retry on a 404, so it needs no
 * client-side state. `ErrorState` is a Client Component but takes no
 * callback here, so it serializes fine.
 */

import { ErrorState } from "@/components/ErrorState";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sand">
      <ErrorState
        title="We couldn't find that page"
        description="The link may be out of date, or the section it pointed to has moved."
      />
    </main>
  );
}
