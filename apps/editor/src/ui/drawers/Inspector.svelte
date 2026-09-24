<script lang="ts">
  // The selected notes: sound, length, hold kind, velocity and pan (what the
  // cabinet's mixer does with them), and quick actions.
  import {
    BGM,
    HOLD_KINDS,
    dsLevel,
    dsPan,
    formatPosition,
    holdPreview,
    MIX_UNITY,
    PAN_CENTRE,
    positionOf,
    setChannel,
    setHoldKind,
    setLength,
    setVelPan,
    type NoteRec,
  } from '@ez2bms/chart-core';
  import { t, tParts, tSaid } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';
  import type { ChartSlot } from '../../state/project.svelte';
  import { toast } from '../../state/toasts.svelte';

  let { slot }: { slot: ChartSlot } = $props();
  const d = $derived(slot.doc);
  const notes: NoteRec[] = $derived.by(() => {
    void slot.rev;
    return slot.doc.selectedNotes();
  });
  const ids = $derived(notes.map((n) => n.id));
  const common = <T,>(f: (n: NoteRec) => T): T | undefined => {
    const v0 = notes.length ? f(notes[0]!) : undefined;
    return notes.every((n) => f(n) === v0) ? v0 : undefined;
  };
  const ch = $derived(common((n) => n.ch));
  const kind = $derived(common((n) => n.kind ?? 0));
  const vel = $derived(common((n) => n.vel ?? 127));
  const pan = $derived(common((n) => n.pan ?? 64));
  const holds = $derived(notes.filter((n) => n.l > 0));
  /** What the selected holds are paid and counted for (engine/holdpreview.ts), summed. */
  const holdSums = $derived.by(() => {
    void slot.rev;
    let judged = 0;
    let counts = 0;
    let short = false;
    for (const n of holds) {
      const p = holdPreview(d.data, n);
      if (!p) continue;
      judged += 1 + p.pays;
      counts += p.counts;
      short ||= !p.balanced;
    }
    return holds.length ? { judged, counts, short } : null;
  });
  const beats = $derived(
    holds.length && common((n) => n.l) !== undefined ? holds[0]!.l / d.resolution : undefined,
  );
  const first = $derived(notes.length ? Math.min(...notes.map((n) => n.y)) : 0);
  const lanes = $derived(new Set(notes.map((n) => n.x)).size);
  const bgm = $derived(notes.filter((n) => n.x === BGM).length);
  const db = (v: number) => (dsLevel(MIX_UNITY, MIX_UNITY, MIX_UNITY, v) / 100).toFixed(1);
  const panText = (p: number) => {
    const ds = dsPan(PAN_CENTRE, p);
    return ds === 0
      ? t('inspector.panCentre')
      : t('inspector.panSide', {
          side: ds < 0 ? 'left' : 'right',
          db: (Math.abs(ds) / 100).toFixed(1),
        });
  };
  /** The key caps the hints name, by their slot in the messages. */
  const KEYS: Record<string, string> = {
    shift: 'Shift',
    alt: 'Alt',
    l: 'L',
    k: 'K',
    m: 'M',
    lanes: 'Alt ← →',
    snap: '[ ]',
    b: 'B',
    tab: 'Tab',
    palette: 'Ctrl K',
  };
  const dragHint = $derived(tParts('inspector.hintDrag', {}, Object.keys(KEYS)));
  const keysHint = $derived(tParts('inspector.hintKeys', {}, Object.keys(KEYS)));
  const summary = $derived(
    tParts('inspector.summary', { n: notes.length, lanes, bgm }, ['count', 'pos']),
  );
</script>

