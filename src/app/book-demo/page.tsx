import type { Metadata } from "next";
import { demoWindow } from "@/features/demo-requests/slots";
import { BookDemoView, type PreviewState } from "./book-demo-view";
import { demoContactEmail, demoMarketingOrigin, readDemoCalendar } from "./server";

export const metadata: Metadata = {
  title: "Book a demo — MyFitDesk",
  description: "A short, personal walkthrough of MyFitDesk for gym owners. Pick a time that suits you.",
};

// The bookable window depends on "today" (IST), so this can't be prerendered.
export const dynamic = "force-dynamic";

const PREVIEWS: readonly PreviewState[] = ["errors", "sending", "success", "returning"];

/** Public page — no auth gate (only /admin is gated). `?preview=` jumps to a
 * design state for QA and is ignored in production builds. */
export default async function BookDemoPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const initial = process.env.NODE_ENV !== "production" ? PREVIEWS.find((p) => p === preview) : undefined;
  return <BookDemoView window={demoWindow()} previewState={initial} calendar={await readDemoCalendar()}
    marketingOrigin={demoMarketingOrigin()} supportEmail={demoContactEmail()} />;
}
