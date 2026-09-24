// The editor's English: the source every translation is typed against.
// One file per area, so each can be worked on alone.

import { help } from './help';
import { shell } from './shell';

export const en = {
  ...shell,
  ...help,
};

export type MessageKey = keyof typeof en;
