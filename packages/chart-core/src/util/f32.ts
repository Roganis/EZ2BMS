// EZFF stores tempos and scroll multipliers as f32; the bmson keeps them as
// the shortest decimal that is the same f32, so a chart reads 175.3 (not
// 175.3000030517578) and writes back the same bits.

/** The shortest decimal that reads back as the same f32 (175.3, not 175.3000030517578). */
export function f32Decimal(v: number): number {
  const x = Math.fround(v);
  if (!Number.isFinite(x) || x === 0) return x;
  for (let p = 1; p <= 9; p++) {
    const d = Number(x.toPrecision(p));
    if (Math.fround(d) === x) return d;
  }
  return x;
}
