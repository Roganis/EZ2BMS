<script lang="ts">
  // Publish to EZ2PORT: everything the package will be, worked out before a
  // byte is written - where it goes and whose folder is there now, each
  // chart and what becomes of its scores, the art as the very .abm bytes
  // will show it, the preview, the BGA, the keysounds - then written at once
  // (port/publish.ts), and what came of it.
  import type { PackageOwner } from '@ez2bms/chart-core';
  import { t, tCore, tParts, type MessageKey } from '../i18n/i18n.svelte';
  import type { ChartRow, Thumb } from '../port/publish';
  import { app } from '../state/app.svelte';

  const pub = app.publish;
  const stage = $derived(pub.stage);
  const review = $derived(
    stage.kind === 'ready' ||
      stage.kind === 'writing' ||
      stage.kind === 'done' ||
      (stage.kind === 'failed' && stage.review)
      ? stage.review
      : undefined,
  );
  const blocked = $derived(stage.kind === 'ready' ? pub.blocked(stage.review) : undefined);

  const OWNER: Record<PackageOwner, { text: MessageKey; note: MessageKey }> = {
    new: { text: 'publish.owner.new', note: 'publish.note.new' },
    ours: { text: 'publish.owner.ours', note: 'publish.note.ours' },
    legacy: { text: 'publish.owner.legacy', note: 'publish.note.legacy' },
    foreign: { text: 'publish.owner.foreign', note: 'publish.note.foreign' },
  };
  const scoresText = (s: ChartRow['scores']) =>
    s === 'kept' ? t('publish.scores.kept') : s === 'reset' ? t('publish.scores.reset') : '—';

  const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
  const clock = (ms: number) => {
    const s = ms / 1000;
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  };

  function paint(c: HTMLCanvasElement, t: Thumb) {
    c.width = t.w;
    c.height = t.h;
    const g = c.getContext('2d')!;
    const id = g.createImageData(t.w, t.h);
    id.data.set(t.rgba.subarray(0, t.w * t.h * 4));
    g.putImageData(id, 0, 0);
  }
  function thumb(c: HTMLCanvasElement, t: Thumb) {
    paint(c, t);
    return { update: (n: Thumb) => paint(c, n) };
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && stage.kind !== 'writing') {
      e.preventDefault();
      pub.close();
    }
  }
  const previewing = $derived(app.preview.playing);
  function togglePreview() {
    const p = app.project;
    if (!p) return;
    if (previewing) app.preview.stop();
    else void app.preview.play(p);
  }
  $effect(() => () => app.preview.stop());
</script>

<svelte:window onkeydown={onKey} />
<div
  class="scrim"
  role="presentation"
  onpointerdown={() => stage.kind !== 'writing' && pub.close()}
></div>
<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-label={t('publish.label')}
  data-testid="publish"
