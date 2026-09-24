// The editor's one root object: the backend, settings, the open project, how
// it is viewed, and every command. Components import `app` and read from it.

import { setBpmAt, type ChartDoc, type Clip } from '@ez2bms/chart-core';
import { AudioClient } from '../audio/client.svelte';
import { createBackend, type AudioInfo, type Backend } from '../bridge';
import { InputHub } from '../input/hub.svelte';
import { PlayController } from '../play/controller.svelte';
import { PortState } from './port.svelte';
import { Autosave, formatWhen } from './autosave';
import { Commands } from '../commands/registry';
import { Project, type ChartSlot } from './project.svelte';
import { Settings } from './settings.svelte';
import { SkinState } from './skin.svelte';
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
  project = $state<Project | null>(null);
  audioInfo = $state<AudioInfo | null>(null);
  ready = $state(false);
  /** Copied notes (in the app, not the system clipboard). */
  clip: Clip | undefined;

  constructor(readonly backend: Backend) {
    this.settings = new Settings(backend);
    this.audio = new AudioClient(backend, this.view, this.settings);
    this.input = new InputHub(this);
    this.play = new PlayController(this);
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
    this.commands.onError = (e, c) =>
      toast(`${c.title}: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }

  async init(): Promise<void> {
    await this.settings.load();
    this.view.side = this.settings.data.side;
    this.view.speed = this.settings.data.speed;
    this.commands.setOverrides(this.settings.data.keys);
    this.audioInfo = await this.backend.audio.info().catch(() => null);
    this.input.start();
    void this.backend.audio.cacheSetCap(this.settings.data.audioCacheMB).catch(() => {});
    await this.port.detect();
    if (this.audioInfo?.device_error)
      toast(`No audio device - playing silently (${this.audioInfo.device_error})`, 'warn');
    this.ready = true;
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
    toast(`${v} BPM from the start`, 'ok');
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
      toast(`Could not open ${dir}: ${e instanceof Error ? e.message : String(e)}`, 'error');
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
      ask(
        `Unsaved changes to ${r.file} from ${formatWhen(r.when)} were kept after EZ2BMS closed.`,
        {
          label: 'Recover',
          run: () => {
            p.recover(r.file, r.text);
            const i = p.charts.findIndex((c) => c.file === r.file);
            if (i >= 0) this.selectChart(i);
            toast(`Recovered ${r.file} - save to keep it`, 'ok');
          },
        },
      );
    }
  }

  /** A new song in an empty (or audio-only) folder. */
  async newSong(): Promise<void> {
    const dir = await this.backend.pickFolder(
      'Folder for the new song (its sounds can already be there)',
    );
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
