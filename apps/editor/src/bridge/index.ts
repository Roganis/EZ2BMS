import { tauriBackend } from './tauri';
import type { Backend } from './types';
import { demoFiles } from './demo';
import { webBackend } from './web';

export * from './types';

/** The desktop backend inside Tauri, the in-memory one anywhere else. */
export function createBackend(): Backend {
  if ('__TAURI_INTERNALS__' in window) return tauriBackend();
  const q = new URLSearchParams(location.search);
  return webBackend(demoFiles(q.has('modes'), q.has('bench')));
}
