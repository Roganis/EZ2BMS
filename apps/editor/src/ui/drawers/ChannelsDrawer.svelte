<script lang="ts">
  // The chart's sounds. Click one to draw with it (the brush), double-click to
  // rename; sounds in the song folder that the chart does not use yet are
  // listed below, one click to add.
  import { addChannels, removeChannel, renameChannel } from '@ez2bms/chart-core';
  import { app } from '../../state/app.svelte';
  import type { ChartSlot } from '../../state/project.svelte';
  import { toast } from '../../state/toasts.svelte';
  import { channelHue } from '../../colors';
  import Drawer from './Drawer.svelte';

  let { slot }: { slot: ChartSlot } = $props();
  let filter = $state('');
  let renaming = $state<number | null>(null);
  const SHOW = 400;

  const rows = $derived.by(() => {
    void slot.rev;
    const d = slot.doc;
    const q = filter.trim().toLowerCase();
    return d.data.channels
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({ id: c.id, name: c.name, uses: d.index.channel(c.id).length }));
  });
  const unused = $derived.by(() => {
    void slot.rev;
    const have = new Set(slot.doc.data.channels.map((c) => c.name));
    const q = filter.trim().toLowerCase();
    return (app.project?.samples ?? []).filter(
      (s) => !have.has(s) && (!q || s.toLowerCase().includes(q)),
    );
  });

  function add(names: string[]) {
    const made = addChannels(slot.doc, names);
    if (made[0] && app.view.brush === null) app.view.brush = made[0].id;
    if (made.length > 1) toast(`Added ${made.length} sounds`, 'ok');
  }

  function commitRename(id: number, name: string) {
    renaming = null;
    const n = name.trim();
    if (n && n !== slot.doc.channel(id)?.name) renameChannel(slot.doc, id, n);
  }
</script>

<Drawer side="left" title="Sounds" width={260} onclose={() => (app.view.leftOpen = false)}>
  <div class="search">
    <input
      bind:value={filter}
      placeholder="Filter {slot.doc.data.channels.length} sounds"
      spellcheck="false"
    />
    <button
      class="bench"
      title="Import sound files into the song (or drop them on the window)"
      data-testid="import-sounds"
      onclick={() => app.commands.run('sounds.import')}>+</button
    >
    <button
      class="bench"
      class:on={app.view.workbench}
      title="Every sound of the song, with waveforms (Ctrl+Shift+B)"
      data-testid="open-workbench"
      onclick={() => (app.view.workbench = !app.view.workbench)}>▦</button
    >
  </div>
  <ul data-testid="channels">
    {#each rows.slice(0, SHOW) as r (r.id)}
      <li>
        {#if renaming === r.id}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="rename"
            value={r.name}
            autofocus
            onkeydown={(e) => {
              if (e.key === 'Enter') commitRename(r.id, e.currentTarget.value);
              if (e.key === 'Escape') renaming = null;
            }}
            onblur={(e) => commitRename(r.id, e.currentTarget.value)}
          />
        {:else}
          <button
            class="item"
            class:brush={app.view.brush === r.id}
            onclick={() => (app.view.brush = r.id)}
            ondblclick={() => (renaming = r.id)}
            title="{r.name} - double-click to rename"
          >
            <span
              class="sw"
              style:--h={channelHue(r.name)}
              class:bad={!!app.audio.loadedInfo(r.name)?.error}
              role="button"
              tabindex="-1"
              title={app.audio.loadedInfo(r.name)?.error ?? 'Listen'}
              onclick={(e) => {
                e.stopPropagation();
                void app.audio.audition(r.name);
              }}
              onkeydown={() => {}}
            ></span>
            <span class="nm">{r.name}</span>
            {#if r.uses}
              <span class="n">{r.uses}</span>
            {:else}
              <span
                class="rm"
                role="button"
                tabindex="0"
                title="Remove (unused)"
                onclick={(e) => {
                  e.stopPropagation();
                  if (app.view.brush === r.id) app.view.brush = null;
                  removeChannel(slot.doc, r.id);
                }}
                onkeydown={(e) => e.key === 'Enter' && removeChannel(slot.doc, r.id)}>×</span
              >
            {/if}
          </button>
        {/if}
      </li>
    {:else}
      <li class="none">{filter ? 'No sound matches' : 'No sounds yet'}</li>
    {/each}
    {#if rows.length > SHOW}<li class="none">
        …and {rows.length - SHOW} more, filter to find them
      </li>{/if}
  </ul>
  {#if unused.length}
    <div class="more">
      <div class="head">
        <span>In the folder, not in this chart</span>
        <button class="ez-btn" onclick={() => add(unused)}>Add all</button>
      </div>
      <ul>
        {#each unused.slice(0, 200) as s (s)}
          <li>
            <button class="item dim" onclick={() => add([s])} title="Add {s}">
              <span class="plus">+</span><span class="nm">{s}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</Drawer>

<style>
  .search {
    display: flex;
    gap: 6px;
    padding: 8px;
    position: sticky;
    top: 0;
    background: #0b0f1c;
    z-index: 1;
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
  .bench {
    all: unset;
    cursor: pointer;
    flex: none;
    width: 30px;
    text-align: center;
    border-radius: 7px;
    border: 1px solid rgba(88, 225, 255, 0.18);
    color: var(--ink-dim);
    font-size: 15px;
  }
  .bench:hover,
  .bench.on {
    color: var(--neon);
    border-color: var(--neon);
  }
  .rename {
    margin: 1px 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 6px 8px;
  }
  .item {
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
  .item:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .item.brush {
    background: rgba(88, 225, 255, 0.12);
    box-shadow: inset 2px 0 0 var(--neon);
  }
  .item.dim {
    color: var(--ink-dim);
  }
  .sw.bad {
    background: repeating-linear-gradient(45deg, var(--err) 0 2px, transparent 2px 4px);
    box-shadow: none;
  }
  .sw {
    cursor: pointer;
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
  .rm {
    color: var(--ink-faint);
    padding: 0 4px;
  }
  .rm:hover {
    color: var(--err);
  }
  .plus {
    color: var(--neon);
    text-align: center;
  }
  .more {
    border-top: 1px solid rgba(88, 225, 255, 0.1);
    padding-top: 6px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px 6px;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .none {
    padding: 10px;
    color: var(--ink-dim);
    font-size: 12px;
  }
</style>
