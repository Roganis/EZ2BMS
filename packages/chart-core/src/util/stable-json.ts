// A JSON writer whose output depends only on the value: object keys sorted,
// 4-space indentation (Qt's QJsonDocument layout, so BmsTWO diffs stay small),
// and arrays of flat objects - notes, BPM events, bar lines - one compact
// object per line. Saving an unchanged document reproduces its bytes.

export class JsonValueError extends Error {}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function num(n: number, path: string): string {
  if (!Number.isFinite(n)) throw new JsonValueError(`${path}: ${n} is not a JSON number`);
  return Object.is(n, -0) ? '0' : JSON.stringify(n);
}

function isFlat(v: unknown): v is Record<string, Json> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v).every((x) => x === null || typeof x !== 'object');
}

function compact(v: Json, path: string): string {
  if (v === null) return 'null';
  if (typeof v === 'number') return num(v, path);
  if (typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x, i) => compact(x, `${path}[${i}]`)).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${compact(v[k]!, `${path}.${k}`)}`).join(',')}}`;
}

function pretty(v: Json, indent: string, path: string): string {
  if (v === null || typeof v !== 'object') return compact(v, path);
  const inner = indent + '    ';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[\n' + indent + ']';
    const lines = v.map((x, i) =>
      isFlat(x) || x === null || typeof x !== 'object'
        ? inner + compact(x, `${path}[${i}]`)
        : inner + pretty(x, inner, `${path}[${i}]`),
    );
    return '[\n' + lines.join(',\n') + '\n' + indent + ']';
  }
  const keys = Object.keys(v).sort();
  if (keys.length === 0) return '{\n' + indent + '}';
  const lines = keys.map(
    (k) => `${inner}${JSON.stringify(k)}: ${pretty(v[k]!, inner, `${path}.${k}`)}`,
  );
  return '{\n' + lines.join(',\n') + '\n' + indent + '}';
}

/** Serialize with sorted keys; throws JsonValueError on NaN/Infinity/undefined. */
export function stableStringify(value: unknown): string {
  return pretty(sanitize(value, '$'), '', '$') + '\n';
}

function sanitize(v: unknown, path: string): Json {
  if (v === null) return null;
  switch (typeof v) {
    case 'number':
      num(v, path);
      return v;
    case 'string':
    case 'boolean':
      return v;
    case 'object': {
      if (Array.isArray(v)) return v.map((x, i) => sanitize(x, `${path}[${i}]`));
      const out: Record<string, Json> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (x === undefined) continue;
        out[k] = sanitize(x, `${path}.${k}`);
      }
      return out;
    }
    default:
      throw new JsonValueError(`${path}: ${typeof v} is not JSON`);
  }
}
