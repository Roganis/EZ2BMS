// The editor's one root object: the backend, settings, the open project, how
// it is viewed, and every command. Components import `app` and read from it.

import { hasMessage, i18n, t, type LanguageChoice } from '../i18n/i18n.svelte';
import { BMS_FILE, setBpmAt, type ChartDoc, type Clip } from '@ez2bms/chart-core';
import { AudioClient } from '../audio/client.svelte';
import {
  baseName,
  createBackend,
  dirName,
  samePath,
  type AudioInfo,
  type Backend,
} from '../bridge';
import { InputHub } from '../input/hub.svelte';
import { PlayController } from '../play/controller.svelte';
import { Recorder } from '../play/recorder.svelte';
import { PortState } from './port.svelte';
import { Autosave, formatWhen } from './autosave';
import { Commands } from '../commands/registry';
import { Project, type ChartSlot } from './project.svelte';
import { Settings } from './settings.svelte';
import { SkinState } from './skin.svelte';
import { Calibrator } from './calibrator.svelte';
import { describeError, Diagnostics } from './diag.svelte';
import { Updates } from './updates.svelte';
import { ClassicState } from './classic.svelte';
import { ControlsState } from './controls.svelte';
import { SoundsState } from './sounds.svelte';
import { SongState } from './song.svelte';
import { ArtState } from './art.svelte';
import { PreviewState } from './preview.svelte';
import { BgaState } from './bga.svelte';
import { PublishState } from './publish.svelte';
import { StripsState } from './strips.svelte';
import { Importer } from './importer.svelte';
import { Exporter } from './exporter.svelte';
import { ask, toast } from './toasts.svelte';
import { View } from './view.svelte';

export class App {
  readonly settings: Settings;
  readonly view = new View();
  readonly commands = new Commands();
  readonly audio: AudioClient;
  readonly input: InputHub;
  readonly play: PlayController;
  readonly recorder: Recorder;
  readonly port: PortState;
  readonly autosave: Autosave;
  readonly skin: SkinState;
  readonly classic: ClassicState;
  readonly sounds: SoundsState;
  readonly song: SongState;
  readonly art: ArtState;
  readonly preview: PreviewState;
  readonly bga: BgaState;
  readonly publish: PublishState;
  readonly strips: StripsState;
  readonly importer: Importer;
  readonly exporter: Exporter;
  readonly controls: ControlsState;
  readonly calibrator: Calibrator;
  readonly diag: Diagnostics;
  readonly updates: Updates;
  project = $state<Project | null>(null);
  audioInfo = $state<AudioInfo | null>(null);
  ready = $state(false);
  prefsOpen = $state(false);
  /** Copied notes (in the app, not the system clipboard). */
  clip: Clip | undefined;

  constructor(readonly backend: Backend) {
    this.settings = new Settings(backend);
    this.audio = new AudioClient(backend, this.view, this.settings);
    this.input = new InputHub(this);
    this.play = new PlayController(this);
    this.recorder = new Recorder(this);
    this.port = new PortState(this);
    this.autosave = new Autosave(backend);
    this.skin = new SkinState(backend);
    this.classic = new ClassicState(this);
    this.sounds = new SoundsState(this);
    this.song = new SongState(this);
    this.art = new ArtState(this);
    this.preview = new PreviewState(this);
    this.bga = new BgaState(this);
    this.publish = new PublishState(this);
    this.strips = new StripsState(this);
    this.importer = new Importer(this);
    this.exporter = new Exporter(this);
    this.controls = new ControlsState(this);
    this.calibrator = new Calibrator(this);
    this.diag = new Diagnostics(this);
    this.updates = new Updates(this);
    this.commands.onError = (e, c) => {
      const message = e instanceof Error ? e.message : String(e);
      this.backend.diag.log('warn', `${c.id}: ${describeError(e).detail}`);
      toast(t('app.commandFailed', { command: this.commands.titleOf(c), message }), 'error');
    };
    this.commands.localize = (c) => {
      const key = `cmd.${c.id}`;
      if (hasMessage(key)) return t(key);
      // Ctrl+1 … Ctrl+9: one sentence with the chart's number.
      const n = /^chart\.select(\d)$/.exec(c.id)?.[1];
      return n ? t('app.switchChart', { n: Number(n) }) : undefined;
    };
    this.commands.groupLabel = (g) => t(`group.${g}`);
  }

  async init(): Promise<void> {
    // The language first, so what the start says (a crash offer) is in it.
    this.applyLanguage();
    await this.settings.load();
    this.applyLanguage();
    void this.diag.start();
    this.view.side = this.settings.data.side;
    this.view.speed = this.settings.data.speed;
    this.commands.setOverrides(this.settings.data.keys);
    this.audioInfo = await this.backend.audio.info().catch(() => null);
    this.input.start();
    void this.backend.audio.cacheSetCap(this.settings.data.audioCacheMB).catch(() => {});
    await this.port.detect();
    if (this.audioInfo?.device_error)
      toast(t('app.noAudio', { error: this.audioInfo.device_error }), 'warn');
    this.ready = true;
    void this.updates.start();
    // Files the system handed over: at launch, and from later launches.
    this.backend.opened.onOpen(() => void this.takeOpened());
    await this.takeOpened();
  }

