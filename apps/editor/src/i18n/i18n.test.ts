// The editor's catalogs, and the screens that use them.
//
// - Every message parses, and a translation takes the same parameters as
//   the English (catalogProblems).
// - A command's English title is its catalog message, so the palette's two
//   languages and docs/keybindings.md say the same thing.
// - The markup scan: a converted screen has no words written into its
//   markup, where no language switch can reach them. Brand names and key
//   caps (<kbd>) are words in every language.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { catalogProblems } from '@ez2bms/chart-core';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { registerBuiltins } from '../commands/builtin';
import { registerClassicCommands } from '../commands/classic';
import { registerNoteCommands } from '../commands/notes';
import { registerPlayCommands } from '../commands/play';
import { registerPortCommands } from '../commands/port';
import { registerSliceCommands } from '../commands/slice';
import { app } from '../state/app.svelte';
import { editorCatalogs, i18n, t, tEn } from './i18n.svelte';

const SRC = resolve(import.meta.dirname, '..');

/** Screens already in the catalog: the scan is strict for these (M9.5 makes it every screen). */
const STRICT = [
  'ui/App.svelte',
  'ui/AboutDialog.svelte',
  'ui/CommandPalette.svelte',
  'ui/PrefsDialog.svelte',
  'ui/StartScreen.svelte',
  'ui/StatusBar.svelte',
  'ui/TopBar.svelte',
  'ui/UpdateDialog.svelte',
  'ui/drawers/Drawer.svelte',
  'ui/drawers/RightDrawer.svelte',
];

/** Attributes a person reads (or a screen reader says). */
const READ_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label']);
/** Words that are the same in every language: names of things. */
const SAME_EVERYWHERE = /^(EZ2BMS|EZ2PORT|EZ2AC|EZ2|BMS|bmson)$/;
/** Elements whose text is a key cap or code, not a sentence. */
const VERBATIM = new Set(['kbd', 'code']);

interface Node {
  type?: string;
  name?: string;
  data?: string;
  value?: unknown;
  start?: number;
  [k: string]: unknown;
}

const hasWords = (s: string) => {
  const words = s.trim().match(/[\p{L}][\p{L}\p{N}'’.-]*/gu) ?? [];
  return words.some((w) => !SAME_EVERYWHERE.test(w));
};

/** Text written into a component's markup: `line: text` for each. */
export function writtenText(source: string): string[] {
  const ast = parse(source, { modern: true }) as unknown as { fragment: Node };
  const found: string[] = [];
  const line = (n: Node) => source.slice(0, n.start ?? 0).split('\n').length;
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const node = n as Node;
    if (node.type === 'RegularElement' && VERBATIM.has(node.name ?? '')) return;
    // style:width="{w}px" is CSS.
    if (node.type === 'StyleDirective') return;
    if (node.type === 'Text' && hasWords(node.data ?? ''))
      found.push(`${line(node)}: ${node.data!.trim()}`);
    if (node.type === 'Attribute' && READ_ATTRS.has(node.name ?? '') && Array.isArray(node.value))
      for (const v of node.value as Node[])
        if (v.type === 'Text' && hasWords(v.data ?? ''))
          found.push(`${line(node)}: ${node.name}="${v.data!.trim()}"`);
    for (const [k, v] of Object.entries(node)) if (k !== 'type' && k !== 'value') walk(v);
    // An attribute's value is walked above (its text) or is an expression.
    if (node.type !== 'Attribute') walk(node.value);
  };
  walk(ast.fragment);
  return found;
}

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

  it('switch language live, English standing in for what is not translated yet', () => {
    try {
      i18n.apply('ja');
      expect(t('prefs.language')).toBe('言語');
      expect(t('top.charts')).toBe('Charts');
      expect(tEn('prefs.language')).toBe('Language');
      i18n.apply('en', true);
      expect(t('prefs.language')).toBe('⟦Långüågé⟧');
      expect(t('status.notes', { n: 1 })).toBe('⟦1 nøté⟧');
    } finally {
      i18n.apply('en');
    }
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
    // The palette finds a translated command by its English title too.
    try {
      i18n.apply('ja');
      const about = app.commands.search('About EZ2BMS')[0]!.cmd;
      expect(about.id).toBe('help.about');
      expect(app.commands.titleOf(about)).toBe('EZ2BMS について');
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

  it('finds none in the screens already converted', () => {
    const left: string[] = [];
    for (const f of STRICT) {
      const text = writtenText(readFileSync(join(SRC, f), 'utf8'));
      left.push(...text.map((s) => `${f}:${s}`));
    }
    expect(left).toEqual([]);
  });

  it('knows every screen (so M9.5 can make it strict everywhere)', () => {
    const all = svelteFiles(join(SRC, 'ui')).map((f) => relative(SRC, f));
    for (const f of STRICT) expect(all).toContain(f);
  });
});
