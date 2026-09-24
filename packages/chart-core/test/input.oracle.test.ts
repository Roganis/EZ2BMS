// keys.ini and binding tokens read exactly as EZ2PORT reads them: every file
// and token here goes through ez2/keyconf.c and ez2/bindspec.c (the oracle's
// `keyconf` and `bindspec`) and through input/keyconf.ts and bindspec.ts, and
// the two must agree - channels, alternates, turntables, the first bad line,
// and the text each writes back.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BIND_KIND_CODE,
  formatBindspec,
  fromBytes,
  isAnalogBinding,
  parseBindspec,
  toBytes,
} from '../src/input/bindspec';
import {
  formatKeyconf,
  keyconfDefaults,
  keyconfEmpty,
  KEY_CHANNELS,
  parseKeyconf,
} from '../src/input/keyconf';
import { DEFAULT_DEBOUNCE_MS, portDebounce } from '../src/input/portcfg';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

interface OracleConf {
  rc: number;
  bad_line: number;
  channels: { name: string; names: string[] }[];
  analog: string[];
  formatted: string;
}

interface OracleSpec {
  text: string;
  ok: number;
  kind: number;
  device: string;
  key: string;
  index: number;
  dir: number;
  reverse: number;
  velocity: number;
  amount: number;
  analog: number;
  formatted: string;
}

function ours(text: string, bare: boolean) {
  const r = parseKeyconf(text, bare ? keyconfEmpty() : keyconfDefaults());
  return {
    rc: r.set,
    bad_line: r.badLine,
    channels: KEY_CHANNELS.map((name, i) => ({
      name,
      names: r.conf.names[i]!.map(fromBytes),
    })),
    analog: r.conf.analog.map(fromBytes),
    formatted: fromBytes(formatKeyconf(r.conf)),
  };
}

function ourSpec(text: string): OracleSpec {
  const b = parseBindspec(toBytes(text));
  return {
    text,
    ok: b ? 1 : 0,
    kind: b ? BIND_KIND_CODE[b.kind] : 0,
    device: b?.device ?? '',
    key: fromBytes(b?.key ?? ''),
    index: b?.index ?? -1,
    dir: b?.dir ?? -1,
    reverse: b?.reverse ? 1 : 0,
    velocity: b?.velocity ? 1 : 0,
    amount: b?.amount ?? 0,
    analog: b && isAnalogBinding(b) ? 1 : 0,
    formatted: b ? fromBytes(formatBindspec(b)) : '',
  };
}

const FIXED = [
  '',
  '[Keys]\nKey1 = Z, 0810:e501/b3 ; the panel too\n',
  'key1=z\nKEY2 = "S"\n',
  'Key7 = ";"\nP2Key7 = ";", "#"\nKey3 = # a comment, so nothing\n',
  'Key1 = 0810:e501#2/b3, 0810:e501#2/h0.up\n',
  '[Analog]\nTurntable = 0810:e501/a0:rev\nP2 Turntable = vtt:4\n',
  // The documented `:rev,vel` splits at the comma unless quoted.
  '[Analog]\nP1 Turntable = 0810:e501/a0:rev,vel\nP2Turntable = "0810:e501/a1:rev,vel"\n',
  '[aNaLoG]\nTurntable = mouse/x\n',
  '[Other]\nKey1 = A\nNope = B\nno equals here\n',
  'Key1 = A, B, C, D, E, F\n',
  'Key1 = \r\nScratch1 = Left Ctrl , "Left Shift"\r\n',
  `Key1 = ${'x'.repeat(60)}\n`,
  `Key1 = ${'a, '.repeat(200)}z\n`,
  '\uFEFFKey1 = A\n',
  'Key1 = "unterminated, still one\nKey2 = "a"b"c"\n',
  'Effect1 = F\nP2Start = "\\"\nCoin = F3\n',
];

