"use client";

import { useState } from "react";
import { ImageLightbox } from "@/components/ImageLightbox";

/** Member profile picture with an initials fallback — used when there is no
 * photo, or when the (short-lived, presigned) URL fails to load. */
export function MemberAvatar({ name, url, size = 32 }: { name: string; url: string | null | undefined; size?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "?";
  const showImage = Boolean(url) && url !== failedUrl;
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center overflow-hidden bg-sand text-[11px] font-bold text-ink"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size / 3.2)) }}
    >
      {showImage && url ? (
        <ImageLightbox src={url} alt={`${name} profile picture`} title={name} subtitle="Member profile picture">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`${name} profile picture`}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(url)}
          />
        </ImageLightbox>
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
