// The markup scan on the files named in SCAN_FILES (comma-separated,
// relative to src/), for converting a screen at a time:
//   SCAN_FILES=ui/PublishDialog.svelte npx vitest run src/i18n/scan-files.test.ts
// Without SCAN_FILES it has nothing to do.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { writtenText } from './scan';

const SRC = resolve(import.meta.dirname, '..');
const files = (process.env.SCAN_FILES ?? '').split(',').filter(Boolean);

it.skipIf(!files.length)('the files named have no words written into their markup', () => {
  const left = files.flatMap((f) =>
    writtenText(readFileSync(join(SRC, f), 'utf8')).map((s) => `${f}:${s}`),
  );
  expect(left).toEqual([]);
});
