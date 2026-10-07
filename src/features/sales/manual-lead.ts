import { z } from 'zod';
import { BRANCH_RANGES, INDIAN_STATES, MEMBER_RANGES, normalizeDemoPhone } from '@/features/demo-requests/validation';

export const MANUAL_LEAD_SOURCES = ['Field visit', 'Cold call', 'Referral', 'Instagram', 'Google', 'WhatsApp'] as const;
export const manualLeadSchema = z.object({
  gym: z.string().trim().min(1, 'Enter the gym name').max(160),
  contact: z.string().trim().min(1, 'Enter a contact name').max(100),
  phone: z.string().trim().regex(/^\+?[\d\s()-]+$/, 'Enter a valid mobile number')
    .transform(normalizeDemoPhone).pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'))
    .transform(phone => `+91${phone}`),
  email: z.string().trim().toLowerCase().pipe(z.union([z.literal(''), z.email()])),
  city: z.string().trim().min(1, 'Enter the city').max(120),
  state: z.enum(INDIAN_STATES, { error: 'Choose a state' }),
  area: z.string().trim().max(160).default(''),
  pin: z.string().trim().regex(/^([1-9]\d{5})?$/, 'Enter a valid 6-digit PIN code').default(''),
  branches: z.enum(['Unknown', ...BRANCH_RANGES]).default('Unknown'),
  members: z.enum(['Unknown', ...MEMBER_RANGES]).default('Unknown'),
  source: z.enum(MANUAL_LEAD_SOURCES),
  note: z.string().trim().max(5000).default(''),
});
export type ManualLeadInput = z.input<typeof manualLeadSchema>;
