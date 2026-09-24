// An error from the desktop host (src-tauri/src/error.rs), said in the
// editor's language. The host sends `{kind, message, params}`: `kind` names
// a sentence in the catalog (`host.<kind>`, i18n/en/host.ts) and `params`
// its values; `message` is the English, which the log keeps. A kind the
// catalog has no sentence for (`other`: a bug's refusal, or a path with the
// OS's own words) is shown in the host's English.

export interface WireError {
  kind: string;
  message: string;
  params?: Record<string, string>;
}

export class HostError extends Error {
  constructor(
    readonly kind: string,
    /** The host's English, for the log and bug reports. */
    readonly english: string,
    readonly params: Record<string, string>,
    said: string,
  ) {
    super(said);
    this.name = 'HostError';
  }

  /** `${e}` and String(e) give the sentence alone, as a plain string error did. */
  override toString(): string {
    return this.message;
  }
}

const isWire = (e: unknown): e is WireError =>
  !!e &&
  typeof e === 'object' &&
  typeof (e as WireError).kind === 'string' &&
  typeof (e as WireError).message === 'string';

/**
 * What a rejected command becomes: a HostError worded by `say` (the
 * catalog; undefined for a kind it has no sentence for). Anything not in the
 * host's shape (a plugin's plain string) goes through as it came.
 */
export function hostError(
  e: unknown,
  say: (kind: string, params: Record<string, string>) => string | undefined,
): unknown {
  if (!isWire(e)) return e;
  const params = e.params ?? {};
  return new HostError(e.kind, e.message, params, say(e.kind, params) ?? e.message);
}
