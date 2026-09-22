// docs/keybindings.md is generated from the command registry, so it cannot
// drift: this test rebuilds it and compares. KEYS_UPDATE=1 rewrites it.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { app } from '../state/app.svelte';
import { registerBuiltins } from './builtin';
import { registerNoteCommands } from './notes';
import { registerPlayCommands } from './play';
import { registerPortCommands } from './port';
import type { CommandGroup } from './registry';

const DOC = resolve(import.meta.dirname, '../../../../docs/keybindings.md');
const GROUPS: CommandGroup[] = [
  'File',
  'Edit',
  'Notes',
  'Timing',
  'View',
  'Play',
  'Chart',
  'EZ2PORT',
];
const pretty = (k: string) =>
  k
    .replace(/^Mod\+/, 'Ctrl+')
    .replace(/\+Mod\+/, '+Ctrl+')
    .replace('Arrow', '');

function render(): string {
  registerBuiltins(app);
  registerNoteCommands(app);
  registerPlayCommands(app);
  registerPortCommands(app);
  const lines = [
    '# Keys and commands',
    '',
    '<!-- Generated from the command registry by apps/editor/src/commands/keybindings.test.ts',
    '     (KEYS_UPDATE=1 pnpm --filter @ez2bms/editor test). Do not edit by hand. -->',
    '',
    'Every action is a command: Ctrl+K finds any of them by name, and the ones',
    'with a verb take an argument there (`goto 32`, `bpm 174`, `snap 1/12`).',
    'On macOS, Ctrl is Cmd. Keys can be rebound in the settings file (`keys`).',
    '',
    'While playing in the Play view (test play), the game keys belong to the',
    "game: EZ2PORT's defaults (Z S X D C V B, Ctrl/Shift, Space, F G H J; 2P on",
    'M K , L . / ;) or your own `<game>/ez2port/keys.ini`. Esc ends the run.',
  ];
  for (const g of GROUPS) {
    const cmds = app.commands
      .all()
      .filter((c) => c.group === g && !/^chart\.select[2-9]$/.test(c.id))
      .sort((a, b) => a.title.localeCompare(b.title));
    if (!cmds.length) continue;
    lines.push('', `## ${g}`, '', '| Command | Keys | Palette |', '| --- | --- | --- |');
    for (const c of cmds) {
      const title = c.id === 'chart.select1' ? 'Switch to chart 1-9' : c.title;
      const keys =
        c.id === 'chart.select1' ? 'Ctrl+1 … Ctrl+9' : (c.keys ?? []).map(pretty).join(', ');
      lines.push(
        `| ${title} | ${
          keys
            ? keys
                .split(', ')
                .map((k) => `\`${k}\``)
                .join(' ')
            : ''
        } | ${c.verb ? `\`${c.verb} ${c.argHint ?? ''}\`` : ''} |`,
      );
    }
  }
  return lines.join('\n') + '\n';
}

describe('keybindings doc', () => {
  it('matches the command registry', async () => {
    let md = render();
    // Format as the repo does so the file stays prettier-clean.
    const prettier = await import('prettier');
    md = await prettier.format(md, { parser: 'markdown', proseWrap: 'preserve' });
    if (process.env.KEYS_UPDATE) writeFileSync(DOC, md);
    expect(readFileSync(DOC, 'utf8')).toBe(md);
  });
});
