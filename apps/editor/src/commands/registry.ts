// Every action in the editor is a command: it has a title, optional keys and
// an optional palette verb that takes an inline argument ("goto 32", "bpm 174",
// "snap 1/12"). Keys, the palette and buttons all run commands, so they never
// disagree about what a thing does.

export type CommandGroup =
  'File' | 'Edit' | 'View' | 'Play' | 'Notes' | 'Timing' | 'Chart' | 'EZ2PORT' | 'Help';

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  /** Default keys, e.g. 'Mod+Z', 'Shift+Tab', 'Space', 'Alt+ArrowLeft'. */
  keys?: string[];
  /** Palette verb taking an argument: typing "<verb> <arg>" runs it. */
  verb?: string;
  argHint?: string;
  /** Runs even while typing in a text field (only Mod combos should). */
  global?: boolean;
  enabled?: () => boolean;
  run: (arg?: string) => unknown;
}

export interface Match {
  cmd: Command;
  arg?: string;
  score: number;
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** A KeyboardEvent as a combo string: 'Mod+Shift+Z', 'Alt+ArrowLeft', 'Space', '['. */
export function keyOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (IS_MAC ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (IS_MAC && e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  let k = e.key;
  if (k === ' ') k = 'Space';
  else if (k.length === 1) {
    // Letters by their key; with Shift, the shifted character is not the name.
    if (/^[a-z]$/i.test(k)) k = k.toUpperCase();
    else if (e.code.startsWith('Digit')) k = e.code.slice(5);
  }
  if (e.shiftKey && !(k.length === 1 && !/^[A-Z0-9]$/.test(k))) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

/** 'Mod+Shift+Z' -> 'Ctrl+Shift+Z' (or the Mac symbols). */
export function formatKey(k: string): string {
  const names: Record<string, string> = {
    Mod: IS_MAC ? '⌘' : 'Ctrl',
    Alt: IS_MAC ? '⌥' : 'Alt',
    Shift: IS_MAC ? '⇧' : 'Shift',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    PageUp: 'PgUp',
    PageDown: 'PgDn',
    Delete: 'Del',
    Backspace: '⌫',
  };
  return k
    .split('+')
    .map((p) => names[p] ?? p)
    .join(IS_MAC ? '' : '+');
}

/** Subsequence match: every query character in order; tighter and earlier is better. */
export function fuzzy(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  const at = t.indexOf(q);
  if (at >= 0) return 100 - at + (at === 0 || t[at - 1] === ' ' ? 50 : 0);
  let ti = 0;
  let score = 0;
  let run = 0;
  for (const c of q) {
    const found = t.indexOf(c, ti);
    if (found < 0) return 0;
    run = found === ti ? run + 1 : 0;
    score += 1 + run * 2 - Math.min(found - ti, 5) * 0.2;
    ti = found + 1;
  }
  return score;
}

export class Commands {
  private readonly map = new Map<string, Command>();
  private keyIndex = new Map<string, string>();
  private overrides: Record<string, string[]> = {};
  onError: (e: unknown, cmd: Command) => void = (e) => console.error(e);

  register(...cmds: Command[]): void {
    for (const c of cmds) this.map.set(c.id, c);
    this.reindex();
  }

  /** User rebinds: command id -> keys (replacing the defaults). */
  setOverrides(o: Record<string, string[]>): void {
    this.overrides = o;
    this.reindex();
  }

  private reindex(): void {
    this.keyIndex = new Map();
    for (const c of this.map.values())
      for (const k of this.keysFor(c.id)) this.keyIndex.set(k, c.id);
  }

  keysFor(id: string): string[] {
    return this.overrides[id] ?? this.map.get(id)?.keys ?? [];
  }

  get(id: string): Command | undefined {
    return this.map.get(id);
  }

  all(): Command[] {
    return [...this.map.values()];
  }

  isEnabled(c: Command): boolean {
    return !c.enabled || c.enabled();
  }

  run(id: string, arg?: string): boolean {
    const c = this.map.get(id);
    if (!c || !this.isEnabled(c)) return false;
    try {
      const r = c.run(arg);
      if (r instanceof Promise) r.catch((e: unknown) => this.onError(e, c));
    } catch (e) {
      this.onError(e, c);
    }
    return true;
  }

  /**
   * Run the command bound to this key, if any. True when handled. `globalOnly`
   * while something covers the chart (the workbench): only app-wide keys act.
   */
  handleKey(e: KeyboardEvent, globalOnly = false): boolean {
    const id = this.keyIndex.get(keyOf(e));
    if (!id) return false;
    const c = this.map.get(id)!;
    if (globalOnly && !c.global) return false;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (typing && !c.global) return false;
    if (!this.isEnabled(c)) return false;
    e.preventDefault();
    this.run(id);
    return true;
  }

  /** Palette search. "bpm 174" finds the command with verb "bpm", argument "174". */
  search(query: string, limit = 12): Match[] {
    const q = query.trim();
    const sp = q.indexOf(' ');
    const head = (sp < 0 ? q : q.slice(0, sp)).toLowerCase();
    const rest = sp < 0 ? undefined : q.slice(sp + 1).trim();
    const out: Match[] = [];
    for (const c of this.map.values()) {
      if (!this.isEnabled(c)) continue;
      if (c.verb && head === c.verb) {
        out.push({ cmd: c, ...(rest ? { arg: rest } : {}), score: 1000 });
        continue;
      }
      const s = Math.max(
        fuzzy(q, c.title) * 2,
        fuzzy(q, `${c.group} ${c.title}`),
        c.verb ? fuzzy(q, c.verb) : 0,
      );
      if (s > 0) out.push({ cmd: c, score: s });
    }
    return out
      .sort((a, b) => b.score - a.score || a.cmd.title.localeCompare(b.cmd.title))
      .slice(0, limit);
  }
}