<div class="ez-form">
  {#if !notes.length}
    <p class="hint">
      {t('inspector.hintPlace')}<br />
      {#each dragHint as p, i (i)}{#if 'slot' in p}<kbd>{KEYS[p.slot]}</kbd
          >{:else}{p.text}{/if}{/each}
    </p>
    <p class="hint">
      {#each keysHint as p, i (i)}{#if 'slot' in p}<kbd>{KEYS[p.slot]}</kbd
          >{:else}{p.text}{/if}{/each}
    </p>
  {:else}
    <div class="row">
      <span class="lbl">{t('inspector.selection')}</span>
      <div class="sum">
        {#each summary as p, i (i)}{#if 'slot' in p}{#if p.slot === 'count'}<b>{notes.length}</b
              >{:else}<code>{formatPosition(positionOf(first, d.resolution))}</code
              >{/if}{:else}{p.text}{/if}{/each}
      </div>
    </div>
    <div class="row">
      <label for="ins-ch">{t('inspector.sound')}</label>
      <select
        id="ins-ch"
        value={ch ?? ''}
        onchange={(e) => setChannel(d, ids, Number(e.currentTarget.value))}
      >
        {#if ch === undefined}<option value="" disabled>{t('inspector.several')}</option>{/if}
        {#each d.data.channels as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </div>
    <div class="cols">
      <div class="row">
        <label for="ins-len">{t('inspector.holdBeats')}</label>
        <input
          id="ins-len"
          type="number"
          min="0"
          step={4 / app.view.snap}
          value={beats ?? ''}
          placeholder={holds.length ? t('inspector.lengthMixed') : t('inspector.lengthTap')}
          onchange={(e) => {
            const b = Number(e.currentTarget.value);
            if (!setLength(d, ids, b * d.resolution)) toast(t('inspector.lengthCovers'), 'warn');
          }}
        />
      </div>
      <div class="row">
        <label for="ins-kind">{t('inspector.holdKind')}</label>
        <select
          id="ins-kind"
          value={kind ?? ''}
          onchange={(e) => setHoldKind(d, ids, Number(e.currentTarget.value))}
        >
          {#if kind === undefined}<option value="" disabled>{t('inspector.several')}</option>{/if}
          {#if kind !== undefined && kind > 12}<option value={kind}
              >{t('inspector.kindUnknown', { kind })}</option
            >{/if}
          {#each HOLD_KINDS as k (k.kind)}<option value={k.kind}>{k.kind}: {tSaid(k.said)}</option
            >{/each}
        </select>
      </div>
    </div>
    {#if holdSums}
      <p class="hint" data-testid="hold-counts" class:warn={holdSums.short}>
        {t(holdSums.short ? 'inspector.holdCountsShort' : 'inspector.holdCounts', {
          judged: holdSums.judged,
          counts: holdSums.counts,
        })}
      </p>
    {/if}
    <div class="row">
      <label for="ins-vel"
        >{t('inspector.velocity')}
        <span class="num"
          >{vel !== undefined ? t('inspector.velocityDb', { vel, db: db(vel) }) : '—'}</span
        ></label
      >
      <input
        id="ins-vel"
        type="range"
        min="0"
        max="127"
        value={vel ?? 127}
        oninput={(e) => setVelPan(d, ids, { vel: Number(e.currentTarget.value) }, 'vel')}
      />
    </div>
    <div class="row">
      <label for="ins-pan"
        >{t('inspector.pan')}
        <span class="num">{pan !== undefined ? panText(pan) : '—'}</span></label
      >
      <input
        id="ins-pan"
        type="range"
        min="0"
        max="127"
        value={pan ?? 64}
        oninput={(e) => setVelPan(d, ids, { pan: Number(e.currentTarget.value) }, 'pan')}
      />
    </div>
    <div class="cols">
      <button class="ez-btn" onclick={() => app.commands.run('notes.hold')}
        >{t('inspector.hold')} <kbd>L</kbd></button
      >
      <button class="ez-btn" onclick={() => app.commands.run('notes.mirror')}
        >{t('inspector.mirror')} <kbd>M</kbd></button
      >
      <button class="ez-btn danger" onclick={() => app.commands.run('edit.delete')}
        >{t('inspector.delete')}</button
      >
    </div>
  {/if}
</div>

<style>
  .sum {
    color: var(--ink);
  }
  .hint.warn {
    color: var(--warn);
  }
  code,
  .num {
    font-family: var(--font-num);
    color: var(--neon);
    letter-spacing: 0;
    text-transform: none;
  }
</style>
