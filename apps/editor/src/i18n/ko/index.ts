// The editor in Korean, one file per area as the English. Typed against
// the English: a key English does not have, or one it has that is not
// translated, is a type error. Drafted by an AI, for a native speaker to
// review (AI-DISCLOSURE.md); the words chosen are in docs/i18n-glossary.md.

import type { MessageKey } from '../en';
import { drawers } from './drawers';
import { edit } from './edit';
import { help } from './help';
import { host } from './host';
import { play } from './play';
import { port } from './port';
import { shell } from './shell';
import { song } from './song';
import { transfer } from './transfer';

export const ko: Record<MessageKey, string> = {
  ...shell,
  ...help,
  ...host,
  ...drawers,
  ...edit,
  ...play,
  ...port,
  ...song,
  ...transfer,
};
