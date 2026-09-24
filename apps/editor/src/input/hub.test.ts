// The input hub against a fake clock and the browser backend: keys and pads
// both become channels at their own times, bound keys are kept from the
// editor while something listens (and only then), the age rule, a rescan
// releasing held pad buttons, and bindings taken from EZ2PORT's files.

import { KEY_CHANNELS, keyconfDefaults, parseKeyconf } from '@ez2bms/chart-core';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChannelEdge } from '@ez2bms/chart-core';
import { webBackend } from '../bridge/web';
import type { App } from '../state/app.svelte';
import { DEFAULT_SETTINGS, type SettingsData } from '../state/settings.svelte';
import { controlsIni, InputHub, MAX_AGE_MS } from './hub.svelte';

const CH = (n: (typeof KEY_CHANNELS)[number]) => KEY_CHANNELS.indexOf(n);
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** An App with just what the hub reads: host time = page time + 1000 ms. */
function fakeApp(files = new Map<string, Uint8Array>(), data: Partial<SettingsData> = {}) {
  const backend = webBackend(files);
  const settings = {
    data: { ...DEFAULT_SETTINGS, ...data } as SettingsData,
    set<K extends keyof SettingsData>(k: K, v: SettingsData[K]) {
      this.data[k] = v;
    },
  };
  const OFFSET = 1000;
  const audio = {
    calibrated: true,
    calibrate: async () => {},
    hostMsAtPerf: (p: number) => p + OFFSET,
    hostNowMs: () => performance.now() + OFFSET,
    /** The song started at host 5000 ms. */
    songMsAtHost: (h: number) => h - 5000,
  };
  return { app: { backend, settings, audio } as unknown as App, backend, settings };
}

const hubs: InputHub[] = [];
function started(app: App) {
  const hub = new InputHub(app);
  hub.start();
  hubs.push(hub);
  return hub;
}
afterEach(() => {
  // Each hub listens on the window; the next test must not hear it.
  for (const h of hubs.splice(0)) h.stop();
});

function key(type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
}

