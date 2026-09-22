// The game-skin path, against the made-up game folder the browser build
// carries with ?skin (src/bridge/demo-skin.ts - synthetic, no game files).

import { expect, test, type Page } from '@playwright/test';

interface SkinLayout {
  lanes: { x: number; left: number; width: number }[];
  judgeY: number;
  scale: number;
  field: { left: number; right: number };
  design: { x0: number; judgeY: number } | null;
}

async function open(page: Page, query = '&skin') {
  await page.goto(`/?e2e${query}`);
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

const layout = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __ez2bmsField: { currentLayout: SkinLayout } }).__ez2bmsField
        .currentLayout,
  );

/** Mean brightness (0..255) of a screen rectangle, as rendered. */
async function brightness(page: Page, x: number, y: number, w: number, h: number) {
  const png = await page.screenshot({ clip: { x, y, width: w, height: h } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

test("lays the lanes out from the game's panel", async ({ page }, info) => {
  await open(page);
  await expect.poll(async () => (await layout(page)).design).not.toBeNull();
  const l = await layout(page);
  // The panel's lane widths: turntable 44, white keys 28, blue 24, pedal 40.
  const w = Object.fromEntries(l.lanes.map((g) => [g.x, Math.round(g.width / l.scale)]));
  expect(w).toMatchObject({ 1: 44, 11: 28, 12: 24, 10: 40 });
  // Its judge line: TargetBar at 360, six tall, on a 480-line screen.
  const box = await page.getByTestId('playfield').boundingBox();
  expect(Math.abs(box!.height - l.judgeY - 117 * l.scale)).toBeLessThan(1);

  await page.getByRole('button', { name: 'EZ2PORT', exact: true }).click();
  await expect(page.getByTestId('skin-status')).toContainText('STYLE_StreetMix1_0.pvi');

  // The key panel under the judge line is the panel's bitmap (18, 20, 30), not the neon band.
  const kp = await brightness(
    page,
    box!.x + l.field.left + 4,
    box!.y + l.judgeY + 90 * l.scale,
    8,
    8,
  );
  expect(kp).toBeGreaterThan(15);
  expect(kp).toBeLessThan(30);

  await info.attach('streetmix-game-skin', {
    body: await page.getByTestId('playfield').screenshot(),
    contentType: 'image/png',
  });
});

test('turns off, and back on, from the palette', async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await layout(page)).design).not.toBeNull();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('game skin');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await layout(page)).design).toBeNull();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('game skin');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await layout(page)).design).not.toBeNull();
});

test("follows the chart's mode and the side", async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /7 KEY HD/ }).click();
  await expect.poll(async () => (await layout(page)).lanes.length).toBe(9);
  await expect.poll(async () => (await layout(page)).design).not.toBeNull();
  await page.keyboard.press('F2');
  await page.getByRole('button', { name: 'EZ2PORT', exact: true }).click();
  await expect(page.getByTestId('skin-status')).toContainText('STYLE_7StreetMix1_1.pvi');
  // 2P's panel is the same lane order as 1P's, moved - not mirrored.
  const l = await layout(page);
  const order = [...l.lanes].sort((a, b) => a.left - b.left).map((g) => g.x);
  expect(order).toEqual([1, 11, 12, 13, 14, 15, 10, 31, 32]);
});

test('a key held in test play lights its lane with the press glow', async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await layout(page)).design).not.toBeNull();
  const box = (await page.getByTestId('playfield').boundingBox())!;
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('hud-judge')).toBeVisible({ timeout: 6000 });
  const l = await layout(page);
  const k1 = l.lanes.find((g) => g.x === 11)!;
  const at = () =>
    brightness(page, box.x + k1.left + 4, box.y + l.judgeY - 40 * l.scale, k1.width - 8, 20);
  const before = await at();
  await page.keyboard.down('z');
  await expect.poll(at).toBeGreaterThan(before + 40);
  await page.keyboard.up('z');
  await page.keyboard.press('Escape');
});

test('a game folder without a panel for the mode keeps the neon skin', async ({ page }) => {
  await open(page, '&skin&modes');
  await page.getByRole('button', { name: /14 KEY/ }).click();
  await page.getByRole('button', { name: 'EZ2PORT', exact: true }).click();
  await expect(page.getByTestId('skin-status')).toContainText('STYLE_SpaceMix1_0.pvi');
  await expect(page.getByTestId('skin-status')).toContainText('neon');
  expect((await layout(page)).design).toBeNull();
});
