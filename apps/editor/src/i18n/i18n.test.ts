// The editor's catalogs, and the screens that use them.
//
// - Every message parses, and a translation takes the same parameters as
//   the English (catalogProblems).
// - A command's English title is its catalog message, so the palette's two
//   languages and docs/keybindings.md say the same thing.
// - The markup scan: no screen has words written into its markup, where no
//   language switch can reach them. Brand names and key caps (<kbd>) are
//   words in every language.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { catalogProblems } from '@ez2bms/chart-core';
import { describe, expect, it } from 'vitest';
import { registerBuiltins } from '../commands/builtin';
import { registerClassicCommands } from '../commands/classic';
import { registerNoteCommands } from '../commands/notes';
import { registerPlayCommands } from '../commands/play';
import { registerPortCommands } from '../commands/port';
import { registerSliceCommands } from '../commands/slice';
import { app } from '../state/app.svelte';
import { editorCatalogs, i18n, t, tEn, tParts } from './i18n.svelte';
import { writtenText } from './scan';

const SRC = resolve(import.meta.dirname, '..');

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? svelteFiles(join(dir, e.name))
      : e.name.endsWith('.svelte')
        ? [join(dir, e.name)]
        : [],
  );
}

describe('the catalogs', () => {
  it('parse, and translations take the English parameters', () => {
    const { en, ko, ja } = editorCatalogs;
    expect(catalogProblems(en, { ko, ja })).toEqual([]);
  });

  // English standing in for a message not translated is chart-core's
  // Catalogs, tested there (test/i18n.test.ts).
  it('switch language live, English still at hand', () => {
    try {
      i18n.apply('ja');
      expect(t('prefs.language')).toBe('言語');
      expect(tEn('prefs.language')).toBe('Language');
      i18n.apply('en', true);
      expect(t('prefs.language')).toBe('⟦Långüågé⟧');
      expect(t('status.notes', { n: 1 })).toBe('⟦1 nøté⟧');
    } finally {
      i18n.apply('en');
    }
  });

  it('leave slots for markup, in the order the language puts them', () => {
    try {
      i18n.apply('en', true);
      expect(tParts('top.willSaveAs', { file: 'a.bmson' }, ['file'])).toEqual([
        { text: '⟦wïll bé såvéd ås ' },
        { slot: 'file' },
        { text: '⟧' },
      ]);
    } finally {
      i18n.apply('en');
    }
    expect(tParts('palette.none', { query: 'x' }, ['query'])).toEqual([
      { text: 'No command matches “' },
      { slot: 'query' },
      { text: '”' },
    ]);
  });

  it("hold every command's title the palette translates", () => {
    registerBuiltins(app);
    registerNoteCommands(app);
    registerPlayCommands(app);
    registerPortCommands(app);
    registerClassicCommands(app);
    registerSliceCommands(app);
    const ids = new Set(app.commands.all().map((c) => c.id));
    for (const key of Object.keys(editorCatalogs.en).filter((k) => k.startsWith('cmd.'))) {
      const id = key.slice(4);
      expect(ids, `${key} names no command`).toContain(id);
      expect(app.commands.get(id)!.title).toBe(tEn(key as never));
    }
    // Every command's title is in the catalog: the palette can say each one.
    const untranslated = app.commands.all().filter((c) => app.commands.localize(c) === undefined);
    expect(untranslated.map((c) => c.id)).toEqual([]);
    // The palette finds a translated command by its English title too.
    try {
      i18n.apply('ja');
      const about = app.commands.search('About EZ2BMS')[0]!.cmd;
      expect(about.id).toBe('help.about');
      expect(app.commands.titleOf(about)).toBe('EZ2BMSについて');
      expect(app.commands.search('環境設定')[0]!.cmd.id).toBe('app.preferences');
    } finally {
      i18n.apply('en');
    }
  });
});

describe('the markup scan', () => {
  it('finds words written into markup', () => {
    const src = `<script>let x = 'not markup';</script>
<p class="a">Hello {x}</p>
<button title="Undo (Ctrl+Z)" aria-label={x}>↶</button>
<kbd>Ctrl K</kbd> <h2>EZ2BMS</h2> <span>{x} · 12%</span>
{#if x}<i>Loading…</i>{:else}<b>{x}</b>{/if}`;
    expect(writtenText(src)).toEqual(['2: Hello', '3: title="Undo (Ctrl+Z)"', '5: Loading…']);
  });

  it('finds none in any screen', () => {
    const left: string[] = [];
    for (const f of svelteFiles(join(SRC, 'ui'))) {
      const text = writtenText(readFileSync(f, 'utf8'));
      left.push(...text.map((s) => `${relative(SRC, f)}:${s}`));
    }
    expect(left).toEqual([]);
  });
});
