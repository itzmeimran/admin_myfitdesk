"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ButtonLabel } from "@/components/ButtonLabel";
import { UploadIcon, DeleteIcon } from "@/core/ui/icons";
import { ALLOWED_LOGO_TYPES, MAX_LOGO_BYTES } from "@/core/storage/logo-limits";
import { removeGymLogo, updateGymLogo } from "./logo-actions";

/** Upload, replace or remove a gym's logo — any number of times. */
export function GymLogoUpload({
  organizationId,
  gymName,
  logoUrl,
}: {
  organizationId: string;
  gymName: string;
  logoUrl: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(logoUrl);

  const [lastProp, setLastProp] = useState(logoUrl);
  if (logoUrl !== lastProp) {
    setLastProp(logoUrl);
    setPreviewUrl(logoUrl);
  }

  const initials = gymName.slice(0, 2).toUpperCase();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file || pending) return;

    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      toast.error("Gym logo must be a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Gym logo must be smaller than 5 MB.");
      return;
    }

    setPending("upload");
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await updateGymLogo(organizationId, formData);
      if (result.error || !result.url) throw new Error(result.error ?? "Couldn't upload this logo.");
      setPreviewUrl(result.url);
      toast.success("Logo updated.");
      router.refresh();
    } catch (err) {
      setPreviewUrl(logoUrl);
      toast.error(err instanceof Error ? err.message : "Couldn't update the logo. Please try again.");
    } finally {
      URL.revokeObjectURL(localPreview);
      setPending(null);
    }
  }

  async function handleRemove() {
    if (pending) return;
    setPending("remove");
    try {
      const result = await removeGymLogo(organizationId);
      if (result.error) throw new Error(result.error);
      setPreviewUrl(null);
      toast.success("Logo removed.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove the logo. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-3.5 border-[1.5px] border-line p-4">
      <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden border-[1.5px] border-ink bg-ink text-[16px] font-bold text-hi">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={`${gymName} logo`} className="h-full w-full bg-paper object-contain" />
        ) : (
          initials
        )}
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-mute">Gym logo</span>
        <p className="text-[11px] text-mute">PNG, JPEG or WebP, up to 5 MB.</p>
        <div className="mt-1 flex items-center gap-4">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => inputRef.current?.click()}
            className="flex items-center text-[11.5px] font-bold text-accent disabled:pointer-events-none disabled:opacity-60"
          >
            <ButtonLabel icon={UploadIcon} pending={pending === "upload"}>
              {pending === "upload" ? "Uploading…" : previewUrl ? "Replace logo" : "Upload logo"}
            </ButtonLabel>
          </button>
          {previewUrl ? (
            <button
              type="button"
              disabled={pending !== null}
              onClick={handleRemove}
              className="flex items-center text-[11.5px] font-bold text-mute disabled:pointer-events-none disabled:opacity-60"
            >
              <ButtonLabel icon={DeleteIcon} pending={pending === "remove"}>
                {pending === "remove" ? "Removing…" : "Remove"}
              </ButtonLabel>
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
