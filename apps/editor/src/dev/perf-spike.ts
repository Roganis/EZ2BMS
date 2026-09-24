// M1.0 renderer gate: scroll a field of pooled note sprites and measure frame
// times. Run it inside each webview we ship on (WebKitGTK on Linux, WebView2 on
// Windows) and record the numbers in docs/perf-log.md before building UI on
// top of Pixi. Query parameters: ?notes=20000&lanes=16&speed=1&density=8,
// where density is notes per beat (1000 puts ~5k sprites on screen at once).
import { Application, Container, Graphics, Sprite, type Texture } from 'pixi.js';

const params = new URLSearchParams(location.search);
const NOTES = Number(params.get('notes') ?? 20000);
const LANES = Number(params.get('lanes') ?? 16);
const SPEED = Number(params.get('speed') ?? 1);
const DENSITY = Number(params.get('density') ?? 8);
const LANE_W = 36;
const NOTE_H = 12;
const PX_PER_BEAT = 192; // 250 % of the engine's 76.8 px/beat

const stats = document.getElementById('stats')!;

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#05060a',
    antialias: false,
    preference: 'webgl',
    powerPreference: 'high-performance',
  });
  document.body.appendChild(app.canvas);

  const colours = [0xf2f2ff, 0x4d9eff, 0xed2e2e, 0xffd11f];
  const textures: Texture[] = colours.map((c) =>
    app.renderer.generateTexture(new Graphics().roundRect(0, 0, LANE_W - 4, NOTE_H, 3).fill(c)),
  );

  // Notes spread over a long chart: beat positions sorted per lane.
  const beats = new Float64Array(NOTES);
  const lanes = new Uint8Array(NOTES);
  for (let i = 0; i < NOTES; i++) {
    beats[i] = (i / NOTES) * (NOTES / DENSITY) + Math.random() * 0.25;
    lanes[i] = Math.floor(Math.random() * LANES);
  }

  const field = new Container();
  app.stage.addChild(field);
  const pool: Sprite[] = [];
  const acquire = (n: number): Sprite => {
    let s = pool[n];
    if (!s) {
      s = new Sprite(textures[0]);
      s.eventMode = 'none';
      pool[n] = s;
      field.addChild(s);
    }
    s.visible = true;
    return s;
  };

  const frameTimes: number[] = [];
  let last = performance.now();
  let t0 = last;
  let visibleCount = 0;

  app.ticker.add(() => {
    const now = performance.now();
    frameTimes.push(now - last);
    last = now;
    const work0 = performance.now();

    const h = app.screen.height;
    const hitY = h * 0.77;
    const nowBeat = ((now - t0) / 1000) * 2.5 * SPEED; // 150 BPM
    const topBeat = nowBeat + hitY / PX_PER_BEAT;
    const x0 = (app.screen.width - LANES * LANE_W) / 2;

    // Linear scan is fine for a spike; the real renderer binary-searches.
    let used = 0;
    for (let i = 0; i < NOTES; i++) {
      const b = beats[i]!;
      if (b < nowBeat - 0.5 || b > topBeat) continue;
      const s = acquire(used++);
      const lane = lanes[i]!;
      s.texture = textures[lane % textures.length]!;
      s.x = x0 + lane * LANE_W + 2;
      s.y = hitY - (b - nowBeat) * PX_PER_BEAT - NOTE_H / 2;
    }
    for (let i = used; i < pool.length; i++) pool[i]!.visible = false;
    visibleCount = used;
    const work = performance.now() - work0;

    if (frameTimes.length >= 120) {
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const p = (q: number): string => sorted[Math.floor(q * (sorted.length - 1))]!.toFixed(2);
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      stats.textContent =
        `notes ${NOTES}  lanes ${LANES}  visible ${visibleCount}  pool ${pool.length}\n` +
        `fps ${(1000 / avg).toFixed(1)}  frame p50 ${p(0.5)} p95 ${p(0.95)} p99 ${p(0.99)} ms\n` +
        `js work last frame ${work.toFixed(2)} ms  renderer ${app.renderer.name}\n` +
        `${navigator.userAgent}`;
      frameTimes.length = 0;
      (window as unknown as { __perf?: unknown }).__perf = {
        fps: 1000 / avg,
        p95: Number(p(0.95)),
        visible: visibleCount,
      };
    }
    if (topBeat > NOTES / DENSITY) t0 = now;
  });
}

main().catch((e: unknown) => {
  stats.textContent = `perf spike failed: ${String(e)}`;
});
