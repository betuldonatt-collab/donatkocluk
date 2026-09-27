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

// A login number for display: "905321234567" / "+905321234567" -> "0532 123 45 67".
// Anything that is not a Turkish mobile number is shown as stored. Returns null
// when there is nothing to show.
export function formatLoginName(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  const national = digits.length === 12 && digits.startsWith("90") ? `0${digits.slice(2)}` : digits;
  if (national.length === 11 && national.startsWith("05")) {
    return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7, 9)} ${national.slice(9)}`;
  }
  return phone;
}
