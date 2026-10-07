/** Primary: main CTA. Secondary: supporting action. Text: inline action.
 * Ghost: quiet toolbar, menu or navigation action. Disabled is a native state,
 * never a variant. Danger is a tone so the same hierarchy applies to it. */
export type ButtonVariant = "primary" | "secondary" | "text" | "ghost";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "custom";
/** Layouts preserve compound widgets without introducing extra visual variants.
 * Overlay is reserved for invisible dialog dismiss targets. */
export type ButtonLayout = "control" | "content" | "overlay";
export type ButtonStyleProps = {
  variant?: ButtonVariant;
  layout?: ButtonLayout;
  size?: ButtonSize;
  iconOnly?: boolean;
  selected?: boolean;
  tone?: "default" | "danger" | "inverse";
  className?: string;
};

export function buttonClasses({ variant = "secondary", layout, size, iconOnly = false, tone = "default", className = "" }: ButtonStyleProps = {}): string {
  const resolvedSize = size ?? (variant === "text" || layout ? "custom" : "md");
  return ["mfd-button", `mfd-button--${variant}`, layout && `mfd-button--${layout}-layout`, `mfd-button--${resolvedSize}`, iconOnly && "mfd-button--icon", tone !== "default" && `mfd-button--${tone}-tone`, className].filter(Boolean).join(" ");
}