>
  <header>
    <h2>{t('publish.heading')}</h2>
    {#if review}
      <code class="dest" title={review.root}>{review.root}/<b>{review.key}</b></code>
      <span class="badge {review.seen.shipped ? 'bad' : review.owner}" data-testid="publish-owner"
        >{t(review.seen.shipped ? 'publish.owner.shipped' : OWNER[review.owner].text)}</span
      >
    {/if}
  </header>

  {#if stage.kind === 'no-root'}
    <p>
      {#each tParts('publish.noRoot', { dir: 'ez2port/songs' }, ['dir']) as p, i (i)}
        {#if 'slot' in p}<code>ez2port/songs</code>{:else}{p.text}{/if}
      {/each}
    </p>
    <div class="actions">
      <button class="ez-btn" onclick={() => pub.close()}>{t('publish.cancel')}</button>
      <button class="ez-btn go" onclick={() => void pub.pickRoot()}
        >{t('publish.chooseRoot')}</button
      >
    </div>
  {:else if stage.kind === 'errors'}
    <div class="block" data-testid="publish-errors">
      <b>{t('publish.errors', { n: stage.errors.length })}</b>
      <ul>
        {#each stage.errors as f, i (i)}<li>{tCore(f)}</li>{/each}
      </ul>
      <button
        class="ez-btn"
        onclick={() => {
          pub.close();
          app.view.right = 'issues';
        }}>{t('publish.showIssues')}</button
      >
    </div>
    <div class="actions">
      <button class="ez-btn" onclick={() => pub.close()}>{t('publish.close')}</button>
    </div>
  {:else if stage.kind === 'preparing'}
    <p class="hint" data-testid="publish-preparing">{t('publish.preparing')}</p>
  {:else if review}
    {#if review.seen.shipped}
      <p class="block">{t('publish.shipped', { key: review.key })}</p>
    {:else}
      <p class="hint">{t(OWNER[review.owner].note)}</p>
      {#if review.owner === 'foreign'}
        {@const parts = tParts(
          'publish.confirmForeign',
          { folder: review.seen.folder, key: review.key },
          ['key'],
        )}
        <label class="confirm">
          <span>
            {#each parts as p, i (i)}
              {#if 'slot' in p}<b>{review.key}</b>{:else}{p.text}{/if}
            {/each}
          </span>
          <input data-testid="publish-confirm-key" bind:value={pub.confirmKey} spellcheck="false" />
        </label>
      {:else if review.owner === 'legacy'}
        <label class="confirm check">
          <input
            type="checkbox"
            data-testid="publish-confirm-legacy"
            bind:checked={pub.confirmLegacy}
          />
          {t('publish.confirmLegacy')}
        </label>
      {/if}
    {/if}

    {#if review.warnings.length}
      <details class="warnings">
        <summary>{t('publish.warnings', { n: review.warnings.length })}</summary>
        <ul>
          {#each review.warnings as f, i (i)}<li>{tCore(f)}</li>{/each}
        </ul>
      </details>
    {/if}

    <div class="grid">
      <section>
        <h3>{t('publish.charts')}</h3>
        <table data-testid="publish-charts">
          <thead>
            <tr>
              <th>{t('publish.col.chart')}</th>
              <th>{t('publish.col.level')}</th>
              <th>{t('publish.col.file')}</th>
              <th>{t('publish.col.scores')}</th>
            </tr>
          </thead>
          <tbody>
            {#each review.charts as c (c.file)}
              <tr data-scores={c.scores}>
                <td>{c.label}</td>
                <td>{c.level}</td>
                <td><code>{c.file}</code></td>
                <td class={c.scores}>{scoresText(c.scores)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="n">
          {t('publish.keysounds', {
            n: review.keysounds.count,
            size: mb(review.keysounds.bytes),
          })}
        </p>
      </section>
      <section class="assets">
        <h3>{t('publish.wheel')}</h3>
        {#if review.art.plate}<canvas class="plate" use:thumb={review.art.plate}></canvas>{/if}
        <div class="pics">
          {#if review.art.disc}<canvas class="disc" use:thumb={review.art.disc}
            ></canvas>{:else}<span class="none">{t('publish.noDisc')}</span>{/if}
          {#if review.art.eyecatch}<canvas class="eye" use:thumb={review.art.eyecatch}
            ></canvas>{:else}<span class="none">{t('publish.noEyecatch')}</span>{/if}
        </div>
        <p class="n">
          {#if review.preview}
            {@const from = clock(review.preview.fromMs)}
            {@const length = (review.preview.lengthMs / 1000).toFixed(1)}
            {review.preview.file
              ? t('publish.previewOf', { from, length, file: review.preview.file })
              : t('publish.preview', { from, length })}
            <button class="ez-btn small" data-testid="publish-preview" onclick={togglePreview}
              >{t(previewing ? 'publish.previewStop' : 'publish.previewPlay')}</button
            >
          {:else}
            {t('publish.noPreview')}
          {/if}
        </p>
        <p class="n">
          {#if review.bga}
            {@const bga = review.bga}
            {@const parts = tParts(
              'publish.bga',
              { src: bga.src, file: bga.file, from: clock(bga.startMs) },
              ['src', 'file'],
            )}
            {#each parts as p, i (i)}
              {#if 'slot' in p}<code>{p.slot === 'src' ? bga.src : bga.file}</code
                >{:else}{p.text}{/if}
            {/each}
          {:else}{t('publish.noBga')}{/if}
        </p>
      </section>
    </div>

    {#if stage.kind === 'writing'}
      <div class="progress" data-testid="publish-writing"><span></span></div>
      <p class="hint">{t('publish.writing', { n: review.keysounds.count })}</p>
    {:else if stage.kind === 'done'}
      <p class="ok" data-testid="publish-done">{stage.text}</p>
      {#if stage.written.missing.length}
        <p class="warn">
          {t('publish.missing', {
            n: stage.written.missing.length,
            files: stage.written.missing.map((m) => m[0]).join(', '),
          })}
        </p>
      {/if}
      {#if stage.written.retire}
        <p class="hint">
          {t('publish.retire', { key: stage.written.retire.key })}
          <button
            class="ez-btn small"
            data-testid="publish-retire"
            onclick={() => void pub.retire()}>{t('publish.retireButton')}</button
          >
        </p>
      {/if}
    {:else if stage.kind === 'failed'}
      <p class="err">{stage.message}</p>
    {/if}

    <div class="actions">
      {#if stage.kind === 'done'}
        <button class="ez-btn go" data-testid="publish-close" onclick={() => pub.close()}
          >{t('publish.done')}</button
        >
      {:else}
        <button class="ez-btn" disabled={stage.kind === 'writing'} onclick={() => pub.close()}
          >{t('publish.cancel')}</button
        >
        <button
          class="ez-btn go"
          data-testid="publish-go"
          disabled={stage.kind !== 'ready' || !!blocked}
          title={blocked ?? ''}
          onclick={() => void pub.write()}
          >{t(review.owner === 'new' ? 'publish.go' : 'publish.goOver')}</button
        >
      {/if}
    </div>
  {:else if stage.kind === 'failed'}
    <p class="err">{stage.message}</p>
    <div class="actions">
      <button class="ez-btn" onclick={() => pub.close()}>{t('publish.close')}</button>
    </div>
  {/if}
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(2, 3, 8, 0.6);
    z-index: 30;
  }
  .dialog {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(900px, 94vw);
    max-height: 90vh;
    overflow: auto;
    z-index: 31;
    padding: 20px 22px;
    border-radius: 16px;
    background: linear-gradient(160deg, #111831, #070a14);
    border: 1px solid rgba(88, 225, 255, 0.35);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
    display: grid;
    gap: 12px;
  }
  header {
    display: flex;
    gap: 12px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--neon);
  }
  h3 {
    margin: 0 0 8px;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .dest {
    font-size: 12px;
    color: var(--ink-dim);
    overflow-wrap: anywhere;
  }
  .dest b {
    color: var(--ink);
  }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--ink-faint);
    color: var(--ink-dim);
  }
  .badge.new,
  .badge.ours {
    border-color: var(--ok);
    color: var(--ok);
  }
  .badge.legacy,
  .badge.foreign {
    border-color: var(--warn);
    color: var(--warn);
  }
  .badge.bad {
    border-color: var(--err);
    color: var(--err);
  }
  p {
    margin: 0;
    font-size: 12.5px;
  }
  .hint,
  .n {
    color: var(--ink-dim);
    font-size: 12px;
  }
  .block {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 84, 112, 0.4);
    background: rgba(255, 84, 112, 0.06);
    font-size: 12.5px;
    display: grid;
    gap: 6px;
    justify-items: start;
  }
  .block ul {
    margin: 0;
    padding-left: 18px;
  }
  .warnings {
    font-size: 12px;
    color: var(--warn);
  }
  .warnings summary {
    cursor: pointer;
  }
  .warnings ul {
    margin: 6px 0 0;
    padding-left: 18px;
    color: var(--ink-dim);
  }
  .confirm {
    display: grid;
    gap: 6px;
    font-size: 12.5px;
  }
  .confirm input:not([type='checkbox']) {
    width: 200px;
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid rgba(88, 225, 255, 0.3);
    background: rgba(0, 0, 0, 0.3);
    color: var(--ink);
    font-family: var(--font-num);
  }
  .confirm.check {
    display: flex;
    align-items: center;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    gap: 18px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: var(--ink-faint);
    padding: 3px 6px;
  }
  td {
    padding: 4px 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }
  td code {
    font-size: 11px;
  }
  td.kept {
    color: var(--ok);
  }
  td.reset {
    color: var(--warn);
  }
  .assets {
    display: grid;
    gap: 8px;
    align-content: start;
  }
  canvas {
    display: block;
    image-rendering: auto;
  }
  .plate {
    width: 256px;
    height: 32px;
    max-width: 100%;
    background: #000;
  }
  .pics {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .disc {
    width: 96px;
    height: 96px;
    border-radius: 50%;
  }
  .eye {
    width: 192px;
    height: 96px;
  }
  .none {
    font-size: 11px;
    color: var(--ink-faint);
  }
  .progress {
    height: 4px;
    border-radius: 2px;
    background: rgba(88, 225, 255, 0.15);
    overflow: hidden;
  }
  .progress span {
    display: block;
    width: 30%;
    height: 100%;
    background: var(--neon);
    animation: slide 1.1s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(340%);
    }
  }
  .ok {
    color: var(--ok);
  }
  .warn {
    color: var(--warn);
  }
  .err {
    color: var(--err);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .go {
    border-color: var(--neon);
    color: var(--neon);
  }
  .small {
    padding: 2px 8px;
    font-size: 11px;
    margin-left: 6px;
  }
  @media (max-width: 760px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
