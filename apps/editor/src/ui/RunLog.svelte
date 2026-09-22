<script lang="ts">
  // What EZ2PORT said during the last test run.
  import { tick } from 'svelte';
  import { app } from '../state/app.svelte';

  const port = app.port;
  let box: HTMLDivElement | undefined = $state();
  $effect(() => {
    void port.log.length;
    void tick().then(() => box && (box.scrollTop = box.scrollHeight));
  });
</script>

<section class="log" aria-label="EZ2PORT log">
  <header>
    <span class="title">EZ2PORT</span>
    {#if port.runId !== null}<span class="run">running</span>{:else if port.lastExit}<span
        class="exit">{port.lastExit}</span
      >{/if}
    <span class="sp"></span>
    {#if port.runId !== null}
      <button class="ez-btn danger" onclick={() => app.commands.run('port.stop')}>Stop</button>
    {/if}
    <button class="ez-btn" onclick={() => (port.log = [])}>Clear</button>
    <button class="x" onclick={() => (port.logOpen = false)} aria-label="Hide">×</button>
  </header>
  <div class="lines" bind:this={box}>
    {#each port.log as l, i (i)}
      <div class={l.stream}>{l.text}</div>
    {/each}
  </div>
</section>

<style>
  .log {
    position: absolute;
    left: 0;
    right: 28px;
    bottom: 0;
    height: 180px;
    display: flex;
    flex-direction: column;
    background: rgba(5, 6, 10, 0.96);
    border-top: 1px solid rgba(88, 225, 255, 0.25);
    z-index: 3;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    font-size: 11px;
  }
  .title {
    letter-spacing: 0.16em;
    color: var(--ink-dim);
  }
  .run {
    color: var(--ok);
  }
  .exit {
    color: var(--ink-faint);
  }
  .sp {
    flex: 1;
  }
  .x {
    all: unset;
    cursor: pointer;
    color: var(--ink-faint);
    font-size: 16px;
    padding: 0 4px;
  }
  .lines {
    flex: 1;
    overflow: auto;
    padding: 0 10px 8px;
    font: 12px/1.45 var(--font-num);
    white-space: pre-wrap;
    user-select: text;
  }
  .err {
    color: #ff9aa9;
  }
  .ez2bms {
    color: var(--neon);
  }
</style>
