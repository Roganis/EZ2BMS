// chart-core's messages in English: the source every translation is typed
// against. One file per area.

import { edit } from './edit';
import { io } from './io';
import { lint } from './lint';
import { publish } from './publish';

export const coreEn = {
  ...lint,
  ...publish,
  ...io,
  ...edit,
};

export type CoreKey = keyof typeof coreEn;
