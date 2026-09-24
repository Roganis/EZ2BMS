// Korean: see en/host.ts. Terms follow docs/i18n-glossary.md.

import type { host as en } from '../en/host';

export const host: Partial<Record<keyof typeof en, string>> = {};
