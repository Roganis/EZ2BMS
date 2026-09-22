<script lang="ts">
  // The song-select screen: recent songs as spinning discs, and the way in.
  import { baseName } from '../bridge';
  import { app } from '../state/app.svelte';

  const recent = $derived(app.settings.data.recent);
  let busy = $state(false);

  async function open(dir?: string) {
    busy = true;
    try {
      if (dir) await app.openProject(dir);
      else app.commands.run('file.open');
    } finally {
      busy = false;
    }
  }

  const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
</script>

<main class="start" data-testid="start-screen">
  <div class="lanes" aria-hidden="true">
    {#each [0, 1, 2, 3, 4, 5, 6] as i (i)}
      <span class="lane" style:--i={i}></span>
    {/each}
  </div>

  <header>
    <h1><span class="ez">EZ2</span>BMS</h1>
    <p class="tag">chart suite for EZ2PORT</p>
  </header>

  <section class="wheel" aria-label="Songs">
    {#each recent as dir (dir)}
      <button
        class="disc"
        style:--h={hue(dir)}
        onclick={() => open(dir)}
        disabled={busy}
        title={dir}
      >
        <span class="vinyl"><span class="label"></span></span>
        <span class="name">{baseName(dir)}</span>
      </button>
    {/each}
    <button class="disc new" onclick={() => open()} disabled={busy} data-testid="open-folder">
      <span class="vinyl"><span class="plus">+</span></span>
      <span class="name">Open song folder</span>
    </button>
  </section>

  <footer>
    <kbd>Ctrl K</kbd> commands · <kbd>Ctrl O</kbd> open
    {#if app.backend.kind === 'web'}
      · <span class="web">browser preview: files live in memory</span>
    {/if}
  </footer>
</main>

<style>
  .start {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-rows: 1fr auto auto;
    justify-items: center;
    align-items: center;
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 35%, #1a2140 0%, var(--bg-0) 65%);
  }
  .lanes {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
    gap: 6px;
    opacity: 0.18;
    pointer-events: none;
    perspective: 600px;
  }
  .lane {
    width: 46px;
    background: linear-gradient(to top, var(--lane-blue), transparent 70%);
    transform: rotateX(55deg);
    transform-origin: bottom;
    animation: pulse 1.6s calc(var(--i) * 0.11s) infinite ease-in-out;
  }
  .lane:nth-child(odd) {
    background: linear-gradient(to top, var(--lane-white), transparent 70%);
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
  header {
    z-index: 1;
    text-align: center;
    align-self: end;
  }
  h1 {
    margin: 0;
    font-size: clamp(48px, 9vw, 104px);
    letter-spacing: 0.08em;
    font-weight: 800;
    text-shadow:
      0 0 18px rgba(88, 225, 255, 0.6),
      0 0 42px rgba(255, 79, 216, 0.25);
  }
  .ez {
    color: var(--neon);
  }
  .tag {
    margin: 4px 0 0;
    color: var(--ink-dim);
    font-family: var(--font-num);
    letter-spacing: 0.3em;
    text-transform: uppercase;
    font-size: 13px;
  }
  .wheel {
    z-index: 1;
    display: flex;
    gap: 28px;
    flex-wrap: wrap;
    justify-content: center;
    padding: 40px 24px;
    max-width: 1100px;
  }
  .disc {
    all: unset;
    cursor: pointer;
    display: grid;
    justify-items: center;
    gap: 10px;
    width: 150px;
    color: var(--ink);
    transition: transform 0.25s var(--ease-out);
  }
  .disc:hover,
  .disc:focus-visible {
    transform: translateY(-6px) scale(1.04);
  }
  .disc:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  .vinyl {
    width: 132px;
    height: 132px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle, transparent 21%, rgba(255, 255, 255, 0.06) 22%, transparent 23%),
      repeating-radial-gradient(circle, #111522 0 3px, #0a0d16 3px 5px);
    box-shadow:
      0 0 0 3px hsl(var(--h, 190) 90% 60% / 0.8),
      0 0 26px hsl(var(--h, 190) 90% 60% / 0.45);
    animation: spin 6s linear infinite;
    animation-play-state: paused;
  }
  .disc:hover .vinyl,
  .disc:focus-visible .vinyl {
    animation-play-state: running;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .label {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: conic-gradient(
      hsl(var(--h) 90% 60%),
      hsl(calc(var(--h) + 60) 90% 55%),
      hsl(var(--h) 90% 60%)
    );
  }
  .new .vinyl {
    background: rgba(88, 225, 255, 0.06);
    box-shadow:
      0 0 0 2px var(--neon),
      inset 0 0 24px rgba(88, 225, 255, 0.25);
    animation: none;
  }
  .plus {
    font-size: 52px;
    color: var(--neon);
    line-height: 1;
  }
  .name {
    font-size: 14px;
    text-align: center;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  footer {
    z-index: 1;
    padding: 18px;
    color: var(--ink-faint);
    font-size: 12px;
  }
  kbd {
    font-family: var(--font-num);
    border: 1px solid var(--ink-faint);
    border-radius: 4px;
    padding: 1px 5px;
    color: var(--ink-dim);
  }
  .web {
    color: var(--warn);
  }
</style>
