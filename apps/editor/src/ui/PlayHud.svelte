<script lang="ts">
  // Over the field while playing: the last judgement, the combo, the score
  // and the gauge, placed on the field's own geometry.
  import { J, J_NAMES } from '@ez2bms/chart-core';
  import type { Hud } from '../play/controller.svelte';

  let {
    hud,
    box,
    active,
  }: { hud: Hud; box: { left: number; right: number; judgeY: number }; active: boolean } = $props();
  const w = $derived(Math.max(0, box.right - box.left));
  const gaugePct = $derived(Math.max(0, Math.min(100, hud.gauge)));
</script>

<div
  class="hud"
  style:left="{box.left}px"
  style:width="{w}px"
  style:--jy="{box.judgeY}px"
  aria-live="polite"
>
  <div class="top">
    <span class="tag">{hud.kind === 'auto' ? 'AUTO PLAY' : 'TEST PLAY'}</span>
    <span class="score" data-testid="hud-score">{String(hud.score).padStart(7, '0')}</span>
  </div>
  <div class="gauge" title="Gauge {hud.gauge.toFixed(1)}">
    <div class="fill" class:low={gaugePct < 30} style:width="{gaugePct}%"></div>
  </div>
  {#if hud.judge && active}
    {#key hud.judge.seq}
      <div class="judge j{hud.judge.j}" data-testid="hud-judge">
        {J_NAMES[hud.judge.j]}
        {#if hud.judge.early !== undefined && hud.judge.j !== J.KOOL}<small
            >{hud.judge.early ? 'FAST' : 'SLOW'}</small
          >{/if}
      </div>
    {/key}
    {#if hud.combo >= 2}
      {#key hud.combo}
        <div class="combo" data-testid="hud-combo">{hud.combo}</div>
      {/key}
    {/if}
  {/if}
</div>

<style>
  .hud {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
    text-align: center;
    font-family: var(--font-num);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 8px 4px 4px;
  }
  .tag {
    font-size: 11px;
    letter-spacing: 0.2em;
    color: var(--neon-2);
    text-shadow: 0 0 8px rgba(255, 79, 216, 0.6);
  }
  .score {
    font-size: 22px;
    color: #fff;
    text-shadow: var(--glow);
    letter-spacing: 0.08em;
  }
  .gauge {
    height: 6px;
    margin: 0 4px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, #56f39a, #58e1ff);
    box-shadow: 0 0 10px rgba(88, 225, 255, 0.7);
    transition: width 0.12s;
  }
  .fill.low {
    background: linear-gradient(90deg, #ff5470, #ffc247);
  }
  .judge {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(var(--jy) * 0.55);
    font-size: 40px;
    font-weight: 900;
    font-style: italic;
    letter-spacing: 0.06em;
    animation: pop 0.45s var(--ease-out) forwards;
  }
  .judge small {
    display: block;
    font-size: 12px;
    font-style: normal;
    letter-spacing: 0.3em;
    opacity: 0.8;
  }
  .j1 {
    color: #fff;
    text-shadow:
      0 0 10px #58e1ff,
      0 0 26px #ff4fd8;
  }
  .j2 {
    color: #7fd0ff;
    text-shadow: 0 0 12px #4d9eff;
  }
  .j3 {
    color: #56f39a;
    text-shadow: 0 0 12px rgba(86, 243, 154, 0.6);
  }
  .j4 {
    color: #ffc247;
    text-shadow: 0 0 12px rgba(255, 194, 71, 0.6);
  }
  .j5 {
    color: #ff5470;
    text-shadow: 0 0 12px rgba(255, 84, 112, 0.7);
  }
  .combo {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(var(--jy) * 0.55 + 52px);
    font-size: 34px;
    font-weight: 800;
    color: #fff;
    text-shadow: var(--glow);
    animation: bump 0.2s ease-out;
  }
  @keyframes pop {
    0% {
      transform: scale(1.35);
      opacity: 0;
    }
    18% {
      transform: scale(1);
      opacity: 1;
    }
    75% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes bump {
    from {
      transform: scale(1.18);
    }
  }
</style>
