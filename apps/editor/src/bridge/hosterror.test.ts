// A host refusal reaches a toast in the editor's language, and the log in
// the host's English.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasMessage, i18n, t } from '../i18n/i18n.svelte';
import { describeError } from '../state/diag.svelte';
import { HostError, hostError } from './hosterror';

const HOST = resolve(import.meta.dirname, '../../../../src-tauri/src');

const say = (kind: string, params: Record<string, string>) => {
  const key = `host.${kind}`;
  return hasMessage(key) ? t(key, params) : undefined;
};

describe('host errors', () => {
  it('are said from the catalog, keeping the English for the log', () => {
    const wire = {
      kind: 'not-empty',
      message: '/songs/out is not empty',
      params: { path: '/songs/out' },
    };
    try {
      i18n.apply('en', true);
      const e = hostError(wire, say) as HostError;
      expect(e).toBeInstanceOf(HostError);
      expect(e.message).toBe('⟦/søngs/øüt ïs nøt émpty⟧');
      expect(`${e}`).toBe(e.message);
      expect(describeError(e).detail).toBe('not-empty: /songs/out is not empty');
    } finally {
      i18n.apply('en');
    }
  });

  it("keep the host's words for a kind the catalog does not have, and pass anything else through", () => {
    const e = hostError({ kind: 'other', message: '/x: Permission denied (os error 13)' }, say);
    expect(String(e)).toBe('/x: Permission denied (os error 13)');
    expect(hostError('plain text', say)).toBe('plain text');
  });

  it('have a sentence for every kind the host words itself', () => {
    // Read from the host's source: `kind()`'s arms, `coded("…")` calls,
    // and the plate's `text_error`. Kind `other` is the English as it is.
    const kinds = new Set<string>();
    const src = (f: string) => readFileSync(resolve(HOST, f), 'utf8');
    const block = (text: string, fn: string) => text.slice(text.indexOf(fn)).split('\n}\n')[0]!;
    const arms = [block(src('error.rs'), 'pub fn kind'), block(src('media.rs'), 'fn text_error')];
    for (const text of arms)
      for (const m of text.matchAll(/=>\s*[({]?\s*\(?\s*"([a-z][a-z0-9-]*)"/g)) kinds.add(m[1]!);
    for (const f of ['files.rs', 'lib.rs', 'media.rs', 'port.rs', 'export.rs'])
      for (const m of src(f).matchAll(/coded\(\s*"([a-z][a-z0-9-]*)"/g)) kinds.add(m[1]!);
    kinds.delete('other');
    // The extraction still finds them all (a new kind only adds).
    expect(kinds.size).toBeGreaterThanOrEqual(18);
    for (const kind of kinds) expect(hasMessage(`host.${kind}`), kind).toBe(true);
  });
});
