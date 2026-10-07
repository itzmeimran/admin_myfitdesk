import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Use the same validation as FitDeskApp's OTP endpoint. */
export function normalizeOwnerPhone(raw: string): string | null {
  const phone = parsePhoneNumberFromString(raw, "IN");
  return phone?.isValid() ? phone.number : null;
}
