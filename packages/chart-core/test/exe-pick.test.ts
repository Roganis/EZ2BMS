// Which executable the game's tables are read from. song.bin's tables carry
// no digest and any program of the era maps their address, so a candidate
// is proved on the game's own song.bin (it must decrypt to EZSL).

import { describe, expect, it } from 'vitest';
import { synthGame, synthPe } from '../src/dev/synthgame';
import { SONGDB_TABLE_VA } from '../src/ez2data/songdb';
import { memoryGameFs, openGame, pickExe } from '../src/io/ez/game';

describe('pickExe', () => {
  const g = synthGame();
  const fs = memoryGameFs(g.files);
  // Another program: the same address mapped, other bytes there.
  const decoy = synthPe([{ va: SONGDB_TABLE_VA, bytes: new Uint8Array(64).fill(0x5a) }]);

  it('proves each candidate on the song.bin, and takes the one that decrypts it', async () => {
    const pick = await pickExe(fs, [
      { name: 'launcher.exe', bytes: decoy },
      { name: 'ez2ac.exe', bytes: g.exe },
    ]);
    expect(pick.exe?.name).toBe('ez2ac.exe');
    expect(pick.checks).toEqual([
      { name: 'launcher.exe', keys: false, songdb: false },
      { name: 'ez2ac.exe', keys: false, songdb: true },
    ]);
    // And the game it picks opens: every mode's song.bin reads.
    const game = await openGame(fs, pick.exe!.bytes);
    expect(game.problems.filter((p) => p.includes('song.bin'))).toEqual([]);
    expect(game.songs.length).toBeGreaterThan(0);
  });

  it('picks none when none decrypts it, and says so per candidate', async () => {
    const pick = await pickExe(fs, [
      { name: 'launcher.exe', bytes: decoy },
      { name: 'readme.exe', bytes: new TextEncoder().encode('not a program') },
    ]);
    expect(pick.exe).toBeUndefined();
    expect(pick.checks.map((c) => c.songdb)).toEqual([false, false]);
  });

  it('with no candidates, none', async () => {
    expect(await pickExe(fs, [])).toEqual({ checks: [] });
  });
});
