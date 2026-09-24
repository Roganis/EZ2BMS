import { expect, test } from '@playwright/test';

interface W {
  __ez2bms: {
    view: { cursor: number; zoom: number; rackScroll: number; workbench: boolean };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the live stem strips
    strips: any;
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
  // 50k notes, and the long stem's 213 cuts.
  expect(await page.evaluate(() => (window as unknown as W).__ez2bms.doc.data.notes.length)).toBe(
    50_213,
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
  // The 60 kits, and the long stem's own column.
  expect(stats.rackGroups).toBe(61);
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

// The song select preview: every frame redraws the carousel and the rail of
// plates in Canvas 2D (JS and the 2D context's own work, on the main thread),
// at rest and while the wheel chases a cursor that keeps moving.
test('the wheel preview draws a frame in a few milliseconds', async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.goto('/?e2e&skin');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.getByTestId('open-song').click();
  await page.getByTestId('song-tab-wheel').click();
  await expect(page.getByTestId('wheel-canvas')).toHaveAttribute('data-art', 'game');
  const times = () =>
    page.evaluate(() => {
      const t = [
        ...(window as unknown as { __ez2bmsWheel: { drawTimes: number[] } }).__ez2bmsWheel
          .drawTimes,
      ];
      (window as unknown as { __ez2bmsWheel: { drawTimes: number[] } }).__ez2bmsWheel.drawTimes =
        [];
      t.sort((a, b) => a - b);
      return { n: t.length, median: t[t.length >> 1]!, p95: t[Math.floor(t.length * 0.95)]! };
    });
  await page.waitForTimeout(1000);
  await times();
  await page.waitForTimeout(1500);
  const rest = await times();
  await page.locator('.screen').focus();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i % 3 === 2 ? 'ArrowUp' : 'ArrowDown');
    await page.waitForTimeout(80);
  }
  const moving = await times();
  const stats = { rest, moving };
  info.annotations.push({ type: 'perf', description: JSON.stringify(stats) });
  console.log('wheel draw ms', stats);
  expect(rest.n).toBeGreaterThan(20);
  // Generous: headless software rendering. A 60 Hz frame is 16.7 ms.
  expect(rest.median).toBeLessThan(16);
  expect(moving.median).toBeLessThan(16);
});

/** Median and 95th percentile of the draws since `from`. */
const drawStats = (t: number[]) => {
  const s = [...t].sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)]!, p95: s[Math.floor(s.length * 0.95)]! };
};

// Stem strips: three on the demo while the cursor runs as it does playing
// at 250 % (a strip's waveform is painted again every frame then), against
// none; on the bench, the five-minute stem's strip beside 50k notes, and
// chopping that stem at eighths (~1500 cuts, checked to keep the sound).
test('stem strips draw while playing, and a long stem chops quickly', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await page.waitForFunction(() => '__ez2bmsField' in window);
  const run = () =>
    page.evaluate(async () => {
      const w = window as unknown as W;
      const f = w.__ez2bmsField;
      // 250 % in Edit: 192 design pixels a beat; 150 BPM at 60 fps is 10 pulses a frame.
      w.__ez2bms.view.zoom = 192;
      f.drawTimes.length = 0;
      for (let i = 0; i < 60; i++) {
        w.__ez2bms.view.cursor = 960 + i * 10;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      await new Promise((r) => setTimeout(r, 50));
      return [...f.drawTimes];
    });
  await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    a.strips.pin(a.doc, 'bass_a.wav');
    a.strips.pin(a.doc, 'lead_1.wav');
  });
  await page.waitForTimeout(300);
  const three = drawStats(await run());
  await page.evaluate(() => ((window as unknown as W).__ez2bms.strips.show = false));
  await page.waitForTimeout(300);
  const none = drawStats(await run());
  // The bench is the same song folder: forget the strips pinned here.
  await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms as unknown as {
      settings: { set(k: string, v: unknown): void };
    };
    a.settings.set('strips', {});
  });
  await page.waitForTimeout(600);

  await openBench(page);
  const bench = await page.evaluate(async () => {
    const w = window as unknown as W;
    const a = w.__ez2bms;
    const f = w.__ez2bmsField;
    const list = a.strips.list(a.doc) as string[];
    f.drawTimes.length = 0;
    for (let i = 0; i < 60; i++) {
      a.view.cursor = i * 997;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    await new Promise((r) => setTimeout(r, 50));
    const draws = [...f.drawTimes];
    const before = a.doc.data.notes.length;
    const t0 = performance.now();
    a.strips.chop(a.doc, 'bench_stem.wav', 120);
    return {
      list,
      draws,
      chopMs: performance.now() - t0,
      cuts: a.doc.data.notes.length - before,
    };
  });
  const scroll = drawStats(bench.draws);
  const stats = {
    threeStrips: three,
    noStrips: none,
    benchStrips: bench.list.length,
    benchScroll: scroll,
    chopMs: Math.round(bench.chopMs),
    cuts: bench.cuts,
  };
  info.annotations.push({ type: 'perf', description: JSON.stringify(stats) });
  console.log('stem strips ms', stats);
  expect(bench.list).toContain('bench_stem.wav');
  expect(bench.cuts).toBeGreaterThan(1400);
  // Generous: software GL in CI. The design budget is 4 ms of JS per frame.
  expect(three.median).toBeLessThan(16);
  expect(scroll.median).toBeLessThan(16);
  expect(bench.chopMs).toBeLessThan(20_000);
});

// M8: the Play field on the 50k-note chart with the 4096 scroll changes
// EZ2PORT keeps at most, one every quarter beat, stepped as a chart plays
// (10 pulses a frame): the multiplier walk, the chase and the rescaled field.
test('the Play field draws with 4096 scroll changes at a small cost', async ({ page }, info) => {
  test.setTimeout(90_000);
  await openBench(page);
  const stats = await page.evaluate(async () => {
    const w = window as unknown as W & {
      __ez2bms: {
        view: { mode: string };
        doc: {
          resolution: number;
          transact(label: string, fn: (tx: { setScrollEvents(e: unknown[]): void }) => void): void;
        };
      };
    };
    const a = w.__ez2bms;
    const f = w.__ez2bmsField;
    const res = a.doc.resolution;
    const run = async () => {
      f.drawTimes.length = 0;
      for (let i = 0; i < 60; i++) {
        a.view.cursor = res * 64 + i * 10;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      await new Promise((r) => setTimeout(r, 50));
      const t = [...f.drawTimes].sort((x, y) => x - y);
      return t[Math.floor(t.length / 2)]!;
    };
    a.view.mode = 'play';
    await new Promise((r) => setTimeout(r, 400));
    const plain = await run();
    a.doc.transact('Scroll', (tx) =>
      tx.setScrollEvents(
        Array.from({ length: 4096 }, (_, i) => ({ y: (i * res) / 4, rate: 0.75 + (i % 4) * 0.25 })),
      ),
    );
    const scroll = await run();
    return { plainMedian: plain, scrollMedian: scroll };
  });
  info.annotations.push({ type: 'perf', description: JSON.stringify(stats) });
  console.log('play with scroll changes, draw ms', stats);
  expect(stats.scrollMedian).toBeLessThan(16);
});
