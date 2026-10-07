"use client";

import { Button } from "@/components/Button";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { UploadIcon, DeleteIcon } from "@/core/ui/icons";
import { ALLOWED_LOGO_TYPES, MAX_LOGO_BYTES } from "@/core/storage/logo-limits";
import { removeGymLogo, updateGymLogo } from "./logo-actions";
import { useActionConfirmation } from '@/components/ActionConfirmationProvider';

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
  const confirmAction=useActionConfirmation();
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

    await confirmAction({title:'Update gym logo?',description:`Upload this image as the logo for ${gymName}?`},async()=>{
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
    });
  }

  async function handleRemove() {
    if (pending) return;
    await confirmAction({title:'Remove gym logo?',description:`Remove the current logo from ${gymName}?`,danger:true},async()=>{
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
    });
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
          <Button tone="danger" icon={UploadIcon} pending={pending === "upload"}
            type="button"
            disabled={pending !== null}
            onClick={() => inputRef.current?.click()}
            variant="link" size="custom"
          >
              {pending === "upload" ? "Uploading…" : previewUrl ? "Replace logo" : "Upload logo"}
          </Button>
          {previewUrl ? (
            <Button icon={DeleteIcon} pending={pending === "remove"}
              type="button"
              disabled={pending !== null}
              onClick={handleRemove}
              variant="link" size="custom" className="text-mute"
            >
                {pending === "remove" ? "Removing…" : "Remove"}
            </Button>
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
