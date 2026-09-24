import { describe, expect, it } from 'vitest';
import { Commands, fuzzy, keyOf } from './registry';

const key = (init: KeyboardEventInit & { key: string }) =>
  keyOf(new KeyboardEvent('keydown', init));

describe('commands', () => {
  it('names keys the way bindings are written', () => {
    expect(key({ key: 'z', ctrlKey: true })).toBe('Mod+Z');
    expect(key({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe('Mod+Shift+Z');
    expect(key({ key: ' ' })).toBe('Space');
    expect(key({ key: 'Tab', shiftKey: true })).toBe('Shift+Tab');
    expect(key({ key: 'ArrowLeft', altKey: true })).toBe('Alt+ArrowLeft');
    expect(key({ key: '[' })).toBe('[');
    expect(key({ key: '!', code: 'Digit1', shiftKey: true })).toBe('Shift+1');
    expect(key({ key: '1', code: 'Digit1', ctrlKey: true })).toBe('Mod+1');
  });

  it('runs by key, respects enabled and typing, and takes rebinds', () => {
    const c = new Commands();
    const ran: string[] = [];
    let on = true;
    c.register(
      {
        id: 'undo',
        title: 'Undo',
        group: 'Edit',
        keys: ['Mod+Z'],
        global: true,
        run: () => ran.push('undo'),
      },
      {
        id: 'hold',
        title: 'Long note',
        group: 'Notes',
        keys: ['L'],
        enabled: () => on,
        run: () => ran.push('hold'),
      },
    );
    expect(c.handleKey(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))).toBe(true);
    expect(c.handleKey(new KeyboardEvent('keydown', { key: 'l' }))).toBe(true);
    on = false;
    expect(c.handleKey(new KeyboardEvent('keydown', { key: 'l' }))).toBe(false);
    on = true;
    const input = document.createElement('input');
    const typed = new KeyboardEvent('keydown', { key: 'l' });
    Object.defineProperty(typed, 'target', { value: input });
    expect(c.handleKey(typed)).toBe(false);
    c.setOverrides({ hold: ['H'] });
    expect(c.handleKey(new KeyboardEvent('keydown', { key: 'l' }))).toBe(false);
    expect(c.handleKey(new KeyboardEvent('keydown', { key: 'h' }))).toBe(true);
    expect(ran).toEqual(['undo', 'hold', 'hold']);
  });

  it('finds commands by fuzzy title and by verb with an argument', () => {
    const c = new Commands();
    c.register(
      { id: 'goto', title: 'Go to measure', group: 'View', verb: 'goto', run: () => {} },
      { id: 'bpm', title: 'Set BPM at cursor', group: 'Timing', verb: 'bpm', run: () => {} },
      { id: 'save', title: 'Save chart', group: 'File', run: () => {} },
    );
    expect(c.search('bpm 174')[0]).toMatchObject({ arg: '174', cmd: { id: 'bpm' } });
    expect(c.search('goto 32')[0]).toMatchObject({ arg: '32', cmd: { id: 'goto' } });
    expect(c.search('sav')[0]!.cmd.id).toBe('save');
    expect(fuzzy('gtm', 'Go to measure')).toBeGreaterThan(0);
    expect(fuzzy('xyz', 'Go to measure')).toBe(0);
  });
});
