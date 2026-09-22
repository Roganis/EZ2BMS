<script lang="ts">
  // The whole chart at a glance: note density up the strip, tempo changes as
  // gold ticks, and the part on screen as a window. Click or drag to jump.
  import type { ChartSlot } from '../state/project.svelte';
  import { app } from '../state/app.svelte';

  let { slot, lo, hi }: { slot: ChartSlot; lo: number; hi: number } = $props();
  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let height = $state(400);
  const W = 28;

  const data = $derived.by(() => {
    void slot.rev;
    const d = slot.doc.data;
    const res = slot.doc.resolution;
    const last = Math.max(res * 16, ...d.notes.map((n) => n.y + n.l)) + res * 4;
    return { last, notes: d.notes, bpms: d.bpmEvents.map((e) => e.y), res };
  });

  // Density, redrawn when the chart or the size changes.
  $effect(() => {
    const { last, notes, bpms } = data;
    const h = height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = h * dpr;
    const c = canvas.getContext('2d')!;
    c.scale(dpr, dpr);
    c.clearRect(0, 0, W, h);
    const buckets = new Float32Array(Math.max(1, Math.floor(h / 2)));
    const bg = new Float32Array(buckets.length);
    for (const n of notes) {
      const i = Math.min(buckets.length - 1, Math.floor((n.y / last) * buckets.length));
      if (n.x === 0) bg[i]! += 1;
      else buckets[i]! += 1;
    }
    const peak = Math.max(4, ...buckets);
    for (let i = 0; i < buckets.length; i++) {
      const y = h - (i + 1) * 2;
      const k = buckets[i]! / peak;
      if (k > 0) {
        c.fillStyle = `rgba(88, 225, 255, ${0.25 + 0.75 * k})`;
        c.fillRect(W - 4 - k * (W - 10), y, k * (W - 10), 2);
      }
      if (bg[i]! > 0) {
        c.fillStyle = 'rgba(255, 79, 216, 0.35)';
        c.fillRect(2, y, 3, 2);
      }
    }
    c.fillStyle = '#ffd11f';
    for (const y of bpms) c.fillRect(0, h - (y / last) * h, W, 1);
  });

  const box = $derived({
    top: height - (Math.min(hi, data.last) / data.last) * height,
    bottom: height - (Math.max(0, lo) / data.last) * height,
  });

  function seek(e: PointerEvent) {
    const r = wrap.getBoundingClientRect();
    const k = 1 - (e.clientY - r.top) / r.height;
    const span = hi - lo;
    const res = data.res;
    app.view.cursor = Math.max(0, Math.round((k * data.last - span * 0.3) / res) * res);
  }

  $effect(() => {
    const ro = new ResizeObserver(() => (height = wrap.clientHeight));
    ro.observe(wrap);
    return () => ro.disconnect();
  });
</script>

<div
  class="minimap"
  bind:this={wrap}
  role="scrollbar"
  aria-orientation="vertical"
  aria-controls="playfield"
  aria-valuenow={Math.round(app.view.cursor)}
  tabindex="-1"
  onpointerdown={(e) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seek(e);
  }}
  onpointermove={(e) => e.buttons & 1 && seek(e)}
>
  <canvas bind:this={canvas} style:width="{W}px" style:height="{height}px"></canvas>
  <div
    class="win"
    style:top="{box.top}px"
    style:height="{Math.max(6, box.bottom - box.top)}px"
  ></div>
</div>

<style>
  .minimap {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 28px;
    background: rgba(5, 7, 13, 0.85);
    border-left: 1px solid rgba(88, 225, 255, 0.12);
    cursor: ns-resize;
    touch-action: none;
  }
  canvas {
    display: block;
  }
  .win {
    position: absolute;
    left: 0;
    right: 0;
    border: 1px solid rgba(88, 225, 255, 0.7);
    background: rgba(88, 225, 255, 0.08);
    pointer-events: none;
  }
</style>