describe.skipIf(!ORACLE)('keys.ini, against the port (ez2/keyconf.c)', () => {
  it.each(FIXED.map((t, i) => [i, t]))('file %i reads the same', (_, text) => {
    for (const bare of [false, true]) {
      const want = oracle<OracleConf>(['keyconf', ...(bare ? ['bare'] : [])], text);
      expect(ours(text, bare)).toEqual(want);
    }
  });

  it('random files read the same, and what either writes reads back', () => {
    const name = fc.constantFrom(
      ...KEY_CHANNELS,
      'key1',
      'P2KEY7',
      'Turntable',
      'P1 Turntable',
      'P2 Turntable',
      'Bogus',
      '',
    );
    const token = fc.oneof(
      fc.constantFrom('Z', 'Left Ctrl', ';', ',', '#', '"', '/', 'Keypad 1', '0810:e501/b3', 'vtt'),
      fc.stringMatching(/^[ -~]{0,60}$/),
    );
    const value = fc
      .array(fc.tuple(token, fc.boolean()), { maxLength: 6 })
      .map((ts) =>
        ts
          .map(([t, q]) => (q ? `"${t}"` : t))
          .join(fc.sample(fc.constantFrom(',', ', ', ' ,'), 1)[0]),
      );
    const line = fc.oneof(
      fc
        .tuple(name, value, fc.constantFrom('', ' ; note', ' # note'))
        .map(([n, v, c]) => `${n} = ${v}${c}`),
      fc.constantFrom('[Keys]', '[Analog]', '[analog]', '[x]', '; c', '# c', '', '   ', 'junk'),
      fc.stringMatching(/^[ -~]{0,600}$/),
    );
    const file = fc
      .tuple(fc.array(line, { maxLength: 12 }), fc.constantFrom('\n', '\r\n'))
      .map(([ls, eol]) => ls.join(eol));
    fc.assert(
      fc.property(file, fc.boolean(), (text, bare) => {
        const want = oracle<OracleConf>(['keyconf', ...(bare ? ['bare'] : [])], text);
        expect(ours(text, bare)).toEqual(want);
        // What was written reads back the same way in both. (Not always to
        // the same map: the port quotes only ; # , and ", so a quoted name's
        // leading blank does not survive its own writer.)
        expect(ours(want.formatted, true)).toEqual(
          oracle<OracleConf>(['keyconf', 'bare'], want.formatted),
        );
      }),
      { numRuns: 120 },
    );
  });
});

describe.skipIf(!ORACLE)('binding tokens, against the port (ez2/bindspec.c)', () => {
  const FIXED_TOKENS = [
    'S',
    'Left Ctrl',
    '/',
    ';',
    'Keypad /',
    '0810:e501/b3',
    '0810:E501/B3',
    '0810:e501#2/b0',
    '0810:e501#/b0',
    '0810:e501/b',
    '0810:e501/b3x',
    '0810:e501/b+3',
    '0810:e501/b 3',
    '0810:e501/b-0',
    '0810:e501/b65535',
    '0810:e501/b65536',
    '0810:e501/b3:',
    '0810:e501/h0.up',
    '0810:e501/H1.DownLeft',
    '0810:e501/h0',
    '0810:e501/h0.sideways',
    '0810:e501/a0',
    '0810:e501/a0:rev',
    '0810:e501/a0:vel',
    '0810:e501/a0:rev,vel',
    '0810:e501/a0:VEL,REV',
    '0810:e501/a0:,rev',
    '0810:e501/a0:rev,',
    '0810:e501/a0:spin',
    '0810:e501/a0:',
    '0810:e501/z0',
    '081:e501/b3',
    'zzzz:e501/b3',
    'mouse/x',
    'MOUSE/Y:8',
    'mouse/x:0',
    'mouse/x:21',
    'mouse/z',
    'mouse/',
    'vtt',
    'vtt:4',
    'vtt:0',
    'vtt:21',
    'VTT',
    'vttx',
    '  0810:e501/b3  ',
    'x'.repeat(200),
    `0810:e501/b${'1'.repeat(140)}`,
  ];

  it('fixed tokens parse and format the same', () => {
    const want = oracle<OracleSpec[]>(['bindspec'], FIXED_TOKENS.join('\n') + '\n');
    expect(FIXED_TOKENS.map(ourSpec)).toEqual(want);
  });

  it('random tokens parse and format the same', () => {
    const dev = fc.constantFrom(
      '0810:e501',
      '0810:E501#2',
      '0810:e501#',
      '081:e501',
      'abcd:ef01#12',
      'mouse',
      'Mouse',
      'vtt',
      '',
    );
    const ctl = fc.oneof(fc.constantFrom('b', 'B', 'a', 'A', 'h', 'H', 'x', 'y', 'z', ''));
    const num = fc.oneof(
      fc.nat({ max: 70000 }).map(String),
      fc.constantFrom('', '+3', ' 3', '-0', '-1', '3x'),
    );
    const opt = fc.constantFrom(
      '',
      ':',
      ':rev',
      ':vel',
      ':rev,vel',
      ':,rev',
      ':8',
      ':0',
      ':21',
      ':3',
    );
    const hat = fc.constantFrom('', '.up', '.UpRight', '.down', '.nope', '.');
    const token = fc.oneof(
      fc.tuple(dev, ctl, num, hat, opt).map(([d, c, n, h, o]) => `${d}/${c}${n}${h}${o}`),
      fc.tuple(fc.constantFrom('vtt', 'VTT', 'vt'), opt).map(([v, o]) => v + o),
      fc.stringMatching(/^[ -~]{1,40}$/),
    );
    fc.assert(
      fc.property(fc.array(token, { minLength: 1, maxLength: 40 }), (tokens) => {
        const clean = tokens.map((t) => t.replace(/[\r\n]/g, ''));
        const want = oracle<OracleSpec[]>(['bindspec'], clean.join('\n') + '\n');
        expect(clean.map(ourSpec)).toEqual(want);
      }),
      { numRuns: 60 },
    );
  });
});

