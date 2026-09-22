import { describe, expect, it } from 'vitest';
import { ORACLE, oracle } from './oracle';

describe.skipIf(!ORACLE)('ez2port-oracle plumbing', () => {
  it('answers a score script with the engine defaults', () => {
    const out = oracle<string[]>(['score'], 'judge 0\njudge 27\njudge 39\njudge 75\njudge 76\n');
    expect(out).toEqual(['KOOL', 'COOL', 'GOOD', 'FAIL', 'NONE']);
  });
});
