// The markup scan: words written into a component's markup, where no
// language switch can reach them. Brand names and key caps (<kbd>) are
// words in every language. i18n.test.ts runs it on every screen;
// scan-files.test.ts on the files named in SCAN_FILES, while converting.

import { parse } from 'svelte/compiler';

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
