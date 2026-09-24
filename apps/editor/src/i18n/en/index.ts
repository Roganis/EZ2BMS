// The editor's English: the source every translation is typed against.
// One file per area, so each can be worked on alone.

import { drawers } from './drawers';
import { edit } from './edit';
import { help } from './help';
import { host } from './host';
import { play } from './play';
import { port } from './port';
import { shell } from './shell';
import { song } from './song';
import { transfer } from './transfer';

export const en = {
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

export type MessageKey = keyof typeof en;
