// The editor's one root object: the backend, settings, the open project, how
// it is viewed, and every command. Components import `app` and read from it.

import type { ChartDoc, Clip } from '@ez2bms/chart-core';
import { createBackend, type AudioInfo, type Backend } from '../bridge';
import { Commands } from '../commands/registry';
import { Project, type ChartSlot } from './project.svelte';
import { Settings } from './settings.svelte';
import { toast } from './toasts.svelte';
import { View } from './view.svelte';

export class App {
  readonly settings: Settings;
  readonly view = new View();
  readonly commands = new Commands();
  project = $state<Project | null>(null);
  audioInfo = $state<AudioInfo | null>(null);
  ready = $state(false);
  /** Copied notes (in the app, not the system clipboard). */
  clip: Clip | undefined;

  constructor(readonly backend: Backend) {
    this.settings = new Settings(backend);
    this.commands.onError = (e, c) =>
      toast(`${c.title}: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }

  async init(): Promise<void> {
    await this.settings.load();
    this.view.side = this.settings.data.side;
    this.view.speed = this.settings.data.speed;
    this.commands.setOverrides(this.settings.data.keys);
    this.audioInfo = await this.backend.audio.info().catch(() => null);
    if (this.audioInfo?.device_error)
      toast(`No audio device - playing silently (${this.audioInfo.device_error})`, 'warn');
    this.ready = true;
  }

  get slot(): ChartSlot | undefined {
    return this.project?.active;
  }

  get doc(): ChartDoc | undefined {
    return this.project?.active?.doc;
  }

  async openProject(dir: string): Promise<boolean> {
    try {
      const p = await Project.open(this.backend, dir);
      this.project = p;
      this.settings.addRecent(dir);
      this.selectChart(0);
      if (!p.charts.length)
        toast('No charts in this folder yet - create one with New chart', 'info');
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

  closeProject(): void {
    this.project = null;
  }

  selectChart(i: number): void {
    const p = this.project;
    if (!p || !p.charts[i]) return;
    p.activeIndex = i;
    const doc = p.charts[i]!.doc;
    this.view.cursor = 0;
    this.view.brush = doc.data.channels[0]?.id ?? null;
  }
}

export const app = new App(createBackend());
