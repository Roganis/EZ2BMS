// Every screen in the pseudo-language: each message from a catalog comes
// out marked ⟦so⟧, so any English word left outside the marks was written
// into the code, or came from somewhere that skips the catalogs. Names
// (EZ2PORT, KOOL, a mode's), the demo song's own data and key caps are
// words in every language and are let through.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

/** Words that are the same in every language: names, units, and the demo song's data. */
const SAME = [
  // Names of things.
  'EZ2BMS',
  'EZ2PORT',
  'EZ2AC',
  'EZ2',
  'BMS',
  'BME',
  'bmson',
  'BGA',
  'BPM',
  'STOP',
  'KOOL',
  'COOL',
  'GOOD',
  'MISS',
  'FAIL',
  'NM',
  'HD',
  'SHD',
  'EX',
  'SDL',
  'GPL',
  'UTF',
  'JIS',
  'EUC',
  'KR',
  'CP',
  'PNG',
  'JPEG',
  'BMP',
  'MIDI',
  'ez2play',
  // The modes and their short names (modes/ids.ts).
  '\\d*K',
  'STANDARD',
  'ONLY',
  'RUBY',
  'CLUB',
  'SPACE',
  'SCRATCH',
  'STREET',
  'ANDROMEDA',
  'CATCH',
  '[A-Z][a-z]*Mix',
  'Andromeda',
  'Catch',
  'StreetMix',
  // Units.
  'ms',
  'kHz',
  'Hz',
  'MB',
  'KB',
  'px',
  'dBFS',
  'x',
  // The level categories, LV1 … LV17 (song/categories.ts makes them).
  'LV\\d+',
  // A picture's size (480x360) and the plate designer's swatch sample.
  'x\\d+',
  'Aa',
  // Key caps and lane codes.
  'Ctrl',
  'Shift',
  'Alt',
  'Esc',
  'Tab',
  'Space',
  'Enter',
  'TT',
  'PD',
  'E[1-4]',
  'P[12]',
];
const SAME_RE = new RegExp(`^(${SAME.join('|')})$`);

/**
 * The game's own names, read from chart-core: category labels (HOT, LV1 …)
 * and mode labels (7 KEY …) are the cabinet's, in every language.
 */
function gameNames(): string[] {
  const src = (f: string) =>
    readFileSync(resolve(import.meta.dirname, '../../../../packages/chart-core/src', f), 'utf8');
  const categories = [
    ...src('song/categories.ts').matchAll(/\['([^']+)', '[a-z]+'\]|'([A-Z]{2,3}\+?)'/g),
  ];
  const modes = [...src('modes/ids.ts').matchAll(/label: '([^']+)'/g)];
  // keys.ini's channel names (Key1, Scratch1, Turntable …): the port reads them as written.
  const channels = [...src('input/keyconf.ts').matchAll(/'([A-Z][A-Za-z0-9]*)'/g)];
  return [...categories, ...modes, ...channels].map((m) => (m[1] ?? m[2])!);
}

/**
 * Visible text and read attributes with English words outside the ⟦marks⟧.
 * A sentence with markup inside (a key cap, a bold value) is several text
 * nodes, so the marks are followed across its block: a text node's words
 * count only where they lie outside every ⟦…⟧ of the block around them.
 */
