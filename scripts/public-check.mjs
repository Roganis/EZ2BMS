#!/usr/bin/env node
// Before the repository goes public: look through EVERY commit on every
// branch for what must never be published - the game's own files, an
// executable, a private key or token - and list who the commits name.
// CLAUDE.md forbids committing game content; this checks it was never
// done, history included (a file deleted later is still in history).
//
//   node scripts/public-check.mjs          # report; exit 1 if anything is flagged
//
// It reads git's objects only; nothing is changed or sent anywhere.

import { execFileSync, spawnSync } from 'node:child_process';

const git = (args, input) =>
  execFileSync('git', args, { input, maxBuffer: 1 << 30, encoding: input ? undefined : 'utf8' });

/** Every blob in history with the paths it was committed under. */
function blobs() {
  const byId = new Map();
  for (const line of git(['rev-list', '--objects', '--all']).split('\n')) {
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const id = line.slice(0, sp);
    const path = line.slice(sp + 1);
    if (!byId.has(id)) byId.set(id, new Set());
    byId.get(id).add(path);
  }
  const ids = [...byId.keys()];
  const check = spawnSync(
    'git',
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    {
      input: ids.join('\n') + '\n',
      maxBuffer: 1 << 30,
      encoding: 'utf8',
    },
  ).stdout;
  const out = [];
  for (const line of check.split('\n')) {
    const [id, type, size] = line.split(' ');
    if (type === 'blob') out.push({ id, size: Number(size), paths: [...byId.get(id)] });
  }
  return out;
}

/** The game's formats, recognised by their own first bytes. */
const MAGIC = [
  ['a plaintext EZ2 chart (EZFF)', (b) => b.subarray(0, 4).toString('latin1') === 'EZFF'],
  ['a decrypted song table (EZSL)', (b) => b.subarray(0, 4).toString('latin1') === 'EZSL'],
  ['an executable or DLL (MZ...PE)', (b) => b[0] === 0x4d && b[1] === 0x5a && b.includes('PE\0\0')],
];
/** The game's file extensions (a committed one is at least worth a look). */
const GAME_EXT = /\.(ez|ezi|ssf|ezw|abm|scr|str|exe|dll)$/i;
/** Secrets, by the shapes they come in. */
const SECRET = [
  ['a private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['a Tauri/minisign secret key', /untrusted comment: (?:rsign|minisign) encrypted secret key/],
  ['a GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ['an AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['a Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['a signing key in a variable', /TAURI_SIGNING_PRIVATE_KEY\s*[:=]\s*["']?[A-Za-z0-9+/=]{40,}/],
];
const BIG = 5 * 1024 * 1024;

const flagged = [];
const noted = [];
const all = blobs();
// Read contents in one batch (smaller files only: nothing secret is 20 MB).
const readable = all.filter((b) => b.size <= 20 * 1024 * 1024);
const batch = git(
  ['cat-file', '--batch'],
  Buffer.from(readable.map((b) => b.id).join('\n') + '\n'),
);
let at = 0;
for (const b of readable) {
  const nl = batch.indexOf(10, at);
  const body = batch.subarray(nl + 1, nl + 1 + b.size);
  at = nl + 1 + b.size + 1;
  const where = b.paths.join(', ') || b.id;
  for (const [what, test] of MAGIC) if (test(body)) flagged.push(`${where}: ${what}`);
  if (b.paths.some((p) => GAME_EXT.test(p))) noted.push(`${where}: a game file extension`);
  if (!body.subarray(0, 8000).includes(0)) {
    const text = body.toString('utf8');
    for (const [what, re] of SECRET) if (re.test(text)) flagged.push(`${where}: ${what}`);
  }
}
for (const b of all)
  if (b.size > BIG) noted.push(`${b.paths.join(', ')}: ${(b.size / 1048576).toFixed(1)} MB`);

const people = [
  ...new Set(git(['log', '--all', '--format=%an <%ae>%n%cn <%ce>']).split('\n').filter(Boolean)),
];
const commits = git(['rev-list', '--all', '--count']).trim();

console.log(`Looked at ${all.length} files in ${commits} commits on every branch.`);
console.log(`\nNames and addresses the commits carry (public once the repo is):`);
for (const p of people) console.log(`  ${p}`);
console.log(`\nWorth a look (${noted.length}):`);
for (const n of noted) console.log(`  ${n}`);
console.log(`\nMust not be published (${flagged.length}):`);
for (const f of flagged) console.log(`  ${f}`);
process.exit(flagged.length ? 1 : 0);
