// Publish into the real songs folder, safely.
//
// Before writing, the target is inspected: a package with the key of a song
// the game ships would take that song over in every mode (every resolver in
// EZ2PORT asks the package first), so that is refused outright; a package
// another tool or song made is only replaced when you say so; the song's own
// earlier publish is simply updated. The replaced package goes to the songs
// folder's .ez2bms-backup (EZ2PORT skips dot-folders). Ranking tables EZ2PORT
// wrote into the package are kept for every chart that did not change.

import {
  keptRankings,
  packageOwner,
  rankedChartFiles,
  rankingFile,
  readSongIni,
} from '@ez2bms/chart-core';
import { joinPath, type Inspection } from '../bridge';
import type { App } from '../state/app.svelte';
import { ask, toast } from '../state/toasts.svelte';
import { buildPackage } from './package';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export async function publishSong(app: App, root: string): Promise<void> {
  const p = app.project!;
  // A song id tells this song's packages from anyone else's (song.ini [EZ2BMS]).
  p.sidecar.id ??= crypto.randomUUID();
  await p.saveAll();
  const { spec } = buildPackage(app, {
    art: await app.art.packageArt(p),
    preview: app.preview.packageJob(p),
  });
  const key = spec.key;
  const seen = await app.backend.port.inspect(root, key, app.settings.data.gameRoot);
  if (seen.shipped)
    throw new Error(
      `"${key}" is the key of a song the game ships: EZ2PORT would play this package in its place everywhere. Choose another key.`,
    );
  const owner = packageOwner(
    { exists: !!seen.folder, songIni: seen.song_ini ?? undefined },
    p.sidecar.id,
    readSongIni,
  );
  const go = () =>
    write(app, root, spec, seen).catch((e: unknown) =>
      toast(`Publish failed: ${e instanceof Error ? e.message : String(e)}`, 'error'),
    );
  if (owner === 'foreign') {
    ask(
      `${seen.folder} in the songs folder is another song's package. Replace it? (It is kept in .ez2bms-backup.)`,
      { label: 'Replace', run: () => void go() },
    );
    return;
  }
  if (owner === 'legacy') {
    ask(`${seen.folder} was published by an earlier EZ2BMS. Replace it with this song?`, {
      label: 'Replace',
      run: () => void go(),
    });
    return;
  }
  await write(app, root, spec, seen);
}

async function write(
  app: App,
  root: string,
  spec: ReturnType<typeof buildPackage>['spec'],
  seen: Inspection,
): Promise<void> {
  const p = app.project!;
  const key = spec.key;
  // Which scores still mean the same: those of charts whose .ez and .ini are unchanged.
  const dir = seen.folder ? joinPath(root, seen.folder) : '';
  const old = new Map<string, Uint8Array | undefined>();
  for (const n of rankedChartFiles(key, seen.files))
    old.set(n, await app.backend.readFile(joinPath(dir, n)).catch(() => undefined));
  const carry = keptRankings({
    key,
    oldNames: seen.files,
    old: (n) => old.get(n),
    files: spec.files,
  });
  const reset = seen.files.filter((n) => rankingFile(n, key) && !carry.includes(n));
  const r = await app.backend.port.publish(root, spec, {
    carry,
    expect: { song_ini: seen.song_ini },
    backup: true,
  });
  const scores = [
    carry.length ? `kept ${plural(carry.length, 'ranking table')}` : '',
    reset.length ? `reset ${reset.length} for changed charts` : '',
  ]
    .filter(Boolean)
    .join(', ');
  toast(`Published ${key}: ${r.files} files in ${r.dir}${scores ? ` (${scores})` : ''}`, 'ok');
  if (r.missing.length) toast(`${r.missing.length} keysound source(s) could not be read`, 'warn');
  const before = p.sidecar.published;
  p.sidecar.published = { root, key };
  await p.saveSidecar();
  if (before && before.root === root && before.key !== key) void offerRetire(app, root, before.key);
}

/** The song's package under its old key is still on the wheel: offer to take it off. */
async function offerRetire(app: App, root: string, oldKey: string): Promise<void> {
  const p = app.project!;
  const seen = await app.backend.port.inspect(root, oldKey, null).catch(() => undefined);
  if (!seen?.folder || seen.song_ini === null) return;
  if (packageOwner({ exists: true, songIni: seen.song_ini }, p.sidecar.id!, readSongIni) !== 'ours')
    return;
  ask(`This song is still in the songs folder as "${oldKey}" too. Remove that copy?`, {
    label: 'Remove',
    run: () =>
      void app.backend.port
        .retire(root, oldKey, seen.song_ini!)
        .then(() => toast(`Removed ${oldKey} (kept in .ez2bms-backup)`, 'ok'))
        .catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error')),
  });
}
