// The short congratulation shown when a Süre Tut session is finished (in the
// "saved" toast). Tiered by how long the student focused; a completed countdown
// goal always gets its own message, however short the planned duration was --
// hitting a 15-minute target is just as much "nailed it" as hitting a 60-minute
// one.

export const GOAL_HIT_MESSAGES = [
  "Hedefi 12'den vurdun! Planladığın süreyi kusursuz tamamladın.",
  "Tam vaktinde! Hedefine birebir ulaştın.",
];
export const SHORT_SESSION_MESSAGES = ["Güzel bir ısınma turu!", "Küçük adımlar büyük işler başarır!"];
export const STANDARD_SESSION_MESSAGES = ["Harika bir odak bloğu!", "Zihni kilitledin, süper gidiyorsun!"];
export const LONG_SESSION_MESSAGES = ["Gerçek bir maraton disiplini!", "Bugün rakiplerine fark attın!"];

function pick(pool: string[], random: () => number) {
  return pool[Math.floor(random() * pool.length)];
}

// `random` is injectable so the choice is testable.
export function resolvePraiseMessage(seconds: number, goalHit: boolean, random: () => number = Math.random): string {
  if (goalHit) return pick(GOAL_HIT_MESSAGES, random);
  const minutes = seconds / 60;
  if (minutes < 20) return pick(SHORT_SESSION_MESSAGES, random);
  if (minutes < 50) return pick(STANDARD_SESSION_MESSAGES, random);
  return pick(LONG_SESSION_MESSAGES, random);
}
