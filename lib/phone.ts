// Normalizes a Turkish phone number to E.164 (+90XXXXXXXXXX), the exact
// format Supabase Auth's phone field requires. Used everywhere a phone
// number is submitted or looked up (signup requests, account creation,
// sign-in) so the same number always normalizes to the same string.
export function normalizeTurkishPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10 && digits.startsWith("5")) return `+90${digits}`;
  if (digits.length === 11 && digits.startsWith("05")) return `+90${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("905")) return `+${digits}`;
  return null;
}
