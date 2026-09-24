// chart-core says its version in two places - its export, and the Converter
// line of every song.ini it publishes - and neither may lag the package's.
// A release sets the version in package.json (docs/releasing.md); this
// fails until the copies here follow.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { CHART_CORE_VERSION } from '../src/index';
import { CONVERTER } from '../src/publish/package';

it('says the version the package has', () => {
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));
  expect(CHART_CORE_VERSION).toBe(pkg.version);
  expect(CONVERTER).toBe(`EZ2BMS ${pkg.version}`);
});
