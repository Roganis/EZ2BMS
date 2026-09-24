<script lang="ts">
  // Controls and timing: the player's bindings (bound by pressing, four a
  // channel), the turntables, the controllers SDL sees and what they report
  // now, the debounce and the latency offsets. See state/controls.svelte.ts.
  import {
    HAT_NAMES,
    KEY_ALTS,
    KEY_CHANNELS,
    LANES,
    modeDef,
    parseBindspec,
    routeChannel,
  } from '@ez2bms/chart-core';
  import { onMount } from 'svelte';
  import { app } from '../state/app.svelte';
  import { CAL_BEATS, CAL_WARMUP } from '../state/calibrator.svelte';
  import type { ControlsRow } from '../state/controls.svelte';

  const c = app.controls;
  const s = app.settings;

  /** Redrawn every frame while open: which channels are down, what pads read. */
  let frame = $state(0);
  onMount(() => {
    let raf = 0;
    const tick = () => {
      frame++;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const isDown = (ch: number) => (void frame, app.input.mapper.isDown(ch));

  /** Where a channel plays in the open chart's mode, as EZ2PORT sends it. */
  function laneOf(ch: number): string {
    const slot = app.slot;
    if (!slot) return '';
    const cols = modeDef(slot.mode).columns;
    const r = routeChannel(slot.mode, cols, ch);
    if (!r) return '';
    if ('strum' in r) return 'strum';
    const x = cols[r.column]!.x;
    return LANES.find((l) => l.x === x)?.short ?? String(x);
  }

  function axisOf(which: 0 | 1) {
    const spec = parseBindspec(c.conf.analog[which] ?? '');
    return spec?.kind === 'axis' ? spec : null;
  }

  function readout(key: string) {
    void frame;
    const p = app.input.mapper.padState(key);
    if (!p) return { buttons: [] as number[], hats: [] as string[], axes: [] as number[] };
    const dev = app.input.devices.find((d) => d.key === key);
    const buttons: number[] = [];
    p.btn.forEach((v, i) => v && buttons.push(i));
    const hats: string[] = [];
    const MASK = [1, 3, 2, 6, 4, 12, 8, 9];
    p.hat.forEach((v, i) => {
      const d = MASK.indexOf(v);
      if (v && d >= 0) hats.push(`h${i}.${HAT_NAMES[d]}`);
    });
    return { buttons, hats, axes: Array.from(p.axis.slice(0, dev?.axes ?? 0)) };
  }

  const waiting = (row: ControlsRow) => c.binding === row;

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      c.close();
    }
  }
</script>

<svelte:window onkeydown={onKey} />
<div class="scrim" role="presentation" onpointerdown={() => c.close()}></div>
<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-label="Controls and timing"
  tabindex="-1"
  data-testid="controls-dialog"
>
  <header>
    <h2>Controls and timing</h2>
    <div class="ez-seg">
      {#each [['channels', 'Bindings'], ['devices', 'Controllers'], ['timing', 'Timing']] as const as [id, label] (id)}
        <button
          class:on={c.tab === id}
          onclick={() => (c.tab = id)}
          data-testid={`controls-tab-${id}`}>{label}</button
        >
      {/each}
    </div>
  </header>

  {#if c.tab === 'channels'}
    <p class="hint">
      Four bindings a channel, keys or controller buttons and hats: <b>+</b> and press one. They are
      EZ2BMS's own; EZ2PORT's <code>keys.ini</code> is only read.
    </p>
    <div class="rows">
      {#each KEY_CHANNELS as name, ch (name)}
        <div class="row" class:down={isDown(ch)} data-testid={`controls-row-${name}`}>
          <span class="name">{name}</span>
          <span class="lane" title="Where it plays in this chart's mode">{laneOf(ch)}</span>
          <span class="chips">
            {#each c.conf.names[ch] ?? [] as tok, i (tok)}
              <span class="chip" data-testid="binding-chip"
                ><span data-testid="binding-token">{c.label(tok)}</span><button
                  class="x"
                  title="Remove"
                  data-testid="binding-remove"
                  onclick={() => c.remove(ch, i)}>×</button
                ></span
              >
            {/each}
            {#if waiting(ch)}
              <button class="chip wait" data-testid="binding-wait" onclick={() => c.cancelBind()}
                >Press a key or button… <kbd>Esc</kbd></button
              >
            {:else if (c.conf.names[ch]?.length ?? 0) < KEY_ALTS}
              <button
                class="chip add"
                title="Bind by pressing"
                data-testid="binding-add"
                onclick={() => void c.bind(ch)}>+</button
              >
            {/if}
          </span>
        </div>
      {/each}
      {#each [0, 1] as const as which (which)}
        {@const row = which ? ('tt1' as const) : ('tt0' as const)}
        {@const axis = axisOf(which)}
        <div class="row tt" data-testid={`controls-row-${which ? 'P2Turntable' : 'Turntable'}`}>
          <span class="name">{which ? 'P2 Turntable' : 'Turntable'}</span>
          <span class="lane">axis</span>
          <span class="chips">
            {#if c.conf.analog[which]}
              <span class="chip"
                >{c.label(c.conf.analog[which]!)}<button
                  class="x"
                  title="Remove"
                  onclick={() => c.remove(row)}>×</button
                ></span
              >
            {/if}
            {#if waiting(row)}
              <button class="chip wait" data-testid="binding-wait" onclick={() => c.cancelBind()}
                >Turn it… <kbd>Esc</kbd></button
              >
            {:else}
              <button
                class="chip add"
                title="Bind an axis by turning it"
                data-testid="binding-add"
                onclick={() => void c.bind(row)}>{c.conf.analog[which] ? '↻' : '+'}</button
              >
            {/if}
            {#if axis}
              <label class="flag"
                ><input
                  type="checkbox"
                  checked={axis.reverse}
                  onchange={() => c.toggle(which, 'reverse')}
                  data-testid="tt-rev"
                /> reversed</label
              >
              <label class="flag"
                ><input
                  type="checkbox"
                  checked={axis.velocity}
                  onchange={() => c.toggle(which, 'velocity')}
                  data-testid="tt-vel"
                /> speed, not position</label
              >
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {:else if c.tab === 'devices'}
    {#if app.input.padError}
      <p class="warn">Controllers are unavailable: {app.input.padError}</p>
    {/if}
    {#if !app.input.devices.length}
      <p class="hint">No controller found. Plug one in: it shows here as soon as it is seen.</p>
    {/if}
    {#each app.input.devices as d (d.key)}
      {@const r = readout(d.key)}
      <div class="device" data-testid="pad-device">
        <div class="dev-head">
          <b>{d.name}</b> <code>{d.key}</code>
          <span class="dim">{d.buttons} buttons · {d.axes} axes · {d.hats} hats</span>
        </div>
        <div class="readout" data-testid="pad-readout">
          <span>buttons: {r.buttons.length ? r.buttons.map((b) => `b${b}`).join(' ') : '-'}</span>
          {#if r.hats.length}<span>{r.hats.join(' ')}</span>{/if}
          {#each r.axes as v, i (i)}
            <span class="axis" title={`a${i}: ${v}`}
              >a{i}<i style:width={`${((v + 32768) / 65535) * 100}%`}></i></span
            >
          {/each}
        </div>
      </div>
    {/each}
  {:else}
    {@const cal = app.calibrator}
    <p class="hint">
      How late EZ2BMS hears, shows and takes presses on this machine. EZ2PORT has no offsets: these
      are for playing and recording in the editor only.
    </p>
    <div class="tests">
      <div class="test">
        <b>Sound test</b>
        <span class="dim"
          >Tap any of your keys or buttons on each click (20, the first 4 to find the beat). Sets
          the input offset.</span
        >
        <button
          class="ez-btn"
          disabled={cal.running}
          onclick={() => void cal.start('sound')}
          data-testid="calibrate-sound">Start</button
        >
      </div>
      <div class="test">
        <b>Picture test</b>
        <span class="dim"
          >Tap on each flash (silent). Sets the picture offset; run the sound test first.</span
        >
        <button
          class="ez-btn"
          disabled={cal.running}
          onclick={() => void cal.start('picture')}
          data-testid="calibrate-picture">Start</button
        >
      </div>
    </div>
    {#if cal.running}
      <div class="running" data-testid="calibrate-running">
        {#if cal.kind === 'picture'}
          <div class="flash" class:on={cal.flash} data-testid="calibrate-flash"></div>
        {/if}
        <div class="dots">
          {#each Array.from({ length: CAL_BEATS }, (_, k) => k) as k (k)}
            <i class:done={k <= cal.beat} class:warm={k < CAL_WARMUP}></i>
          {/each}
        </div>
        <span>{cal.taps} taps</span>
        <button class="ez-btn" onclick={() => cal.stop()}>Stop</button>
      </div>
    {:else if cal.result}
      <div class="result" data-testid="calibrate-result">
        Taps land <b
          >{Math.abs(Math.round(cal.result.offsetMs))} ms
          {cal.result.offsetMs >= 0 ? 'late' : 'early'}</b
        >
        <span class="dim"
          >({cal.result.used} taps, spread {cal.result.spreadMs.toFixed(1)} ms{cal.result.dropped
            ? `, ${cal.result.dropped} left out`
            : ''})</span
        >
        <button class="ez-btn go" onclick={() => cal.apply()} data-testid="calibrate-apply"
          >Use as the {cal.kind === 'sound' ? 'input' : 'picture'} offset</button
        >
      </div>
    {:else if cal.failed}
      <p class="warn" data-testid="calibrate-failed">
        Too few taps on the beat to tell. Try again, tapping on every {cal.kind === 'sound'
          ? 'click'
          : 'flash'}.
      </p>
    {/if}
    <div class="timing">
      <label
        >Audio offset (ms)<input
          type="number"
          step="1"
          value={s.data.audioOffsetMs}
          onchange={(e) => s.set('audioOffsetMs', Number(e.currentTarget.value) || 0)}
          data-testid="offset-audio"
        /></label
      >
      <label
        >Picture offset (ms)<input
          type="number"
          step="1"
          value={s.data.visualOffsetMs}
          onchange={(e) => s.set('visualOffsetMs', Number(e.currentTarget.value) || 0)}
          data-testid="offset-visual"
        /></label
      >
      <label
        >Input offset (ms)<input
          type="number"
          step="1"
          value={s.data.inputOffsetMs}
          onchange={(e) => s.set('inputOffsetMs', Number(e.currentTarget.value) || 0)}
          data-testid="offset-input"
        /></label
      >
    </div>
  {/if}

  <footer>
    {#if c.tab === 'channels'}
      <label class="deb"
        >Debounce <input
          type="number"
          min="0"
          max="100"
          value={c.debounceMs}
          onchange={(e) => c.setDebounce(Number(e.currentTarget.value))}
          data-testid="controls-debounce"
        /> ms</label
      >
      <span class="grow"></span>
      <button class="ez-btn" onclick={() => c.resetDefaults()} data-testid="controls-reset"
        >EZ2PORT defaults</button
      >
      <button class="ez-btn" onclick={() => void c.importPort()} data-testid="controls-import"
        >Import from EZ2PORT</button
      >
      <button class="ez-btn" onclick={() => void c.copy()} data-testid="controls-copy"
        >Copy as keys.ini</button
      >
    {:else}
      <span class="grow"></span>
    {/if}
    <button class="ez-btn go" onclick={() => c.close()} data-testid="controls-close">Done</button>
  </footer>
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
    width: min(880px, 96vw);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 31;
    padding: 18px 22px;
    border-radius: 16px;
    background: linear-gradient(160deg, #111831, #070a14);
    border: 1px solid rgba(88, 225, 255, 0.35);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .warn {
    color: var(--warn, #ffb347);
    font-size: 12px;
  }
  .rows {
    overflow: auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 14px;
    padding-right: 4px;
  }
  .row {
    display: grid;
    grid-template-columns: 96px 38px 1fr;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border-radius: 6px;
    border: 1px solid transparent;
    transition: background 0.08s;
  }
  .row.down {
    background: rgba(88, 225, 255, 0.16);
    border-color: rgba(88, 225, 255, 0.5);
  }
  .row.tt {
    grid-column: span 2;
    grid-template-columns: 96px 38px 1fr;
  }
  .name {
    font-size: 12px;
    font-family: var(--font-num);
  }
  .lane {
    font-size: 10px;
    color: var(--ink-faint);
    text-align: center;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-family: var(--font-num);
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid rgba(88, 225, 255, 0.3);
    background: rgba(88, 225, 255, 0.06);
    color: var(--ink);
  }
  button.chip {
    cursor: pointer;
  }
  .chip.add {
    min-width: 22px;
    justify-content: center;
  }
  .chip.wait {
    border-color: var(--neon);
    box-shadow: 0 0 10px rgba(88, 225, 255, 0.4);
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.6;
    }
  }
  .x {
    all: unset;
    cursor: pointer;
    color: var(--ink-faint);
  }
  .x:hover {
    color: #ff6b8a;
  }
  .flag {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    font-size: 11px;
    color: var(--ink-dim);
  }
  .device {
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(88, 225, 255, 0.18);
  }
  .dev-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 13px;
  }
  .dim {
    color: var(--ink-faint);
    font-size: 11px;
  }
  .readout {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 6px;
    font-size: 11px;
    font-family: var(--font-num);
    color: var(--ink-dim);
  }
  .axis {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: 120px;
  }
  .axis i {
    display: block;
    height: 4px;
    border-radius: 2px;
    background: var(--neon);
  }
  .tests {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .test {
    display: grid;
    gap: 6px;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid rgba(88, 225, 255, 0.18);
    font-size: 12px;
  }
  .test .ez-btn {
    justify-self: start;
  }
  .running,
  .result {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
  }
  .flash {
    width: 64px;
    height: 64px;
    border-radius: 10px;
    background: #111831;
    border: 1px solid rgba(88, 225, 255, 0.3);
  }
  .flash.on {
    background: #fff;
    box-shadow: 0 0 30px #fff;
  }
  .dots {
    display: flex;
    gap: 4px;
  }
  .dots i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(88, 225, 255, 0.15);
  }
  .dots i.warm {
    background: rgba(138, 143, 168, 0.25);
  }
  .dots i.done {
    background: var(--neon);
  }
  .timing {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .timing label {
    display: grid;
    gap: 4px;
    font-size: 11px;
    color: var(--ink-dim);
  }
  code {
    font-family: var(--font-num);
    color: var(--neon);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .deb {
    font-size: 12px;
    color: var(--ink-dim);
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .deb input {
    width: 56px;
  }
  .grow {
    flex: 1;
  }
  .go {
    border-color: var(--neon);
  }
</style>
