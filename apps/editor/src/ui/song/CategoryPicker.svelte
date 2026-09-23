<script lang="ts">
  // Which bank of the song wheel the song sits in. EZ2PORT files a user song
  // in exactly one - not in ALL too - so this is where players will find it.
  import { CATEGORIES, unreachableIn, type CategoryKind } from '@ez2bms/chart-core';
  import { app } from '../../state/app.svelte';
  import type { Project } from '../../state/project.svelte';

  let { project }: { project: Project } = $props();
  const current = $derived(app.song.category(project));
  const GROUPS: { kind: CategoryKind; label: string }[] = [
    { kind: 'custom', label: 'The port’s own' },
    { kind: 'featured', label: 'Featured' },
    { kind: 'version', label: 'Game versions' },
    { kind: 'level', label: 'Levels' },
    { kind: 'alphabet', label: 'Title A-Z' },
    { kind: 'other', label: 'Other' },
  ];
  const skipped = $derived(
    unreachableIn(current).filter((m) => project.charts.some((c) => c.mode === m)),
  );
</script>

<div class="row">
  <label for="sm-category">Category on the song wheel</label>
  <select
    id="sm-category"
    data-testid="category"
    value={current}
    onchange={(e) => void app.song.setCategory(Number(e.currentTarget.value))}
  >
    {#each GROUPS as g (g.kind)}
      <optgroup label={g.label}>
        {#each CATEGORIES.filter((c) => c.kind === g.kind) as c (c.id)}
          <option value={c.id}>{c.label}{c.id === 48 ? ' (default)' : ''}</option>
        {/each}
      </optgroup>
    {/each}
  </select>
  <span class="hint">
    Players find the song in this one bank. CUSTOM is one step left of HOT.
    {#if skipped.length}<b class="warn">The {skipped.join(' and ')} pager skips this bank.</b>{/if}
  </span>
</div>

<style>
  .hint {
    font-size: 11px;
    color: var(--ink-faint);
  }
  .warn {
    color: var(--warn);
    font-weight: 600;
  }
</style>
