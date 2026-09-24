// chart-core's messages in Japanese, one file per area as the English.
// Typed against the English: a message not translated is a type error.
// Drafted by an AI, for a native speaker to review (AI-DISCLOSURE.md).

import type { CoreKey } from '../en';
import { edit } from './edit';
import { io } from './io';
import { lint } from './lint';
import { publish } from './publish';

export const coreJa: Record<CoreKey, string> = {
  ...lint,
  ...publish,
  ...io,
  ...edit,
};
