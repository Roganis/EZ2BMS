#!/usr/bin/env node
// Fetch the fonts too large to commit (fonts/README.md): Noto Sans CJK Bold,
// for title plates in Korean, Japanese and Chinese. Pinned by tag and by
// SHA-256, so every machine renders plates from the same bytes. Does nothing
// when the file is already there and matches.
//
//   node scripts/fetch-fonts.mjs

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'fonts');

const WANTED = [
  {
    file: 'NotoSansCJK-Bold.ttc',
    url: 'https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/OTC/NotoSansCJK-Bold.ttc',
    size: 20_050_760,
    sha256: 'faa5f3656a78b2e2d450d27fe8382c778bc2b6bb5ea29c986664a6a435056ceb',
  },
];

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** Node's fetch, or curl where fetch cannot reach out (a proxy it does not read). */
async function download(url, to) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    writeFileSync(to, Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    console.warn(`fetch failed (${e.message}); trying curl`);
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', to, url], { stdio: 'inherit' });
  }
}

let failed = false;
for (const f of WANTED) {
  const path = join(FONTS, f.file);
  if (existsSync(path) && sha256(readFileSync(path)) === f.sha256) {
    console.log(`${f.file}: present`);
    continue;
  }
  const part = `${path}.part`;
  console.log(`${f.file}: fetching ${(f.size / 1e6).toFixed(1)} MB`);
  try {
    await download(f.url, part);
    const got = readFileSync(part);
    if (got.length !== f.size || sha256(got) !== f.sha256)
      throw new Error(`${got.length} bytes, SHA-256 ${sha256(got)}: not the pinned file`);
    renameSync(part, path);
    console.log(`${f.file}: ok`);
  } catch (e) {
    rmSync(part, { force: true });
    console.error(`${f.file}: ${e.message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
