<script lang="ts">
  // One sound's waveform, fetched when the card is on screen (see
  // audio/thumbs.ts) and drawn at the screen's pixel density.
  import type { Loaded } from '../../bridge';
  import { drawThumb } from '../../audio/thumbs';
  import { app } from '../../state/app.svelte';

  let {
    loaded,
    width,
    height,
    hue,
  }: { loaded: Loaded | undefined; width: number; height: number; hue: number } = $props();

  let canvas = $state<HTMLCanvasElement>();
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const pw = $derived(Math.min(512, Math.round(width * dpr)));
  const ph = $derived(Math.round(height * dpr));

  $effect(() => {
    const c = canvas;
    const l = loaded;
    const w = pw;
    const h = ph;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const color = `hsl(${hue} 85% 64%)`;
    if (!l || l.id === null) {
      ctx.clearRect(0, 0, w, h);
      return;
    }
    const have = app.sounds.thumbs.get(l, w);
    if (have) {
      drawThumb(ctx, have, w, h, color);
      return;
    }
    let live = true;
    app.sounds.thumbs
      .request(l, w)
      .then((d) => live && drawThumb(ctx, d, w, h, color))
      .catch(() => {});
    return () => (live = false);
  });
</script>

<canvas
  bind:this={canvas}
  width={pw}
  height={ph}
  style:width="{width}px"
  style:height="{height}px"
  data-thumb={loaded?.id ?? ''}
></canvas>

<style>
  canvas {
    display: block;
  }
</style>
