// Shared by client forms and server actions so a paragraf/problem net score
// is always derived the same way, never stored (and never able to drift
// from its doğru/yanlış inputs).
export function computeNet(dogru: number, yanlis: number) {
  return Math.round((dogru - yanlis / 4) * 100) / 100;
}
