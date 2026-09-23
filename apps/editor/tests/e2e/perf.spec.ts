import { expect, test } from '@playwright/test';

interface W {
  __ez2bms: {
    view: { cursor: number; zoom: number; rackScroll: number; workbench: boolean };
    doc: { data: { notes: unknown[] } };
    sounds: { thumbs: { batches: number } };
  };
  __ez2bmsField: {
    drawTimes: number[];
    readonly rackMaxScroll: number;
    // Private in the renderer; read here for the numbers only.
    rack: { groups: unknown[]; buildMs: number };
  };
}

async function openBench(page: import('@playwright/test').Page) {
  await page.goto('/?e2e&bench');
  await page.getByTestId('open-folder').click();
  await page.waitForFunction(() => '__ez2bmsField' in window);
  await page.getByRole('button', { name: /EX 20/ }).click();
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
  await openBench(page);
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
    // The grouped rack (60 kits): how long grouping took, and drawing while
    // it scrolls sideways (Shift+wheel).
    w.__ez2bms.view.zoom = 56;
    out.rackGroups = f.rack.groups.length;
    out.rackBuildMs = f.rack.buildMs;
    const max = f.rackMaxScroll;
    f.drawTimes.length = 0;
    for (let i = 0; i < 30; i++) {
      w.__ez2bms.view.rackScroll = (max * i) / 29;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    await new Promise((r) => setTimeout(r, 50));
    const t = [...f.drawTimes].sort((a, b) => a - b);
    out['median@rackScroll'] = t[Math.floor(t.length / 2)]!;
    return out;
  });
  info.annotations.push({ type: 'perf', description: JSON.stringify(stats) });
  console.log('renderer draw ms', stats);
  // Generous: software GL in CI. The design budget is 4 ms of JS per frame.
  expect(stats['median@56']).toBeLessThan(16);
  expect(stats.rackGroups).toBe(60);
  expect(stats['median@rackScroll']).toBeLessThan(16);
});

// The workbench over the same song's 1512 sounds: opening it, and how long
// each scroll step takes to update the grid (the page's own work, measured
// from the scroll event to after Svelte has patched the DOM).
test('the workbench opens and scrolls through 1500 sounds quickly', async ({ page }, info) => {
  test.setTimeout(90_000);
  await openBench(page);
  const stats = await page.evaluate(async () => {
    const w = window as unknown as W;
    const cards = () => document.querySelectorAll('[data-testid=sound-card]').length;
    const t0 = performance.now();
    w.__ez2bms.view.workbench = true;
    while (!cards()) await new Promise((r) => setTimeout(r, 0));
    const open = performance.now() - t0;
    const grid = document.querySelector<HTMLElement>('[data-testid=workbench-grid]')!;
    const steps: number[] = [];
    let most = 0;
    let start = 0;
    grid.parentElement!.addEventListener('scroll', () => (start = performance.now()), true);
    const done = () =>
      new Promise<void>((resolve) =>
        grid.addEventListener(
          'scroll',
          // After the grid's own handler; Svelte patches the DOM in a microtask queued before this one.
          () => queueMicrotask(() => (steps.push(performance.now() - start), resolve())),
          { once: true },
        ),
      );
    const n = 40;
    for (let i = 1; i <= n; i++) {
      const wait = done();
      grid.scrollTop = ((grid.scrollHeight - grid.clientHeight) * i) / n;
      await wait;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      most = Math.max(most, cards());
    }
    await new Promise((r) => setTimeout(r, 100));
    steps.sort((a, b) => a - b);
    return {
      openMs: open,
      scrollMedianMs: steps[steps.length >> 1]!,
      scrollP95Ms: steps[Math.floor(steps.length * 0.95)]!,
      mostCards: most,
      thumbBatches: w.__ez2bms.sounds.thumbs.batches,
    };
  });
  info.annotations.push({ type: 'perf', description: JSON.stringify(stats) });
  console.log('workbench ms', stats);
  expect(stats.mostCards).toBeLessThan(120);
  // Batched: far fewer engine calls than cards shown.
  expect(stats.thumbBatches).toBeLessThan(60);
  expect(stats.openMs).toBeLessThan(2000);
  expect(stats.scrollMedianMs).toBeLessThan(30);
});
