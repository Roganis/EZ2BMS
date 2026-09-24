// Opening and importing: bmson, the game's charts, BMS and MIDI, and what
// each could not bring across; the BMS writer's notes.
//
// Names stay as they are: EZ2PORT, EZ2, EZ2AC, bmson, BMS/BME, LR2,
// beatoraja, MIDI, the game's files (.ez, .ezi, .ini, song.bin, EZFF, EZTR),
// a BMS file's headers (#RANDOM, #WAV...), a file's field names (x, y,
// bpm, x_len...) and the mode, tier and judgement names. A "pulse" is the
// finest step a bmson position has; a "tick" is the game chart's (1/48
// beat). A count inside a plural is written {n}, not #: # would group its
// digits (1,500) where the English has always said 1500.

export const io = {
  // ---- Opening a bmson (io/bmson) -----------------------------------------------
  // {version}: the bmson version the file was written in, e.g. 0.21
  'open.upgraded': '{file} is bmson {version}: it was read as bmson 1.0, and saving writes 1.0',
  // {path}: where in the file, e.g. $.sound_channels[3].notes[12]; {problem}: one of open.bad.*
  'open.read': '{path}: {problem}',
  'open.read.again': '{path}: {problem} (and {more} more like it)',
  'open.read.more': '{n} more kinds of problem reading {file}',
  // {hint}: the file's mode_hint, e.g. beat-10k; {mode}: an EZ2 mode's name; x: a bmson lane number
  'open.legacy':
    "{file} numbers its lanes the old way ({hint}){numbering, select, spec { (2P keys on x 9-13, the bmson spec's numbering)} ez2 { (2P keys on x 11-15, EZ2's numbering)} other {}}: {moved} notes moved onto {mode}'s lanes",
  'open.legacy.bgm':
    "{file} numbers its lanes the old way ({hint}){numbering, select, spec { (2P keys on x 9-13, the bmson spec's numbering)} ez2 { (2P keys on x 11-15, EZ2's numbering)} other {}}: {moved} notes moved onto {mode}'s lanes, {bgm} on lanes {mode} lacks went to the background",
  'open.legacy.ambiguous':
    "{file}'s 2P notes are all on x 11-13, which is 2P keys 1-3 in EZ2's numbering and 3-5 in the bmson spec's. It was read as EZ2PORT reads it (keys 1-3); if they are two lanes off, select them and move them with Alt+→",

  // Why a bmson cannot be opened at all. {error}: what the JSON reader said, in English.
  'open.not-json': 'not JSON: {error}',
  'open.not-object': 'not a JSON object',
  'open.not-bmson': 'no "version", and not bmson 0.21 either: not a bmson EZ2BMS can read',

  // What is wrong with one member of a bmson, said after its path (open.read).
  // Lower case, no full stop; the member names are the format's own.
  'open.bad.string': 'expected a string; kept as written',
  'open.bad.number': 'expected a number; kept as written',
  'open.bad.strings': 'expected an array of strings; kept as written',
  'open.bad.judgement': 'expected exactly KOOL/COOL/GOOD/MISS numbers; kept as written',
  'open.bad.life': 'expected exactly COOL/GOOD/MISS/FAIL numbers; kept as written',
  'open.bad.tier': 'expected NM, HD, SHD or EX; kept as written',
  'open.bad.boolean': 'expected a boolean; kept as written',
  'open.bad.byte': 'expected an integer 0-255; kept as written',
  'open.bad.info': 'missing or not an object',
  'open.bad.list': 'not an array; ignored',
  'open.bad.object': 'not an object; ignored',
  'open.bad.channel': 'not an object; dropped',
  'open.bad.event': 'not an event with a numeric y; dropped',
  'open.bad.bpm': 'BPM event without a numeric bpm; dropped',
  'open.bad.stop': 'stop without a numeric duration; dropped',
  'open.bad.scroll': 'scroll change without a numeric rate; dropped',
  'open.bad.scrolls': 'not a list of scroll changes; kept as it is',
  'open.bad.note': 'note without numeric x and y; dropped',
  // l (a note's length) and c (whether it continues a sound) must be there:
  // a bad one is replaced.
  'open.bad.l': 'expected a number; replaced with 0',
  'open.bad.c': 'expected a boolean; replaced with false',
  'open.bad.bga-header': 'BGA header without numeric id and string name; dropped',
  'open.bad.bga-event': 'BGA event without a numeric id; dropped',

  // Text that is not in the encoding a file must be in.
  'text.not-utf8': 'not valid UTF-8',

  // ---- The game's own charts (io/ez) --------------------------------------------
  // Reading the game's data folder. {mode}: a mode's folder there, e.g.
  // StreetMix; {error}: why its song.bin could not be read
  'ez.songdb': "{mode}'s song.bin: {error}",
  'ez.no-exe': 'no executable is set',

  // A chart left out of an import. {file}: the .ez's name
  'ez.skip.mode': '{file}: not a chart of a mode EZ2BMS edits (the radio and CV2 modes have none)',
  'ez.skip.players': '{file}: a two-player chart; the one-player file is what the game plays',
  'ez.skip.tier': '{file}: a stage or variant chart, not one of the four tiers',
  // {mode}: an EZ2 mode's name; {tier}: NM, HD, SHD or EX
  'ez.skip.second': '{file}: a second {mode} {tier} chart',
  // {error}: why it could not be read, e.g. ez.encrypted, ez.read.* or ez.ezi.*
  'ez.skip.error': '{file}: {error}',
  // {why}: why the executable gave no keys, e.g. ez.no-exe
  'ez.encrypted': 'it is encrypted, and the keys are in the unpacked EZ2AC executable ({why})',
  'ez.encrypted.no-exe':
    'it is encrypted, and the keys are in the unpacked EZ2AC executable (none is set)',
  // A song's key names its folder; {orig} and {derived} are keys the game already uses.
  'ez.key':
    'The song\'s key is {key}: "{orig}" and "{derived}" are the game\'s own, and publishing under one would replace that song',

  // What importing one chart said about it. "It" is the chart.
  'ez.legacy-ezi':
    'Its keysound list names {n} notes like MIDI keys (C#0): read as notes, which EZ2PORT does not do (it plays them all as note 0)',
  'ez.no-ezi': 'It has no .ezi: none of its notes has a sound',
  // 6/24/36/72: the KOOL, COOL, GOOD and MISS windows
  'ez.no-ini':
    "It has no .ini: the engine's own judgement (6/24/36/72) and gauge, as the game plays it",
  // {set}: the level it was given
  'ez.level': "Its level {level} is not 1-20, which EZ2PORT's song list needs: set to {set}",
  'ez.level.none': "Its level (none) is not 1-20, which EZ2PORT's song list needs: set to {set}",
  'ez.tempo':
    '{n, plural, one {{n} tick has} other {{n} ticks have}} two tempo records: the one EZ2PORT plays (the last) is kept',
  'ez.scroll':
    "{n, plural, one {{n} scroll-speed change} other {{n} scroll-speed changes}}: EZ2PORT scrolls faster or slower from there; kept as the chart's scroll changes",
  // Records the game chart has that bmson has no place for, kept in the chart.
  'ez.kept.scroll':
    '{n, plural, one {{n} scroll record} other {{n} scroll records}} whose multiplier is not a number: kept for a cabinet export, not played or published',
  'ez.kept.volume':
    '{n, plural, one {{n} track volume record} other {{n} track volume records}}: kept in the chart, not published',
  'ez.kept.beats':
    '{n, plural, one {{n} beats-per-measure record} other {{n} beats-per-measure records}}: kept in the chart, not published',
  'ez.kept.mark':
    '{n, plural, one {{n} mark record} other {{n} mark records}}: kept in the chart, not published',
  'ez.kept.stop':
    '{n, plural, one {{n} stop record} other {{n} stop records}} (the engine ignores them): kept in the chart, not published',
  'ez.kept.tempo':
    '{n, plural, one {{n} tempo record} other {{n} tempo records}} outside 0-1000 BPM (the engine ignores them): kept in the chart, not published',
  'ez.kept.unknown':
    '{n, plural, one {{n} record of a kind} other {{n} records of kinds}} EZ2BMS does not know: kept, not published',
  'ez.kept.length':
    '{n, plural, one {{n} background note has} other {{n} background notes have}} a length: kept as x_len; publishing writes them as taps, as the game plays them',
  // {names}: up to six file names, e.g. "kick.wav, snare.wav..."
  'ez.missing-sound':
    '{n, plural, one {{n} keysound is} other {{n} keysounds are}} not in the game folder: {names}',
  // {slots}: up to eight slot numbers, e.g. "12, 40"
  'ez.unlisted':
    '{n, plural, one {Notes use keysound slot {slots}} other {Notes use keysound slots {slots}}}, which the .ezi does not list: the game plays nothing for them',
  // A "voice": one sound playing; a sound started again cuts the one before.
  'ez.shared-voice':
    '{n, plural, one {{n} keysound is} other {{n} keysounds are}} listed in more than one slot; in EZ2BMS (and a re-publish) each file is one voice, so two of them at once cut each other',

  // Why a .ez or .ezi cannot be read. Lower case, no full stop: said after the file's name.
  'ez.read.short': 'too short for an EZFF header',
  'ez.read.not-ezff': 'not EZFF (is it still encrypted?)',
  'ez.read.version': 'unsupported EZFF version {version}',
  'ez.read.tracks': 'implausible track count {n}',
  // {track}: a track's number, from 0
  'ez.read.track-header': 'track {track} header runs past the end',
  'ez.read.not-eztr': 'track {track} header is not EZTR',
  'ez.read.track-data': 'track {track} data runs past the end',
  // {note}: the number as written; {max}: the highest there can be
  'ez.ezi.note': 'note {note} is outside the keysound table (0-{max})',
  'ez.ezi.empty': 'no keysounds listed',

  // A game chart's kept record, as the editor shows it: a sentence, and a
  // tag of a few characters drawn beside the notes. {track}: its track's number.
  'ez.record.volume':
    'Volume {value} on track {track}: the cabinet mixes the track at it; EZ2PORT plays every track at full level',
  'ez.record.volume.tag': 'vol {value}',
  'ez.record.beats':
    'Beats per measure {value} on track {track}: kept for the cabinet; EZ2PORT does not read it',
  'ez.record.beats.tag': 'beats {value}',
  'ez.record.mark': 'A mark on track {track}: kept for the cabinet; EZ2PORT does not read it',
  'ez.record.mark.tag': 'mark',
  'ez.record.stop': 'A stop record on track {track}: kept for the cabinet; the game only logs it',
  'ez.record.stop.tag': 'stop',
  // {bpm}: a number, or ? when the record has none
  'ez.record.tempo':
    'A tempo of {bpm} on track {track}: outside 0-1000, so the engine drops it; kept for the cabinet',
  'ez.record.tempo.tag': 'bpm {bpm}',
  // ×{rate}: a scroll speed multiplier, e.g. ×1.5; Issues: the editor's list of problems
  'ez.record.scroll':
    "A scroll change (×{rate}) on track {track}, kept by an older import: it plays and publishes; Issues makes it the chart's own",
  'ez.record.scroll.tag': '×{rate}',
  'ez.record.nan':
    'A scroll record on track {track} whose multiplier is not a number: kept for the cabinet, not played or published',
  'ez.record.nan.tag': '× NaN',
  'ez.record.other':
    'A record of type {type} on track {track}, a kind EZ2BMS does not know: kept for the cabinet',
  'ez.record.other.tag': '#{type}',

  // ---- Reading BMS (io/bms) -----------------------------------------------------
  // A problem with one line of the file. {problem}: one of the bms.* below it
  'bms.line': 'Line {line}: {problem}',
  // {header}: the header as written, e.g. #RANDOM or #CASE
  'bms.random-number': '{header} without a number',
  'bms.if-no-random': '#IF with no #RANDOM before it: its lines are skipped',
  'bms.if-open': '#IF before the last #IF was closed: closed for it',
  'bms.elseif': '#ELSEIF with no #IF',
  'bms.else': '#ELSE with no #IF',
  'bms.endif': '#ENDIF with no #IF',
  'bms.endrandom': '#ENDRANDOM with no #RANDOM',
  'bms.case': '{header} outside a #SWITCH',
  'bms.skip': '#SKIP outside a #SWITCH',
  'bms.endsw': '#ENDSW with no #SWITCH',
  // {object}: a measure and channel, e.g. #00111
  'bms.odd': '{object}: an odd number of characters; the last is ignored',
  // {header}: e.g. #BPM01 or #STOP01
  'bms.not-number': '{header} is not a number',

  // What converting a BMS said about the chart. "It" is the file.
  'bms.measure-length':
    'Measure {measure}\'s length "{length}" is not a positive number: taken as 1',
  // {level}: as written; {set}: the level it was given
  'bms.level': "#PLAYLEVEL {level} is not 1-20, which EZ2PORT's song list needs: set to {set}",
  'bms.level.none': "#PLAYLEVEL (none) is not 1-20, which EZ2PORT's song list needs: set to {set}",
  'bms.no-bpm': 'No usable #BPM: the start tempo is taken as {bpm}',
  'bms.bad-refs':
    '{n, plural, one {{n} tempo or stop change names} other {{n} tempo or stop changes name}} a #BPMxx/#STOPxx the file does not define: left out',
  'bms.stops':
    '{n, plural, one {{n} STOP} other {{n} STOPs}}: EZ2 has none - publishing turns each into a gap, so the scroll does not freeze',
  // {channel}: a BMS channel, e.g. 51
  'bms.ln-end': 'A long note on channel {channel} has no end: a tap',
  'bms.lntype': '#LNTYPE {lntype} is not one EZ2BMS reads: read as 1',
  'bms.bga-images':
    'Its BGA is images, which EZ2PORT does not play (a movie it does): kept in the chart',
  // {worst}: pulses, e.g. 0.48
  'bms.rounding':
    'Its measure lengths and note spacing need a finer grid than EZ2BMS keeps: placed at 240 pulses a beat, the furthest {worst} pulses from where the file has it',
  // Hidden notes: BMS notes that play a sound only when a key is pressed there.
  'bms.hidden':
    '{n, plural, one {{n} hidden note} other {{n} hidden notes}} (3x/4x, heard only when hit): left out',
  'bms.hidden.background':
    '{n, plural, one {{n} hidden note} other {{n} hidden notes}} (3x/4x, heard only when hit): made background sounds',
  'bms.mines': '{n, plural, one {{n} mine} other {{n} mines}} (D/E): EZ2 has none; left out',
  // {channels}: BMS channels, e.g. "17, 28"; {map}: a channel map's name,
  // e.g. EZ2 BME or bms.map.keys
  'bms.unmapped':
    '{n, plural, one {Channel {channels} has} other {Channels {channels} have}} no lane in the {map} map: those notes are background sounds',
  'bms.off-mode':
    '{n, plural, one {{n} note is} other {{n} notes are}} on lanes this mode does not have: background sounds',
  'bms.other-channels':
    '{n, plural, one {Channel {channels}: not read (EZ2 has no use for it)} other {Channels {channels}: not read (EZ2 has no use for them)}}',
  // {header}: #SCROLL or #SPEED
  'bms.scroll': '{header} changes: EZ2 has none; left out',
  // {ids}: up to eight #WAV ids, e.g. "0Z, 1A"
  // {n}: how many ids; {ids}: the ids themselves.
  'bms.undefined-wav': 'Notes use #WAV ids the file does not define ({n}): {ids}',
  // {names}: up to six file names, e.g. "kick.wav, snare.wav..."
  'bms.missing-sound':
    '{n, plural, one {{n} sound file is} other {{n} sound files are}} not in the folder: {names}',
  // {choices}: each as bms.random.choice, in a list (bms.random.list)
  'bms.random':
    '{n, plural, one {{n} random choice} other {{n} random choices}} (#RANDOM/#SWITCH): {choices}',
  // Which value a #RANDOM took: the {value}th of {max}
  'bms.random.choice': 'line {line}: {value} of {max}',
  // A list, one more at its end: "line 12: 1 of 2" + ", " + "line 40: 2 of 3"
  'bms.random.list': '{list}, {item}',
  // A folder of BMS files. {other}: the file already imported as that chart;
  // {mode}: a mode's id, e.g. 5k
  'bms.clash': '{file}: {other} is already the {mode} {tier} chart - choose another tier for it',
  // {encoding}: e.g. shift_jis or euc-kr
  'bms.encoding-guess':
    'Its text encoding was a guess ({encoding}): if the title or sound names look wrong, import it again with another',
  // A channel map's name: each side's BMS keys onto the mode's lanes, left to right.
  'bms.map.keys': 'Keys in order',

  // ---- Writing BMS (io/bms/write.ts, export.ts) ---------------------------------
  // Why a chart cannot be written as BMS.
  'bmsw.too-many-sounds': '{n} keysounds: a BMS names at most {max}',
  // Ids are two characters: base 36 (0-9, A-Z) or base 62 (and a-z).
  'bmsw.too-many-sounds.36':
    '{n} keysounds: a BMS names at most {max} (base 36; base 62 takes 3843)',
  'bmsw.too-many-defs': 'more than {max} different tempi or stops',
  'bmsw.measures': 'measure {measure}: a BMS has measures 000-999 ({needed} needed)',
  // What a written BMS could not hold. {file}: the BMS file's name; {note}: one of bmsw.*
  'bmsw.file': '{file}: {note}',
  // {chars}: the characters, separated by spaces; {encoding}: Shift-JIS or EUC-KR (CP949)
  'bmsw.unmappable': '{chars} cannot be written in {encoding}: written as ?',
  'bmsw.velpan':
    '{n, plural, one {{n} note has} other {{n} notes have}} a velocity or pan: BMS has neither, so they play at full volume, centred',
  // {map}: a channel map's name, e.g. EZ2 BME or bms.map.keys
  'bmsw.unmapped':
    '{n, plural, one {{n} note is} other {{n} notes are}} on lanes the {map} map has no channel for: written as background',
  'bmsw.dupes':
    '{n, plural, one {{n} note shares} other {{n} notes share}} a lane and a spot with another: written as background',
  'bmsw.holds':
    '{n, plural, one {{n} long note ends} other {{n} long notes end}} where the next on their lane starts: written a pulse shorter, as BMS cannot put both there',
  'bmsw.stops':
    '{n, plural, one {{n} STOP is} other {{n} STOPs are}} not a whole number of 1/192 measures: written as decimals (beatoraja reads them; LR2 rounds them down)',
  // EZ2PORT eases to a new scroll speed; beatoraja's #SCROLL jumps to it.
  'bmsw.scroll':
    "{n, plural, one {{n} scroll change is} other {{n} scroll changes are}} not written: LR2 has none, and beatoraja's #SCROLL is not what EZ2PORT does (it eases to the new speed)",
  'bmsw.kept':
    "The game chart's own records (scroll, volume...) are not written: BMS has no place for them",
  // {names}: up to five file names, e.g. "kick.wav, snare.wav..."
  'bmsw.missing-sound':
    '{n, plural, one {{n} sound is} other {{n} sounds are}} not in the song folder ({names}): named in the BMS, not copied',

  // ---- MIDI files, to slice a sound by (io/midi) --------------------------------
  // Why a MIDI file cannot be used. Lower case, no full stop.
  'midi.not-midi': 'not a MIDI file (no MThd)',
  'midi.format-2': 'a format 2 MIDI file (separate sequences) has no one tempo to cut by',
  'midi.format': 'MIDI format {format} is not one EZ2BMS reads',
  'midi.smpte': 'SMPTE time (not beats) has no tempo to cut by',
  // A MIDI file's timing unit: how many ticks make a quarter note.
  'midi.division': 'a division of 0 ticks a quarter note',
} satisfies Record<string, string>;
