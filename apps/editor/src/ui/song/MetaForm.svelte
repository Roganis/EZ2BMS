<script lang="ts">
  // The song's info - what every chart shares, and what EZ2PORT files the
  // song under. Text fields commit when you leave them (one undo step per
  // chart, undoable everywhere from the toast); the key renames the chart
  // files on the next save.
  import { isValidSongKey, type SongField } from '@ez2bms/chart-core';
  import { app } from '../../state/app.svelte';
  import type { Project } from '../../state/project.svelte';
  import CategoryPicker from './CategoryPicker.svelte';

  let { project }: { project: Project } = $props();
  const meta = $derived(app.song.meta(project));
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const FIELDS: { f: SongField; label: string; hint?: string }[] = [
    { f: 'title', label: 'Title' },
    { f: 'subtitle', label: 'Subtitle', hint: 'a second line on the title plate' },
    { f: 'artist', label: 'Artist' },
    { f: 'genre', label: 'Genre' },
  ];

  function commit(f: SongField, v: string) {
    if (v !== meta.values[f]) app.song.setMeta({ [f]: v });
  }
</script>

<div class="meta ez-form" data-testid="song-meta">
  {#each FIELDS as x (x.f)}
    <div class="row">
      <label for="sm-{x.f}"
        >{x.label}
        {#if x.f === 'title'}<span class="n" class:over={bytes(meta.values.title) > 32}
            >{bytes(meta.values.title)}/32 bytes</span
          >{/if}
        {#if meta.differs.includes(x.f)}<span class="differs" title="Saving here makes them equal"
            >charts differ</span
          >{/if}
      </label>
      <input
        id="sm-{x.f}"
        value={meta.values[x.f]}
        placeholder={x.hint ?? ''}
        spellcheck="false"
        onchange={(e) => commit(x.f, e.currentTarget.value)}
        onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </div>
  {/each}
  <div class="row">
    <label for="sm-key">Key <span class="n">the folder EZ2PORT reads</span></label>
    <input
      id="sm-key"
      value={project.sidecar.key}
      spellcheck="false"
      oninput={(e) => (project.sidecar.key = e.currentTarget.value)}
    />
    {#if !isValidSongKey(project.sidecar.key)}<span class="warn"
        >1-15 lowercase letters or digits</span
      >{/if}
  </div>
  <CategoryPicker {project} />
</div>

<style>
  .meta {
    display: grid;
    gap: 2px;
    align-content: start;
  }
  .n {
    font-size: 10px;
    color: var(--ink-faint);
    margin-left: 6px;
  }
  .n.over {
    color: var(--warn);
  }
  .differs {
    font-size: 10px;
    color: var(--warn);
    margin-left: 6px;
  }
</style>
