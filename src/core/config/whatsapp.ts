import 'server-only';
import type { AdminEnvironment } from './environments';

/** Each project gets its own number and token. No cross-environment fallback. */
export function managedWhatsAppConfig(environment: AdminEnvironment) {
  const suffix = environment.toUpperCase();
  const phoneNumberId = process.env[`WHATSAPP_MANAGED_PHONE_NUMBER_ID_${suffix}`]?.trim();
  const wabaId = process.env[`WHATSAPP_MANAGED_WABA_ID_${suffix}`]?.trim();
  const accessToken = process.env[`WHATSAPP_MANAGED_ACCESS_TOKEN_${suffix}`]?.trim()
    || process.env[`WHATSAPP_SYSTEM_USER_TOKEN_${suffix}`]?.trim();
  const version = process.env.META_GRAPH_API_VERSION?.trim() || 'v21.0';
  if (!phoneNumberId || !wabaId || !accessToken || !/^\d+$/.test(phoneNumberId) || !/^\d+$/.test(wabaId) || !/^v\d+\.\d+$/.test(version)) return null;
  return { phoneNumberId, wabaId, accessToken, version };
}