  /** Preferences' language (or `?pseudo`, the pseudo-language that shows untranslated text). */
  applyLanguage(): void {
    const pseudo = typeof location !== 'undefined' && /[?&]pseudo(?:[=&]|$)/.test(location.search);
    i18n.apply(this.settings.data.language, pseudo);
  }

  setLanguage(choice: LanguageChoice): void {
    this.settings.set('language', choice);
    this.applyLanguage();
  }

  private async takeOpened(): Promise<void> {
    const paths = await this.backend.opened.take().catch(() => []);
    if (paths.length) await this.openPaths(paths);
  }

  /**
   * Files the system handed EZ2BMS (double-clicked, or passed on by a
   * second launch): a bmson opens its song folder at that chart, a BMS file
   * the import wizard on its folder. The first one it can open wins.
   */
  async openPaths(paths: string[]): Promise<void> {
    this.backend.diag.log('info', `handed over by the system: ${paths.join(', ')}`);
    const bmson = paths.find((p) => /\.bmson$/i.test(p));
    const bms = paths.find((p) => BMS_FILE.test(p));
    if (!bmson && !bms) {
      if (paths.length) toast(t('app.cannotOpen', { file: baseName(paths[0]!) }), 'warn');
      return;
    }
    if (!bmson) {
      this.importer.show('bms');
      await this.importer.loadBms(dirName(bms!));
      return;
    }
    const dir = dirName(bmson);
    const file = baseName(bmson).toLowerCase();
    const pick = () => {
      const i = this.project?.charts.findIndex((c) => c.file.toLowerCase() === file) ?? -1;
      if (i >= 0) this.selectChart(i);
      else toast(t('app.notAChart', { file: baseName(bmson) }), 'warn');
    };
    if (this.project && samePath(this.project.dir, dir)) return pick();
    this.leaveProject(baseName(bmson), async () => {
      if (await this.openProject(dir)) pick();
    });
  }

  /**
   * Leave the open song for something else: at once when nothing is unsaved,
   * else only when asked (the autosave keeps the changes either way).
   */
  leaveProject(what: string, go: () => unknown): void {
    const p = this.project;
    if (!p?.dirty) return void go();
    ask(t('app.leaveUnsaved', { song: baseName(p.dir), what }), {
      label: t('app.open'),
      run: () => void go(),
    });
  }

  get slot(): ChartSlot | undefined {
    return this.project?.active;
  }

  /** Set the chart's start tempo (the stem panel's "Use this BPM"), to 1/100 BPM. */
  setStartBpm(bpm: number): void {
    const d = this.doc;
    if (!d) return;
    const v = Math.round(bpm * 100) / 100;
    setBpmAt(d, 0, v);
    toast(t('app.startBpm', { bpm: v }), 'ok');
  }

  get doc(): ChartDoc | undefined {
    return this.project?.active?.doc;
  }

  async openProject(dir: string): Promise<boolean> {
    try {
      const p = await Project.open(this.backend, dir);
      this.audio.forget();
      this.project = p;
      void this.audio.loadProject(p);
      this.settings.addRecent(dir);
      this.selectChart(0);
      p.onSaved = (slots, oldNames) => void this.autosave.clear(p, slots, oldNames);
      if (!p.charts.length) this.view.newChartOpen = true;
      void this.offerRecovery(p);
      return true;
    } catch (e) {
      toast(
        t('app.openFailed', { dir, error: e instanceof Error ? e.message : String(e) }),
        'error',
      );
      return false;
    }
  }

  /** Open the command palette with text already typed (e.g. "bpm "). */
  paletteSeed = $state('');
  openPalette(seed = ''): void {
    this.paletteSeed = seed;
    this.view.paletteOpen = true;
  }

  private async offerRecovery(p: Project): Promise<void> {
    const found = await this.autosave.pending(p).catch(() => []);
    for (const r of found) {
      ask(t('autosave.kept', { file: r.file, when: formatWhen(r.when) }), {
        label: t('autosave.recover'),
        run: () => {
          p.recover(r.file, r.text);
          const i = p.charts.findIndex((c) => c.file === r.file);
          if (i >= 0) this.selectChart(i);
          toast(t('autosave.recovered', { file: r.file }), 'ok');
        },
      });
    }
  }

  /** A new song in an empty (or audio-only) folder. */
  async newSong(): Promise<void> {
    const dir = await this.backend.pickFolder(t('app.newSongFolder'));
    if (!dir) return;
    if (await this.openProject(dir)) this.view.newChartOpen = true;
  }

  closeProject(): void {
    this.audio.forget();
    this.view.workbench = false;
    this.view.songManager = false;
    this.exporter.close();
    this.project = null;
  }

  selectChart(i: number): void {
    const p = this.project;
    if (!p || !p.charts[i]) return;
    if (this.play.active) void this.play.stop(false);
    else if (this.view.playing) void this.audio.stop();
    p.activeIndex = i;
    const doc = p.charts[i]!.doc;
    this.view.cursor = 0;
    this.view.brush = doc.data.channels[0]?.id ?? null;
  }
}

export const app = new App(createBackend());
