/**
 * The manual-payment vocabulary admin_extend_subscription's
 * p_payment_method accepts (supabase/migrations/1014_admin_manual_payment.sql's
 * platform_payments_method_check). Shared between the client sheet (renders
 * the dropdown) and the server action (validates before ever reaching the
 * RPC, same "fail with a clear message before a raw Postgres error" pattern
 * every other admin write in this app follows).
 */
export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "cash";

export function paymentMethodLabel(method: string | null): string {
  if (!method) return "Online";
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}
