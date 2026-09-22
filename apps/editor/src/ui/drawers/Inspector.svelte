<script lang="ts">
  // The selected notes: sound, length, hold kind, velocity and pan (what the
  // cabinet's mixer does with them), and quick actions.
  import {
    BGM,
    HOLD_KINDS,
    dsLevel,
    dsPan,
    formatPosition,
    MIX_UNITY,
    PAN_CENTRE,
    positionOf,
    setChannel,
    setHoldKind,
    setLength,
    setVelPan,
    type NoteRec,
  } from '@ez2bms/chart-core';
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
  const beats = $derived(
    holds.length && common((n) => n.l) !== undefined ? holds[0]!.l / d.resolution : undefined,
  );
  const first = $derived(notes.length ? Math.min(...notes.map((n) => n.y)) : 0);
  const lanes = $derived(new Set(notes.map((n) => n.x)).size);
  const bgm = $derived(notes.filter((n) => n.x === BGM).length);
  const db = (v: number) => (dsLevel(MIX_UNITY, MIX_UNITY, MIX_UNITY, v) / 100).toFixed(1);
  const panText = (p: number) => {
    const ds = dsPan(PAN_CENTRE, p);
    return ds === 0 ? 'centre' : `${ds < 0 ? 'L' : 'R'} ${(Math.abs(ds) / 100).toFixed(1)} dB`;
  };
</script>

<div class="ez-form">
  {#if !notes.length}
    <p class="hint">
      Click a lane to place a note with the sound picked on the left; drag up to make a hold.<br />
      Drag notes to move them, their end to resize. Right-drag erases, <kbd>Shift</kbd>-drag
      selects, <kbd>Alt</kbd>-click picks up a note's sound.
    </p>
    <p class="hint">
      <kbd>L</kbd> hold · <kbd>K</kbd> hold kind · <kbd>M</kbd> mirror · <kbd>Alt ← →</kbd> lanes ·
      <kbd>[ ]</kbd>
      snap ·
      <kbd>B</kbd> BPM · <kbd>Tab</kbd> play view · <kbd>Ctrl K</kbd> everything else
    </p>
  {:else}
    <div class="row">
      <span class="lbl">Selection</span>
      <div class="sum">
        <b>{notes.length}</b> note{notes.length === 1 ? '' : 's'} · {lanes} lane{lanes === 1
          ? ''
          : 's'}{bgm ? ` · ${bgm} background` : ''}
        · from <code>{formatPosition(positionOf(first, d.resolution))}</code>
      </div>
    </div>
    <div class="row">
      <label for="ins-ch">Sound</label>
      <select
        id="ins-ch"
        value={ch ?? ''}
        onchange={(e) => setChannel(d, ids, Number(e.currentTarget.value))}
      >
        {#if ch === undefined}<option value="" disabled>(several)</option>{/if}
        {#each d.data.channels as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </div>
    <div class="cols">
      <div class="row">
        <label for="ins-len">Hold, beats</label>
        <input
          id="ins-len"
          type="number"
          min="0"
          step={4 / app.view.snap}
          value={beats ?? ''}
          placeholder={holds.length ? 'mixed' : 'tap'}
          onchange={(e) => {
            const b = Number(e.currentTarget.value);
            if (!setLength(d, ids, b * d.resolution))
              toast('That length would cover another note', 'warn');
          }}
        />
      </div>
      <div class="row">
        <label for="ins-kind">Hold kind</label>
        <select
          id="ins-kind"
          value={kind ?? ''}
          onchange={(e) => setHoldKind(d, ids, Number(e.currentTarget.value))}
        >
          {#if kind === undefined}<option value="" disabled>(several)</option>{/if}
          {#each HOLD_KINDS as k (k.kind)}<option value={k.kind}>{k.label}</option>{/each}
        </select>
      </div>
    </div>
    <div class="row">
      <label for="ins-vel"
        >Velocity <span class="num">{vel ?? '—'}{vel !== undefined ? ` · ${db(vel)} dB` : ''}</span
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
        >Pan <span class="num">{pan !== undefined ? panText(pan) : '—'}</span></label
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
        >Hold <kbd>L</kbd></button
      >
      <button class="ez-btn" onclick={() => app.commands.run('notes.mirror')}
        >Mirror <kbd>M</kbd></button
      >
      <button class="ez-btn danger" onclick={() => app.commands.run('edit.delete')}>Delete</button>
    </div>
  {/if}
</div>

<style>
  .sum {
    color: var(--ink);
  }
  code,
  .num {
    font-family: var(--font-num);
    color: var(--neon);
    letter-spacing: 0;
    text-transform: none;
  }
</style>
