// The user manual's screenshots (docs/manual/img/), taken from the browser
// build with the demo song. Skipped unless MANUAL_SHOTS=1, so a normal
// `pnpm e2e` never rewrites the pictures: `pnpm manual:shots` retakes them
// all after a screen changes. The order follows i18n-sweep.spec.ts, which
// opens every screen the same way.

import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

const OUT = resolve(import.meta.dirname, '../../../../docs/manual/img');

const run = (page: Page, id: string) =>
  page.evaluate((id) => (window as unknown as W).__ez2bms.commands.run(id), id);

async function shot(page: Page, name: string) {
  // Let drawers and dialogs finish opening, and the playfield draw a frame.
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
}

async function close(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

test('the manual screenshots', async ({ page }) => {
  test.skip(!process.env.MANUAL_SHOTS, 'set MANUAL_SHOTS=1 (pnpm manual:shots) to retake them');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // ?skin: a made-up game folder, so the EZ2PORT panel shows one filled in.
  await page.goto('/?e2e&skin');
  await expect(page.getByTestId('open-folder')).toBeVisible();
  await shot(page, 'start');

  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  // A songs folder, as the EZ2PORT panel would have found it, so Publish
  // shows its whole dialog instead of asking for one (publish.spec.ts).
  await page.evaluate(() =>
    (window as unknown as W).__ez2bms.settings.set('songsRoot', '/ez2port/songs'),
  );
  // The editor opens with the Sounds drawer and the Notes tab showing.
  await shot(page, 'editor');
  await shot(page, 'tab-notes');
  await page.waitForTimeout(100);
  // The drawer on its own: the editor shot already shows it in place.
  await page
    .locator('.body > *')
    .filter({ has: page.getByTestId('channels') })
    .screenshot({ path: resolve(OUT, 'sounds-drawer.png') });

  for (const [id, name] of [
    ['view.chartInfo', 'tab-chart'],
    ['view.timing', 'tab-timing'],
    ['view.issues', 'tab-issues'],
    ['view.port', 'tab-port'],
  ] as const) {
    await run(page, id);
    await shot(page, name);
  }
  await run(page, 'view.port');

  await run(page, 'view.songManager');
  for (const tab of ['charts', 'plate', 'art', 'preview', 'bga', 'wheel']) {
    await page.getByTestId(`song-tab-${tab}`).click();
    await shot(page, `song-${tab}`);
  }
  await close(page);

  await run(page, 'view.workbench');
  await shot(page, 'workbench');
  await close(page);

  for (const [id, name] of [
    ['port.publish', 'publish'],
    ['file.exportCabinet', 'export-cabinet'],
    ['file.exportBms', 'export-bms'],
    ['file.import', 'import'],
    ['input.controls', 'controls'],
    ['chart.new', 'new-chart'],
    ['help.about', 'about'],
    ['app.preferences', 'preferences'],
  ] as const) {
    await run(page, id);
    await shot(page, name);
    await close(page);
  }

  await page.keyboard.press('Control+k');
  await shot(page, 'palette');
  await close(page);

  // The Play view in autoplay, a moment in, with the HUD judging.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('hud-judge')).toHaveText(/KOOL/, { timeout: 5000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, 'play-view.png') });
  await close(page);
  await close(page);
});
