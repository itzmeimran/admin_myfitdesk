/** Shared by native action buttons and navigation links styled as buttons. */
export type ButtonVariant = "primary" | "secondary" | "danger" | "danger-secondary" | "ghost" | "link" | "control" | "surface" | "overlay";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "custom";
export type ButtonStyleProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  selected?: boolean;
  tone?: "default" | "danger" | "inverse";
  className?: string;
};

export function buttonClasses({ variant = "secondary", size, iconOnly = false, tone = "default", className = "" }: ButtonStyleProps = {}): string {
  const resolvedSize = size ?? (["link", "control", "surface", "overlay"].includes(variant) ? "custom" : "md");
  return ["mfd-button", `mfd-button--${variant}`, `mfd-button--${resolvedSize}`, iconOnly && "mfd-button--icon", tone !== "default" && `mfd-button--${tone}-tone`, className].filter(Boolean).join(" ");
}
