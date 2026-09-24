// scripts/release-config.mjs: what a release adds, and what it refuses.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseConfig, updateEndpoint } from './release-config.mjs';

const PUB = 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDEyMzQK';

test('nothing set: nothing added (a release as before)', () => {
  assert.deepEqual(releaseConfig({ repo: 'Roganis/EZ2BMS' }), { config: {}, on: [] });
});

test('both halves of the update key: signed bundles, and the updater at the latest release', () => {
  const r = releaseConfig({ pubkey: ` ${PUB}\n`, hasSigningKey: true, repo: 'Roganis/EZ2BMS' });
  assert.deepEqual(r.on, ['updates']);
  assert.deepEqual(r.config, {
    bundle: { createUpdaterArtifacts: true },
    plugins: {
      updater: {
        pubkey: PUB,
        endpoints: ['https://github.com/Roganis/EZ2BMS/releases/latest/download/latest.json'],
      },
    },
  });
  assert.equal(
    updateEndpoint('a/b'),
    'https://github.com/a/b/releases/latest/download/latest.json',
  );
});

test('half a key pair is refused, saying which half is missing', () => {
  assert.throws(
    () => releaseConfig({ pubkey: PUB, repo: 'a/b' }),
    /secret TAURI_SIGNING_PRIVATE_KEY is not/,
  );
  assert.throws(
    () => releaseConfig({ hasSigningKey: true, repo: 'a/b' }),
    /TAURI_UPDATER_PUBKEY is not/,
  );
});

test('a certificate thumbprint turns on Authenticode, beside the updater', () => {
  const t = 'ab'.repeat(20);
  const r = releaseConfig({ pubkey: PUB, hasSigningKey: true, thumbprint: t, repo: 'a/b' });
  assert.deepEqual(r.on, ['updates', 'Authenticode']);
  assert.equal(r.config.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(r.config.bundle.windows, {
    certificateThumbprint: t.toUpperCase(),
    digestAlgorithm: 'sha256',
    timestampUrl: 'http://timestamp.digicert.com',
  });
  assert.throws(() => releaseConfig({ thumbprint: 'not-hex' }), /not a certificate thumbprint/);
});
