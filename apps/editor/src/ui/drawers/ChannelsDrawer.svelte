<script lang="ts">
  // The sounds of the chart. Click one to draw with it (the brush).
  import { app } from '../../state/app.svelte';
  import type { ChartSlot } from '../../state/project.svelte';
  import { channelHue } from '../../colors';
  import Drawer from './Drawer.svelte';

  let { slot }: { slot: ChartSlot } = $props();
  let filter = $state('');
  const SHOW = 400;

  const rows = $derived.by(() => {
    void slot.rev;
    const d = slot.doc;
    const q = filter.trim().toLowerCase();
    return d.data.channels
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({ id: c.id, name: c.name, uses: d.index.channel(c.id).length }));
  });
</script>

<Drawer side="left" title="Sounds" width={260} onclose={() => (app.view.leftOpen = false)}>
  <div class="search">
    <input
      bind:value={filter}
      placeholder="Filter {slot.doc.data.channels.length} sounds"
      spellcheck="false"
    />
  </div>
  <ul data-testid="channels">
    {#each rows.slice(0, SHOW) as r (r.id)}
      <li>
        <button
          class:brush={app.view.brush === r.id}
          onclick={() => (app.view.brush = r.id)}
          title={r.name}
        >
          <span class="sw" style:--h={channelHue(r.name)}></span>
          <span class="nm">{r.name}</span>
          <span class="n">{r.uses}</span>
        </button>
      </li>
    {:else}
      <li class="none">{filter ? 'No sound matches' : 'No sounds yet - drop audio files here'}</li>
    {/each}
    {#if rows.length > SHOW}<li class="none">
        …and {rows.length - SHOW} more, filter to find them
      </li>{/if}
  </ul>
</Drawer>

<style>
  .search {
    padding: 8px;
    position: sticky;
    top: 0;
    background: #0b0f1c;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 9px;
    border-radius: 7px;
    border: 1px solid rgba(88, 225, 255, 0.18);
    background: #05070d;
    color: var(--ink);
    font: 13px var(--font-ui);
    outline: none;
  }
  input:focus {
    border-color: var(--neon);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 6px 12px;
  }
  button {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    width: 100%;
    display: grid;
    grid-template-columns: 10px 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 5px 8px;
    border-radius: 7px;
    font-size: 13px;
  }
  button:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  button.brush {
    background: rgba(88, 225, 255, 0.12);
    box-shadow: inset 2px 0 0 var(--neon);
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: hsl(var(--h) 85% 62%);
    box-shadow: 0 0 6px hsl(var(--h) 85% 62% / 0.6);
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .n {
    font-family: var(--font-num);
    font-size: 11px;
    color: var(--ink-faint);
  }
  .none {
    padding: 10px;
    color: var(--ink-dim);
    font-size: 12px;
  }
</style>