describe('the input hub', () => {
  it("keeps bound keys from the editor only while something listens, on the host's clock", () => {
    const { app } = fakeApp();
    const hub = started(app);
    // No debounce: these presses and releases come in the same millisecond.
    hub.apply({ ini: null, debounceMs: 0 });
    const got: ChannelEdge[] = [];
    // Nothing listening: Z is the editor's.
    expect(key('keydown', 'KeyZ').defaultPrevented).toBe(false);
    key('keyup', 'KeyZ');
    const detach = hub.attach({ keys: 'all', pads: false, edges: (e) => got.push(...e) });
    const down = key('keydown', 'KeyZ');
    expect(down.defaultPrevented).toBe(true);
    // Unbound: untouched.
    expect(key('keydown', 'KeyQ').defaultPrevented).toBe(false);
    // Ctrl (Scratch1 by default) with Z: a scratch and Key1, never Ctrl+Z.
    expect(key('keydown', 'ControlLeft', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key('keyup', 'KeyZ').defaultPrevented).toBe(true);
    expect(got.map((e) => [e.channel, e.down])).toEqual([
      [CH('Key1'), true],
      [CH('Scratch1'), true],
      [CH('Key1'), false],
    ]);
    // Times are the event's own, put on the host clock.
    expect(got[0]!.ms).toBeCloseTo(down.timeStamp + 1000, 6);
    expect(hub.songMs(6000)).toBe(1000);
    app.settings.data.inputOffsetMs = 12;
    expect(hub.songMs(6000)).toBe(988);
    detach();
    // Stopping listening lets go of what was held.
    expect(hub.mapper.isDown(CH('Scratch1'))).toBe(false);
  });

  it('a plain listener (step input) leaves shortcuts alone', () => {
    const { app } = fakeApp();
    const hub = started(app);
    hub.apply({ ini: null, debounceMs: 0 });
    const got: ChannelEdge[] = [];
    hub.attach({ keys: 'plain', pads: false, edges: (e) => got.push(...e) });
    expect(key('keydown', 'KeyZ', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key('keydown', 'KeyS').defaultPrevented).toBe(true);
    key('keyup', 'KeyS');
    expect(got.map((e) => [e.channel, e.down])).toEqual([
      [CH('Key2'), true],
      [CH('Key2'), false],
    ]);
  });

  it('takes pad presses at their stamps, ages past 200 ms as now, and a rescan releases', async () => {
    const { app, backend } = fakeApp();
    const hub = started(app);
    // The cabinet bridge's button 1 plays Key1.
    const conf = keyconfDefaults();
    conf.names[CH('Key1')] = ['Z', '0810:e501/b0'];
    hub.apply({ ini: controlsIni(conf), debounceMs: 0 });
    const got: ChannelEdge[] = [];
    const detach = hub.attach({ keys: 'all', pads: true, edges: (e) => got.push(...e) });
    await flush();
    await flush();
    expect(backend.devPad!.active).toBe(true);
    const pad = backend.devPad!.plug();
    await flush();
    expect(hub.devices.map((d) => d.key)).toEqual([pad]);

    const now = app.audio.hostNowMs();
    backend.devPad!.button(pad, 0, true, (now - 30) * 1e6);
    backend.devPad!.button(pad, 0, false, (now - 20) * 1e6);
    backend.devPad!.button(pad, 0, true, (now - MAX_AGE_MS - 50) * 1e6);
    await flush();
    // Stamped in ns and back: equal to the float's last bit or so.
    expect(got[0]).toMatchObject({ channel: CH('Key1'), down: true });
    expect(got[0]!.ms).toBeCloseTo(now - 30, 6);
    expect(got[1]!.ms).toBeCloseTo(now - 20, 6);
    // Too old: taken as when it arrived.
    expect(got[2]!.down).toBe(true);
    expect(got[2]!.ms).toBeGreaterThanOrEqual(now);

    // Unplugged while held: released.
    backend.devPad!.unplug(pad);
    await flush();
    expect(got.at(-1)).toMatchObject({ channel: CH('Key1'), down: false });
    detach();
    await flush();
    expect(backend.devPad!.active).toBe(false);
  });

  it("takes EZ2PORT's keys.ini and Debounce once, and keeps them as the editor's", async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const files = new Map([
      ['/game/sound/x/a.ssf', enc('x')],
      ['/game/system/a.gds', enc('x')],
      ['/game/ez2port/keys.ini', enc('[Keys]\nKey1 = A, 0810:e501/b0\n')],
      ['/config/ez2port/settings.ini', enc('Debounce = 15\n')],
    ]);
    const { app, settings } = fakeApp(files, { gameRoot: '/game' });
    const hub = started(app);
    await hub.loadControls();
    expect(hub.sourcePath).toBe('/game/ez2port/keys.ini');
    expect(hub.mapper.debounceMs).toBe(15);
    const stored = settings.data.controls;
    expect(stored.debounceMs).toBe(15);
    expect(parseKeyconf(stored.ini!).conf.names[CH('Key1')]).toEqual(['A', '0810:e501/b0']);
    // The rest are the port's defaults, as ez2play reads a partial file.
    expect(parseKeyconf(stored.ini!).conf.names[CH('Key2')]).toEqual(['S']);

    // Later the port's file changes: the editor's own bindings stay.
    files.set('/game/ez2port/keys.ini', enc('[Keys]\nKey1 = Q\n'));
    await hub.loadControls();
    expect(hub.conf().names[CH('Key1')]).toEqual(['A', '0810:e501/b0']);
  });

  it('without the port files, uses the defaults and stores nothing', async () => {
    const { app, settings } = fakeApp();
    const hub = started(app);
    await hub.loadControls();
    expect(settings.data.controls).toEqual({ ini: null, debounceMs: null });
    expect(hub.source).toBe('defaults');
    expect(hub.mapper.debounceMs).toBe(8);
  });
});
