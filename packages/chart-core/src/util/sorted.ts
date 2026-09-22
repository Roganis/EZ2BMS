// Binary searches over sorted arrays, parameterised by a key function so they
// work on records without building parallel arrays.

/** First index i with key(a[i]) >= x (a sorted ascending by key). */
export function lowerBound<T>(a: readonly T[], x: number, key: (v: T) => number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(a[mid]!) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index i with key(a[i]) > x (a sorted ascending by key). */
export function upperBound<T>(a: readonly T[], x: number, key: (v: T) => number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(a[mid]!) <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
