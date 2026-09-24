<script lang="ts">
  // Which bank of the song wheel the song sits in. EZ2PORT files a user song
  // in exactly one - not in ALL too - so this is where players will find it.
  import { CATEGORIES, unreachableIn, type CategoryKind } from '@ez2bms/chart-core';
  import { i18n, t, type MessageKey } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';
  import type { Project } from '../../state/project.svelte';

  let { project }: { project: Project } = $props();
  const current = $derived(app.song.category(project));
  const GROUPS: { kind: CategoryKind; label: MessageKey }[] = [
    { kind: 'custom', label: 'category.group.custom' },
    { kind: 'featured', label: 'category.group.featured' },
    { kind: 'version', label: 'category.group.version' },
    { kind: 'level', label: 'category.group.level' },
    { kind: 'alphabet', label: 'category.group.alphabet' },
    { kind: 'other', label: 'category.group.other' },
  ];
  const skipped = $derived(
    unreachableIn(current).filter((m) => project.charts.some((c) => c.mode === m)),
  );
  // Listed as the language lists ("ruby and 5k-only").
  const modes = $derived(new Intl.ListFormat(i18n.locale).format(skipped));
</script>

<div class="row">
  <label for="sm-category">{t('category.label')}</label>
  <select
    id="sm-category"
    data-testid="category"
    value={current}
    onchange={(e) => void app.song.setCategory(Number(e.currentTarget.value))}
  >
    {#each GROUPS as g (g.kind)}
      <optgroup label={t(g.label)}>
        {#each CATEGORIES.filter((c) => c.kind === g.kind) as c (c.id)}
          <option value={c.id}
            >{c.id === 48 ? t('category.default', { name: c.label }) : c.label}</option
          >
        {/each}
      </optgroup>
    {/each}
  </select>
  <span class="hint">
    {t('category.hint')}
    {#if skipped.length}<b class="warn">{t('category.skipped', { modes })}</b>{/if}
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
