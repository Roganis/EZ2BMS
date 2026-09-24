#!/usr/bin/env node
// What a release build adds to src-tauri/tauri.conf.json, from the
// repository's secrets and variables (.github/workflows/release.yml;
// docs/releasing.md says how to set them). Without them a release is built
// as any other: no update signatures, no Authenticode. With them:
//
// - the update key's public half (variable TAURI_UPDATER_PUBKEY) and the
//   private half (secret TAURI_SIGNING_PRIVATE_KEY): signed update bundles
//   and the updater's settings, pointed at this repository's latest release;
// - a Windows code-signing certificate's thumbprint (set by the workflow
//   after importing the secret WINDOWS_CERTIFICATE): Authenticode.
//
//   node scripts/release-config.mjs OUT.json   (reads the environment)

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Where the app looks for updates: the newest published (not draft, not pre-) release. */
export const updateEndpoint = (repo) =>
  `https://github.com/${repo}/releases/latest/download/latest.json`;

/**
 * The config to merge (tauri build --config), and what it turned on.
 * @param {{ pubkey?: string, hasSigningKey?: boolean, thumbprint?: string, repo?: string }} o
 */
export function releaseConfig(o) {
  const config = {};
  const on = [];
  const pubkey = o.pubkey?.trim();
  if (pubkey && o.hasSigningKey) {
    if (!o.repo) throw new Error('the repository (owner/name) is needed for the update address');
    config.bundle = { createUpdaterArtifacts: true };
    config.plugins = { updater: { pubkey, endpoints: [updateEndpoint(o.repo)] } };
    on.push('updates');
  } else if (pubkey || o.hasSigningKey) {
    // Half a key pair signs nothing an app could check: say which half is missing.
    throw new Error(
      pubkey
        ? 'TAURI_UPDATER_PUBKEY is set but the secret TAURI_SIGNING_PRIVATE_KEY is not'
        : 'the secret TAURI_SIGNING_PRIVATE_KEY is set but the variable TAURI_UPDATER_PUBKEY is not',
    );
  }
  const thumb = o.thumbprint?.trim();
  if (thumb) {
    if (!/^[0-9A-Fa-f]{40}$/.test(thumb)) throw new Error(`not a certificate thumbprint: ${thumb}`);
    config.bundle = {
      ...config.bundle,
      windows: {
        certificateThumbprint: thumb.toUpperCase(),
        digestAlgorithm: 'sha256',
        timestampUrl: 'http://timestamp.digicert.com',
      },
    };
    on.push('Authenticode');
  }
  return { config, on };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = process.argv[2];
  if (!out) throw new Error('usage: node scripts/release-config.mjs OUT.json');
  const { config, on } = releaseConfig({
    pubkey: process.env.TAURI_UPDATER_PUBKEY,
    hasSigningKey: !!process.env.TAURI_SIGNING_PRIVATE_KEY,
    thumbprint: process.env.WINDOWS_CERT_THUMBPRINT,
    repo: process.env.GITHUB_REPOSITORY,
  });
  writeFileSync(out, JSON.stringify(config, null, 2) + '\n');
  console.log(on.length ? `release config: ${on.join(', ')}` : 'release config: nothing to add');
}
