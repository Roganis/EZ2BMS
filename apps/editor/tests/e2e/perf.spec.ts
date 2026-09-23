import { expect, test } from '@playwright/test';

interface W {
  __ez2bms: { view: { cursor: number; zoom: number }; doc: { data: { notes: unknown[] } } };
  __ez2bmsField: { drawTimes: number[] };
}

// The renderer on a 50k-note, 1500-sound chart: scroll through it and time
// every draw (JS only; this is headless software GL, so no GPU numbers).
//
// Each frame here also costs ~50 ms of wall time outside our code (Chromium's
// software compositor reads the whole WebGL canvas back every frame; a CI
// runner is slower still), so the sample is 60 frames per zoom and the test
// gets its own time limit - 240 frames ran past 30 s on CI.
test('a 50k-note chart scrolls with a small JS cost per frame', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto('/?e2e&bench');
  await page.getByTestId('open-folder').click();
  await page.waitForFunction(() => '__ez2bmsField' in window);
  await page.getByRole('button', { name: /EX 20/ }).click();
  expect(await page.evaluate(() => (window as unknown as W).__ez2bms.doc.data.notes.length)).toBe(
    50_000,
  );
  const stats = await page.evaluate(async () => {
    const w = window as unknown as W;
    const f = w.__ez2bmsField;
    const out: Record<string, number> = {};
    for (const zoom of [56, 12]) {
      w.__ez2bms.view.zoom = zoom;
      f.drawTimes.length = 0;
      for (let i = 0; i < 60; i++) {
        w.__ez2bms.view.cursor = i * 997;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      await new Promise((r) => setTimeout(r, 50));
      const t = [...f.drawTimes].sort((a, b) => a - b);
      out[`median@${zoom}`] = t[Math.floor(t.length / 2)]!;
      out[`p95@${zoom}`] = t[Math.floor(t.length * 0.95)]!;
    }
    return out;
  });
  info.annotations.push({ type: 'perf', description: JSON.stringify(stats) });
  console.log('renderer draw ms', stats);
  // Generous: software GL in CI. The design budget is 4 ms of JS per frame.
  expect(stats['median@56']).toBeLessThan(16);
});
