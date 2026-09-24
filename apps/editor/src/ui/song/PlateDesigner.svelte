<script lang="ts">
  // The title plate: songname.abm, the 256x32 title EZ2PORT's song wheel and
  // result screen show - the only title they show. Words from the song info
  // (or others), in the shipped plates' layout, a version's colour or your
  // own, rendered live by the host exactly as it will be published; or your
  // own 256x32 image. The preview draws it the way the wheel does: added onto
  // the row, black see-through.
  import {
    PLATE_H,
    PLATE_TINTS,
    PLATE_W,
    guessCjkForms,
    hasCjk,
    plateText,
    plateTint,
    songMeta,
    type CjkForms,
    type PlateTint,
  } from '@ez2bms/chart-core';
  import type { PlatePixels } from '../../bridge';
  import { errorText, t, tParts, tSaid, type MessageKey } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';
  import type { Project } from '../../state/project.svelte';

  let { project }: { project: Project } = $props();

  const settings = $derived(project.sidecar.plate ?? {});
  const song = $derived.by(() => {
    for (const c of project.charts) void c.rev;
    const m = songMeta(project.charts.map((c) => ({ data: c.doc.data, tier: c.tier }))).values;
    return { title: m.title || project.name, subtitle: m.subtitle };
  });
  const words = $derived(plateText(settings, song));
  const tint = $derived(plateTint(settings));
  const imageMode = $derived(settings.image !== undefined);
  const cjkWords = $derived(hasCjk(words.title + words.subtitle));

  // ---- the render: the host's, the newest request winning
  let plate = $state.raw<PlatePixels | null>(null);
  let error = $state('');
  const key = $derived.by(() => {
    for (const c of project.charts) void c.rev;
    void project.images;
    return app.art.plateKey(project);
  });
  let seq = 0;
  $effect(() => {
    void key;
    const n = ++seq;
    const t = setTimeout(() => {
      app.art
        .renderPlate(project)
        .then((px) => {
          if (n !== seq) return;
          plate = px;
          error = '';
        })
        .catch((e: unknown) => {
          if (n !== seq) return;
          plate = null;
          error = errorText(e);
        });
    }, 60);
    return () => clearTimeout(t);
  });
  const missing = $derived(plate?.missing ?? []);
  const missingNote = $derived(tParts('plate.missing', { n: missing.length }, ['chars']));

  // ---- the preview: the plate added onto a wheel row, 3x and 1x
  let big = $state<HTMLCanvasElement>();
  let small = $state<HTMLCanvasElement>();
  function paint(c: HTMLCanvasElement | undefined, scale: number, px: PlatePixels | null) {
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const [w, h] = [PLATE_W * scale, PLATE_H * scale];
    c.width = w;
    c.height = h;
    // The wheel's row: a dark band the plate is added onto.
    const band = g.createLinearGradient(0, 0, 0, h);
    band.addColorStop(0, '#0d1630');
    band.addColorStop(0.5, '#15224a');
    band.addColorStop(1, '#0a1026');
    g.fillStyle = band;
    g.fillRect(0, 0, w, h);
    if (!px) return;
    const tile = new OffscreenCanvas(px.w, px.h);
    const tg = tile.getContext('2d')!;
    const id = tg.createImageData(px.w, px.h);
    for (let i = 0; i < px.w * px.h; i++) {
      id.data.set(px.rgb.subarray(i * 3, i * 3 + 3), i * 4);
      id.data[i * 4 + 3] = 255;
    }
    tg.putImageData(id, 0, 0);
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = 'lighter';
    g.drawImage(tile, 0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
  $effect(() => {
    paint(big, 3, plate);
    paint(small, 1, plate);
  });

  // ---- edits
  function setTitle(v: string) {
    void app.art.setPlate({ title: v === '' || v === song.title ? undefined : v });
  }
  function setSubtitle(v: string) {
    // Empty is "no subtitle"; the song's own is no setting at all.
    void app.art.setPlate({ subtitle: v === song.subtitle ? undefined : v });
  }
  function pickTint(id: string) {
    if (id === 'custom') void app.art.setPlate({ tint: 'custom', ink: tint.ink, glow: tint.glow });
    else
      void app.art.setPlate({
        tint: id === 'white' ? undefined : id,
        ink: undefined,
        glow: undefined,
      });
  }
  // chart-core names its tints; a custom one is its colours, with no name to say.
  const tintName = (x: PlateTint) =>
    x.id === 'custom' ? t('plate.tintCustom') : x.said ? tSaid(x.said) : x.label;
  const FORMS: { id: CjkForms; label: MessageKey }[] = [
    { id: 'kr', label: 'plate.cjk.kr' },
    { id: 'jp', label: 'plate.cjk.jp' },
    { id: 'sc', label: 'plate.cjk.sc' },
    { id: 'tc', label: 'plate.cjk.tc' },
    { id: 'hk', label: 'plate.cjk.hk' },
  ];
  const guessed = $derived(
    FORMS.find((f) => f.id === guessCjkForms(words.title + words.subtitle))!,
  );
  async function importImage() {
    const names = await app.art.pickAndImport();
    if (names[0]) await app.art.setPlate({ image: names[0] });
  }
  function setMode(image: boolean) {
    if (image === imageMode) return;
    void app.art.setPlate({ image: image ? (project.images[0] ?? '') : undefined });
  }
</script>

<section class="designer" data-testid="plate-designer" aria-label={t('plate.label')}>
  <div class="stage">
    <canvas
      bind:this={big}
      class="big"
      data-testid="plate-preview"
      width={PLATE_W * 3}
      height={PLATE_H * 3}
    ></canvas>
    <div class="actual">
      <canvas bind:this={small} width={PLATE_W} height={PLATE_H}></canvas>
      <span>{t('plate.actualSize')}</span>
    </div>
    {#if error}
      <p class="err" data-testid="plate-error">{error}</p>
    {/if}
    {#if missing.length}
      <p class="warn" data-testid="plate-missing">
        {#each missingNote as p, i (i)}{#if 'slot' in p}<b>{missing.join(' ')}</b
            >{:else}{p.text}{/if}{/each}
      </p>
    {/if}
  </div>

  <div class="form ez-form">
    <div class="ez-seg" role="group" aria-label={t('plate.shows')}>
      <button class:on={!imageMode} data-testid="plate-mode-text" onclick={() => setMode(false)}
        >{t('plate.text')}</button
      >
      <button class:on={imageMode} data-testid="plate-mode-image" onclick={() => setMode(true)}
        >{t('plate.image')}</button
      >
    </div>

    {#if !imageMode}
      <div class="row">
        <label for="pl-title"
          >{t('plate.title')}
          {#if settings.title !== undefined}<span class="n">{t('plate.titleDiffers')}</span
            >{/if}</label
        >
        <input
          id="pl-title"
          data-testid="plate-title"
          value={words.title}
          placeholder={song.title}
          spellcheck="false"
          onchange={(e) => setTitle(e.currentTarget.value)}
          onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>
      <div class="row">
        <label for="pl-sub"
          >{t('plate.subtitle')} <span class="n">{t('plate.subtitleHint')}</span></label
        >
        <input
          id="pl-sub"
          data-testid="plate-subtitle"
          value={words.subtitle}
          placeholder={t('plate.subtitleNone')}
          spellcheck="false"
          onchange={(e) => setSubtitle(e.currentTarget.value)}
          onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>
      <div class="row">
        <span class="lbl">{t('plate.colour')} <span class="n">{t('plate.colourHint')}</span></span>
        <div class="tints" role="radiogroup" aria-label={t('plate.colours')}>
          {#each [...PLATE_TINTS, { id: 'custom', label: 'Custom', ink: tint.ink, glow: tint.glow }] as x (x.id)}
            <button
              class="tint"
              class:on={tint.id === x.id}
              role="radio"
              aria-checked={tint.id === x.id}
              data-testid="plate-tint-{x.id}"
              title={tintName(x)}
              onclick={() => pickTint(x.id)}
            >
              <span
                class="chip"
                style:color="#{x.ink}"
                style:text-shadow={x.glow ? `0 0 3px #${x.glow}, 0 0 3px #${x.glow}` : 'none'}
                >{x.id === 'custom' ? '?' : 'Aa'}</span
              >
              <span class="name">{tintName(x)}</span>
            </button>
          {/each}
        </div>
      </div>
      {#if tint.id === 'custom'}
        <div class="cols">
          <label class="check"
            >{t('plate.ink')}
            <input
              type="color"
              data-testid="plate-ink"
              value="#{tint.ink}"
              onchange={(e) => void app.art.setPlate({ ink: e.currentTarget.value.slice(1) })}
            /></label
          >
          <label class="check"
            ><input
              type="checkbox"
              checked={!!tint.glow}
              onchange={(e) =>
                void app.art.setPlate({ glow: e.currentTarget.checked ? 'eb4800' : undefined })}
            />{t('plate.glow')}
            {#if tint.glow}<input
                type="color"
                data-testid="plate-glow"
                value="#{tint.glow}"
                onchange={(e) => void app.art.setPlate({ glow: e.currentTarget.value.slice(1) })}
              />{/if}</label
          >
        </div>
      {/if}
      {#if cjkWords || settings.cjk}
        <div class="row">
          <label for="pl-cjk">{t('plate.cjk')} <span class="n">{t('plate.cjkHint')}</span></label>
          <select
            id="pl-cjk"
            data-testid="plate-cjk"
            value={settings.cjk ?? ''}
            onchange={(e) => void app.art.setPlate({ cjk: e.currentTarget.value || undefined })}
          >
            <option value="">{t('plate.cjkAuto', { forms: t(guessed.label) })}</option>
            {#each FORMS as f (f.id)}<option value={f.id}>{t(f.label)}</option>{/each}
          </select>
        </div>
      {/if}
      <p class="hint">{t('plate.textHint')}</p>
    {:else}
      <div class="row">
        <label for="pl-img"
          >{t('plate.imageLabel')} <span class="n">{t('plate.imageHint')}</span></label
        >
        <div class="imgrow">
          <select
            id="pl-img"
            data-testid="plate-image"
            value={settings.image ?? ''}
            onchange={(e) => void app.art.setPlate({ image: e.currentTarget.value })}
          >
            {#if !settings.image}<option value="">{t('plate.choose')}</option>{/if}
            {#each project.images as im (im)}<option value={im}>{im}</option>{/each}
            {#if settings.image && !project.images.includes(settings.image)}
              <option value={settings.image}>{t('song.missing', { file: settings.image })}</option>
            {/if}
          </select>
          <button class="ez-btn" data-testid="plate-import" onclick={() => void importImage()}
            >{t('song.import')}</button
          >
        </div>
      </div>
      <p class="hint">{t('plate.imageInfo')}</p>
    {/if}
  </div>
</section>

<style>
  .designer {
    display: grid;
    grid-template-columns: auto minmax(260px, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1100px;
  }
  .stage {
    display: grid;
    gap: 10px;
    justify-items: start;
  }
  canvas.big {
    width: 768px;
    max-width: 100%;
    height: auto;
    image-rendering: pixelated;
    border-radius: 6px;
    box-shadow:
      0 0 0 1px rgba(88, 225, 255, 0.25),
      0 8px 30px rgba(0, 0, 0, 0.5);
  }
  .actual {
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: 11.5px;
    color: var(--ink-faint);
  }
  .actual canvas {
    width: 256px;
    height: 32px;
    image-rendering: pixelated;
  }
  .form {
    padding: 0;
  }
  .n {
    font-size: 10px;
    color: var(--ink-faint);
    margin-left: 6px;
    text-transform: none;
    letter-spacing: 0;
  }
  .tints {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tint {
    all: unset;
    cursor: pointer;
    display: grid;
    justify-items: center;
    gap: 2px;
    width: 76px;
    padding: 6px 4px;
    border-radius: 7px;
    border: 1px solid rgba(88, 225, 255, 0.15);
    background: #05070d;
  }
  .tint.on {
    border-color: var(--neon);
    box-shadow: 0 0 0 2px rgba(88, 225, 255, 0.15);
  }
  .chip {
    font-weight: 800;
    font-size: 17px;
  }
  .name {
    font-size: 9.5px;
    color: var(--ink-dim);
    text-align: center;
  }
  .cols input[type='color'] {
    width: 38px;
    height: 24px;
    padding: 0;
    border: 0;
    background: none;
  }
  .imgrow {
    display: flex;
    gap: 6px;
  }
  .err,
  .warn {
    margin: 0;
    font-size: 12.5px;
  }
  .err {
    color: var(--err);
  }
  .warn {
    color: var(--warn);
  }
  @media (max-width: 1250px) {
    .designer {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
