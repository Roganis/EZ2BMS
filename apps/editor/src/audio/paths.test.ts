import { describe, expect, it } from 'vitest';
import { soundPath } from './paths';

describe('sound paths', () => {
  const samples = ['kick.ogg', 'Snare.WAV', 'stems/pad.flac', 'notes.txt'];
  it('prefers the exact file, any case', () => {
    expect(soundPath('/s', samples, 'snare.wav')).toBe('/s/Snare.WAV');
    expect(soundPath('/s', samples, 'stems/pad.flac')).toBe('/s/stems/pad.flac');
  });
  it('falls back to the same stem in another audio format', () => {
    expect(soundPath('/s', samples, 'kick.wav')).toBe('/s/kick.ogg');
    expect(soundPath('/s', samples, 'notes.wav')).toBe('/s/notes.wav');
    expect(soundPath('/s', samples, 'missing.wav')).toBe('/s/missing.wav');
  });
});
