"use client";

/**
 * Last-resort boundary: this only renders when the *root layout itself*
 * fails, which means it replaces `layout.tsx` entirely and must supply its
 * own `<html>` and `<body>`. Copied/adapted from
 * FitDeskApp/src/app/global-error.tsx.
 *
 * Everything here is inline-styled on purpose. The root layout is what loads
 * `globals.css` and the two next/font families, so at this point no Tailwind
 * class and no brand font is guaranteed to resolve — a Tailwind-styled
 * fallback would render as unstyled text exactly when it matters most. The
 * hex values are the "Clay & Rust" tokens copied literally from globals.css.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ede4d6",
          color: "#1b1512",
          fontFamily:
            "'Space Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "360px", textAlign: "center" }}>
          <div
            aria-hidden="true"
            style={{
              width: "48px",
              height: "48px",
              margin: "0 auto 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1.5px solid #bf3b15",
              background: "rgba(191,59,21,0.08)",
              color: "#bf3b15",
              fontSize: "22px",
              fontWeight: 700,
            }}
          >
            !
          </div>

          <h1 style={{ fontSize: "19px", lineHeight: 1.25, margin: "0 0 8px" }}>
            Platform admin couldn&apos;t start
          </h1>
          <p style={{ fontSize: "13.5px", lineHeight: 1.6, color: "#6f6259", margin: "0 0 20px" }}>
            Something failed before the console could load. No tenant data was touched. Try again
            in a moment.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              width: "100%",
              padding: "12px",
              border: "none",
              cursor: "pointer",
              background: "#f2c14e",
              color: "#1b1512",
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              fontFamily: "inherit",
            }}
          >
            Try again
          </button>

          {error.digest ? (
            <p style={{ fontSize: "11px", color: "#b3a99d", marginTop: "16px" }}>
              Reference <span style={{ userSelect: "all" }}>{error.digest}</span>
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
