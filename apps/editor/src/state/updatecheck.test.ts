import { describe, expect, it } from 'vitest';
import { DEFAULT_UPDATES } from './settings.svelte';
import { checkDue, DAY_MS, offer } from './updatecheck';

describe('the daily look for a new version', () => {
  const now = 1_790_000_000_000;
  it('looks at most once a day, and never when turned off', () => {
    expect(checkDue({ ...DEFAULT_UPDATES, lastCheckMs: 0 }, now)).toBe(true);
    expect(checkDue({ ...DEFAULT_UPDATES, lastCheckMs: now - DAY_MS + 1 }, now)).toBe(false);
    expect(checkDue({ ...DEFAULT_UPDATES, lastCheckMs: now - DAY_MS }, now)).toBe(true);
    expect(checkDue({ ...DEFAULT_UPDATES, check: false, lastCheckMs: 0 }, now)).toBe(false);
    // A clock set back does not stop it for good.
    expect(checkDue({ ...DEFAULT_UPDATES, lastCheckMs: now + DAY_MS }, now)).toBe(true);
  });

  it('does not offer a skipped version by itself, but does when asked', () => {
    const o = { ...DEFAULT_UPDATES, skip: '0.2.0' };
    expect(offer(o, '0.2.0', false)).toBe(false);
    expect(offer(o, '0.2.1', false)).toBe(true);
    expect(offer(o, '0.2.0', true)).toBe(true);
  });
});
