import { describe, expect, it } from 'vitest';
import { CHART_CORE_VERSION } from '../src/index';

describe('chart-core', () => {
  it('loads', () => {
    expect(CHART_CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
