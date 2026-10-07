import type { INDIAN_STATES } from '@/features/demo-requests/validation';

type IndianState = (typeof INDIAN_STATES)[number];

// Same curated main-post-office PINs as FitDeskApp's features/settings/geo.ts.
// This is deliberately not an exhaustive postal directory. Never guess a
// location for an unknown PIN, or an area from a city-level PIN.
const PINCODES: Record<IndianState, Record<string, string>> = {
  'Andhra Pradesh': {
    Visakhapatnam: '530001', Vijayawada: '520001', Guntur: '522001',
    Tirupati: '517501', Nellore: '524001', Kurnool: '518001', Kadapa: '516001',
  },
  'Arunachal Pradesh': { Itanagar: '791111' },
  Assam: { Guwahati: '781001' },
  Bihar: { Patna: '800001' },
  Chhattisgarh: { Raipur: '492001' },
  Goa: { Panaji: '403001' },
  Gujarat: { Ahmedabad: '380001', Surat: '395001', Vadodara: '390001', Gandhinagar: '382001' },
  Haryana: { Gurugram: '122001', Faridabad: '121001' },
  'Himachal Pradesh': { Shimla: '171001' },
  Jharkhand: { Ranchi: '834001' },
  Karnataka: { Bengaluru: '560001', Mysuru: '570001', Mangaluru: '575001' },
  Kerala: { Thiruvananthapuram: '695001', Kochi: '682001' },
  'Madhya Pradesh': { Bhopal: '462001', Indore: '452001' },
  Maharashtra: { Mumbai: '400001', Pune: '411001', Nashik: '422001', Nagpur: '440001' },
  Manipur: { Imphal: '795001' },
  Meghalaya: { Shillong: '793001' },
  Mizoram: { Aizawl: '796001' },
  Nagaland: { Kohima: '797001' },
  Odisha: { Bhubaneswar: '751001' },
  Punjab: { Amritsar: '143001', Ludhiana: '141001' },
  Rajasthan: { Jaipur: '302001' },
  Sikkim: { Gangtok: '737101' },
  'Tamil Nadu': { Chennai: '600001', Coimbatore: '641001', Madurai: '625001' },
  Telangana: { Hyderabad: '500001' },
  Tripura: { Agartala: '799001' },
  'Uttar Pradesh': { Lucknow: '226001', Kanpur: '208001', Agra: '282001', Noida: '201301' },
  Uttarakhand: { Dehradun: '248001' },
  'West Bengal': { Kolkata: '700001' },
  'Andaman and Nicobar Islands': { 'Port Blair': '744101' },
  Chandigarh: { Chandigarh: '160001' },
  'Dadra and Nagar Haveli and Daman and Diu': { Silvassa: '396230', Daman: '396210' },
  Delhi: { 'New Delhi': '110001' },
  'Jammu & Kashmir': { Srinagar: '190001', Jammu: '180001' },
  Ladakh: { Leh: '194101' },
  Lakshadweep: { Kavaratti: '682555' },
  Puducherry: { Puducherry: '605001' },
};

export function stateCityForPincode(pin: string): { state: IndianState; city: string } | null {
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  let match: { state: IndianState; city: string } | null = null;
  for (const state of Object.keys(PINCODES) as IndianState[]) {
    for (const [city, code] of Object.entries(PINCODES[state])) {
      if (code !== pin) continue;
      if (match) return null;
      match = { state, city };
    }
  }
  return match;
}
