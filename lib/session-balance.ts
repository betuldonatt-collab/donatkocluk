// Remaining-session balance = paid sessions minus completed sessions,
// derived (never stored) and allowed to go negative -- a negative number
// is the payment reminder (supabase/migrations/0084). One rule for every
// panel; profiles.remaining_sessions is a stale admin-typed number that
// nothing decrements, so it must not be shown as the balance.
export type SessionBalanceRow = { is_paid: boolean; outcome: string };

export function sessionBalance(rows: SessionBalanceRow[]): { paid: number; completed: number; remaining: number; unpaidCompleted: number } {
  const paid = rows.filter((r) => r.is_paid).length;
  const completed = rows.filter((r) => r.outcome === "completed").length;
  const unpaidCompleted = rows.filter((r) => r.outcome === "completed" && !r.is_paid).length;
  return { paid, completed, remaining: paid - completed, unpaidCompleted };
}