describe.skipIf(!ORACLE)('settings.ini Debounce against the port', () => {
  const port = (bytes: Uint8Array) =>
    withTmpDir((_, write) =>
      oracle<{ debounce: number }>(['portcfg', write('settings.ini', bytes)]),
    ).debounce;
  const ours = (bytes: Uint8Array) => portDebounce(bytes) ?? DEFAULT_DEBOUNCE_MS;
  const enc = (s: string) => new TextEncoder().encode(s);

  it('reads the files people write', () => {
    for (const text of [
      '',
      'Debounce = 12\n',
      '[Settings]\r\nDEBOUNCE=0\r\n',
      '; Debounce = 3\nDebounce = 5 ; ms\nDebounce = 200\n',
      '# Debounce = 4\n  debounce\t=\t 16x\n',
      'Debounce = -1\nDebounce = +7\n',
      'Debounce Time = 9\nDebounce\n',
      `Wide = 1\n${'x'.repeat(250)} Debounce = 30\n`,
      `${'Debounce = 4 '.padEnd(255, ' ')}Debounce = 6\n`,
      'Debounce = 9\0 = 3\n',
    ]) {
      const b = enc(text);
      expect(ours(b), JSON.stringify(text)).toBe(port(b));
    }
  });

  it('agrees on random lines', () => {
    const key = fc.constantFrom(
      'Debounce',
      'debounce',
      'DeBounce',
      ' Debounce',
      'Debounc',
      'Wide',
      '[x]',
      '#D',
    );
    const val = fc.oneof(
      fc.integer({ min: -20, max: 130 }).map(String),
      fc.stringMatching(/^[ \t+\-0-9a;#=]{0,8}$/),
    );
    const line = fc.oneof(
      fc.tuple(key, fc.constantFrom('=', ' = ', '\t=', ''), val).map(([k, e, v]) => k + e + v),
      fc.stringMatching(/^[ -~]{0,300}$/),
    );
    const eol = fc.constantFrom('\n', '\r\n', '');
    fc.assert(
      fc.property(fc.array(fc.tuple(line, eol), { maxLength: 12 }), (lines) => {
        const b = enc(lines.map(([l, e]) => l + (e || '\n')).join(''));
        expect(ours(b)).toBe(port(b));
      }),
      { numRuns: 80 },
    );
  });
});

describe('keys.ini without the oracle', () => {
  it('names only what it changes, and writes what it reads', () => {
    const r = parseKeyconf('Key1 = Z, 0810:e501/b3\n[Analog]\nTurntable = 0810:e501/a0\n');
    expect(r.conf.names[0]).toEqual(['Z', '0810:e501/b3']);
    expect(r.conf.names[1]).toEqual(['S']);
    expect(r.conf.analog).toEqual(['0810:e501/a0', '']);
    expect(parseKeyconf(formatKeyconf(r.conf), keyconfEmpty()).conf).toEqual(r.conf);
  });

  it('a channel written with an empty value is unbound', () => {
    expect(parseKeyconf('Pedal =\n').conf.names[9]).toEqual([]);
  });
});