async function leftovers(page: Page, data: string[]): Promise<string[]> {
  return page.evaluate(
    ({ same, data }) => {
      const sameRe = new RegExp(same);
      const esc = (d: string) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const anyOf = (ds: string[]) =>
        ds.length
          ? new RegExp(`(?<![A-Za-z0-9])(${ds.map(esc).join('|')})(?![A-Za-z0-9])`, 'g')
          : null;
      const dataRe = anyOf(data);
      // Paths and titles with spaces go first: a path's spaces would split it.
      const spacedRe = anyOf(data.filter((d) => /[\s/\\]/.test(d)));
      const out = new Set<string>();
      const shown = (el: Element | null): boolean => {
        for (let e = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        }
        return !!el && (el as HTMLElement).getClientRects().length > 0;
      };
      const blockOf = (el: Element): Element => {
        for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
          const d = getComputedStyle(e).display;
          if (d !== 'inline' && d !== 'contents') return e;
        }
        return document.body;
      };
      const words = (text: string): string[] => {
        // Paths and titles with spaces, then any file name or path (a chart's
        // file holds the song key), then the rest of the data.
        let rest = spacedRe ? text.replace(spacedRe, ' ') : text;
        rest = rest.replace(/\S*[/\\]\S*|\S+\.[A-Za-z0-9]{1,5}\b/g, ' ');
        if (dataRe) rest = rest.replace(dataRe, ' ');
        return (rest.match(/[A-Za-z][A-Za-z0-9']*/g) ?? []).filter(
          (w) => w.length > 1 && !sameRe.test(w),
        );
      };
      const where = (el: Element) =>
        `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}`;

      // Text: each block's text nodes in order, with the depth of ⟦ at each character.
      const blocks = new Map<Element, Text[]>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const el = n.parentElement;
        if (!el || !n.data.trim() || el.closest('script, style')) continue;
        const b = blockOf(el);
        blocks.set(b, [...(blocks.get(b) ?? []), n]);
      }
      for (const [b, nodes] of blocks) {
        let depth = 0;
        for (const n of nodes) {
          let outside = '';
          for (const ch of n.data) {
            if (ch === '⟦') depth++;
            else if (ch === '⟧') depth = Math.max(0, depth - 1);
            else outside += depth ? ' ' : ch;
          }
          const el = n.parentElement!;
          // Key caps, code, and a binding's key names (SDL's, as keys.ini writes them).
          if (el.closest('kbd, code, [data-testid="binding-token"]')) continue;
          if (el.tagName === 'OPTION' ? !shown(el.closest('select')) : !shown(el)) continue;
          const w = words(outside);
          if (w.length)
            out.add(`${where(b)}: ${b.textContent!.trim().slice(0, 90)}  <- ${w.join(' ')}`);
        }
      }
      for (const el of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
        if (!shown(el)) continue;
        for (const a of ['title', 'aria-label', 'placeholder']) {
          const v = el.getAttribute(a);
          if (!v) continue;
          const w = words(v.replace(/⟦[^⟧]*⟧/g, ' '));
          if (w.length) out.add(`${where(el)} ${a}: ${v.slice(0, 90)}  <- ${w.join(' ')}`);
        }
      }
      return [...out];
    },
    { same: SAME_RE.source, data },
  );
}

const run = (page: Page, id: string) =>
  page.evaluate((id) => (window as unknown as W).__ez2bms.commands.run(id), id);

test('every screen says what it says through the catalogs', async ({ page }) => {
  test.setTimeout(120_000);
  const found: string[] = [];
  const sweep = async (screen: string) => {
    await page.waitForTimeout(150);
    for (const l of await leftovers(page, data)) found.push(`${screen} | ${l}`);
  };
  // The demo song's own words (bridge/demo.ts): titles, names, sounds; the
  // game's names; each language named in itself (Preferences).
  // The browser build's host says "web" for its version and system (bridge/web.ts).
  // Encodings go by their standard names.
  const fixed = [
    ...gameNames(),
    'English',
    '한국어',
    '日本語',
    'web',
    'shift_jis',
    'euc-kr',
    'utf-8',
  ];
  let data: string[] = fixed;

  await page.goto('/?e2e&pseudo');
  await expect(page.getByTestId('open-folder')).toBeVisible();
  await sweep('start');

  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  data = await page
    .evaluate(() => {
      const a = (window as unknown as W).__ez2bms;
      const dir: string = a.project.dir;
      const words: string[] = [dir, dir.split('/').pop()!, a.project.sidecar.key];
      for (const c of a.project.charts) {
        const i = c.doc.data.info;
        words.push(c.file, i.title, i.subtitle, i.artist, i.genre, i.chartName);
        // A sound's name, and the words in it (the workbench groups by them).
        for (const ch of c.doc.data.channels)
          words.push(ch.name, ...ch.name.replace(/\.[^.]+$/, '').split(/[^A-Za-z0-9]+/));
      }
      return words.filter((w: unknown): w is string => typeof w === 'string' && w.length > 1);
    })
    .then((w) => [...fixed, ...w]);
  await sweep('editor');

  await run(page, 'view.left');
  await sweep('sounds drawer');
  await run(page, 'view.left');
  for (const [id, name] of [
    ['view.inspector', 'notes'],
    ['view.chartInfo', 'chart info'],
    ['view.timing', 'timing'],
    ['view.issues', 'issues'],
    ['view.port', 'EZ2PORT'],
  ] as const) {
    await run(page, id);
    await sweep(name);
  }
  await run(page, 'view.port');

  await run(page, 'view.songManager');
  for (const tab of ['charts', 'plate', 'art', 'preview', 'bga', 'wheel']) {
    await page.getByTestId(`song-tab-${tab}`).click();
    await sweep(`song manager: ${tab}`);
  }
  await page.keyboard.press('Escape');

  await run(page, 'view.workbench');
  await sweep('workbench');
  await page.keyboard.press('Escape');

  for (const [id, name] of [
    ['port.publish', 'publish'],
    ['file.exportCabinet', 'export: cabinet'],
    ['file.exportBms', 'export: BMS'],
    ['file.import', 'import'],
    ['input.controls', 'controls'],
    ['chart.new', 'new chart'],
    ['help.about', 'about'],
    ['app.preferences', 'preferences'],
  ] as const) {
    await run(page, id);
    await sweep(name);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }

  await page.keyboard.press('Control+k');
  await sweep('palette');
  await page.keyboard.press('Escape');

  expect(found).toEqual([]);
});
