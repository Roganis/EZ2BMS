// Song titles, from EZ2PORT's text manifest.
//
// The game has no song titles as text: the wheel shows each song's title
// plate, a bitmap. EZ2PORT's drop-in draws those plates natively from a
// manifest (text/manifest.songs.ini beside ez2play, TEXT.md sections 3 and 7)
// whose lines carry each title as a literal:
//
//   [system/songname/10anti.abm]
//   size = 256,32
//   line = "AntiDOT" | 246,22,9 | bold | ffffff | right | 236
//
// So an imported original gets its title from the user's own port install,
// read at run time - nothing of it is committed here. The reading follows
// textspec.c read_manifest/parse_line: a `;` outside quotes starts a comment,
// a section is the plate's path (either slash, any case, .bmp or .abm), the
// first quoted line is the title and a second the subtitle, the quotes being
// the outermost pair of the line's first field.

export interface SongTitle {
  title: string;
  subtitle?: string;
}

function stripComment(s: string): string {
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') quoted = !quoted;
    else if (s[i] === ';' && !quoted) return s.slice(0, i);
  }
  return s;
}

const trim = (s: string) => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');

/** Song key (lower case) -> title, from a manifest's `system/songname/<key>` sections. */
export function parseSongTitles(text: string): Map<string, SongTitle> {
  const out = new Map<string, SongTitle>();
  let key: string | undefined;
  for (const raw of text.replace(/^\uFEFF/, '').split('\n')) {
    const s = trim(stripComment(raw));
    if (!s) continue;
    if (s[0] === '[') {
      const close = s.indexOf(']');
      if (close < 0) continue;
      const m = /^system[/\\]songname[/\\]([^/\\]+)\.(abm|bmp)$/i.exec(trim(s.slice(1, close)));
      key = m ? m[1]!.toLowerCase() : undefined;
      continue;
    }
    const eq = s.indexOf('=');
    if (eq < 0 || !key || trim(s.slice(0, eq)) !== 'line') continue;
    const first = trim(trim(s.slice(eq + 1)).split('|')[0] ?? '');
    if (first[0] !== '"') continue; // a strings key, not words
    const end = first.lastIndexOf('"');
    const words = end > 0 ? first.slice(1, end) : first.slice(1);
    const t = out.get(key);
    if (!t) out.set(key, { title: words });
    else if (t.subtitle === undefined) t.subtitle = words;
  }
  return out;
}
