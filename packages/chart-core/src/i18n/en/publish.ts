// Publishing and the cabinet: the cabinet review (lint/cabinet.ts), publish
// and export plans, the song file and song data, the game's data files.
// EZ2PORT, EZ2AC, EZ2BMS, NM/HD/SHD/EX, the mode names and file names
// (song.bin, .gds, .pvi, .abm) are names. A count inside a plural is written
// {n} rather than #, so English says 1500, as it always has, not 1,500.

export const publish = {
  // The cabinet review: what the original game cannot load, what it plays
  // differently from EZ2PORT, and what a cabinet export changes in the game.
  // {file}: a chart file's name; {max}: 131068, the bytes it has room for
  'cabinet.size':
    '{file} is {bytes} bytes: the original game reads a file into {max} and cannot load it ({kb} KB of 128 KB)',
  // A slice: the part of a sound a note plays.
  'cabinet.slots': '{n} keysounds (slices each count): the original game loads at most {max}',
  'cabinet.level': "level {level}: the game's table takes 1-20",
  // "Background" sounds play by themselves, on no lane. The cabinet plays one
  // sound at a time on each of a chart's tracks; EZ2PORT plays them all.
  'cabinet.voice-cut':
    '{n, plural, one {{n} background sound cut short on the cabinet by the next sound on its track} other {{n} background sounds cut short on the cabinet by the next sound on their track}} (the original plays one sound per track; EZ2PORT plays both){unknown, plural, =0 {} one { ({unknown} sound of unknown length not checked)} other { ({unknown} sounds of unknown length not checked)}}',
  // {measure}: the measure the first of them is in, counted from 0 as the editor shows it
  'cabinet.voice-cut.measure':
    '{n, plural, one {{n} background sound cut short on the cabinet by the next sound on its track} other {{n} background sounds cut short on the cabinet by the next sound on their track}} (the original plays one sound per track; EZ2PORT plays both), first in measure {measure}{unknown, plural, =0 {} one { ({unknown} sound of unknown length not checked)} other { ({unknown} sounds of unknown length not checked)}}',
  'cabinet.voice-game':
    "{n, plural, one {{n} background sound cut by the next on the track, as the game's own chart has it} other {{n} background sounds cut by the next on the track, as the game's own chart has them}}",
  'cabinet.voice-game.measure':
    "{n, plural, one {{n} background sound cut by the next on the track, as the game's own chart has it} other {{n} background sounds cut by the next on the track, as the game's own chart has them}}, first in measure {measure}",
  // A keyed sound is a note's on a lane, cut by the next note on that lane.
  'cabinet.voice-lane':
    "{n, plural, one {{n} keyed sound} other {{n} keyed sounds}} cut by the lane's next note - on the cabinet in autoplay too, not only when played",
  'cabinet.voice-lane.measure':
    "{n, plural, one {{n} keyed sound} other {{n} keyed sounds}} cut by the lane's next note - on the cabinet in autoplay too, not only when played, first in measure {measure}",
  // {mode}: a mode's name, e.g. 5K STANDARD
  'cabinet.repinned':
    "{n, plural, one {{n} background note could not stay on the game's track (a lane in {mode}) and was placed on another} other {{n} background notes could not stay on the game's track (a lane in {mode}) and were placed on another}}",
  'cabinet.grown':
    '{n, plural, one {{n} track} other {{n} tracks}} added to the chart so no background sound is cut',
  // Records: the game chart's entries other than notes; bmson is the chart format EZ2BMS saves.
  'cabinet.kept':
    '{n, plural, one {{n} record bmson has no place for (scroll, volume, beats...) written back where the game had it} other {{n} records bmson has no place for (scroll, volume, beats...) written back where the game had them}}',
  // {chars}: the characters, separated by spaces
  'cabinet.name':
    "The chart's header name has characters Korean Windows (CP949) cannot write: {chars} (written as ?)",
  // An EZ2 tick is 1/48 of a beat, the finest step a chart has.
  'cabinet.records-res':
    "{n} of the game chart's own records (volume, marks...) fall between EZ2 ticks - was the resolution changed by hand? Each is written at the nearest tick",
  // {tier}: NM, HD, SHD or EX
  'cabinet.tier-new': '{mode} {tier} is new to this song: the game will list it at level {level}',
  'cabinet.2p':
    'The game also has a two-player file for {mode} {tier} ({file}), which stays as it is',
  // {file}: the mode's lane layout file, e.g. StreetMix.gds
  'cabinet.gds':
    "The game folder has no {file}: lanes are placed on EZ2BMS's own tracks for {mode}",
  // {song}: the song's folder in the game, e.g. alpha
  'cabinet.song-hidden':
    '{mode}: the game lists a song only when its NM has a level, and {song} has none there',
  // {names}: up to five sound names, e.g. "kick.wav, snare.wav..."
  'cabinet.missing-sound':
    "{n, plural, one {{n} keysound has} other {{n} keysounds have}} no file ({names}): listed, and silent, as the game's own missing sounds are",
  'cabinet.convert':
    '{n, plural, one {{n} keysound} other {{n} keysounds}} converted to 16-bit 44.1 kHz stereo (the rest go as they are)',

  // Why a chart cannot go into the game (publish/cabinet.ts), shown beside it.
  // {table}: EZ2PORT's name for the mode, e.g. ClubMix
  'export.not-listed':
    "the game's {table} table does not list {song} (a cabinet export can only replace what the game has)",
  'export.second-chart': 'a second {mode} {tier} chart',

  // Why a song cannot be published as an EZ2PORT package (publish/package.ts).
  // The key is the song's folder name in EZ2PORT.
  'publish.song-key': 'song key "{key}" must be 1-15 lowercase letters or digits',
  'publish.no-charts': 'a song needs at least one chart',
  'publish.duplicate-chart': 'two charts are {mode} {tier}',
  'publish.mode-unsupported': '{mode} cannot be published to EZ2PORT yet',
  // The title plate's colours (publish/plate.ts); "12th" etc. is the game
  // version whose plates have that colour.
  'publish.tint.white': 'White',
  'publish.tint.green': 'Green (12th)',
  'publish.tint.cyan': 'Cyan',
  // A halo: a glow of colour around white letters.
  'publish.tint.orange-halo': 'Orange halo (11th)',
  'publish.tint.cyan-halo': 'Cyan halo (15th)',

  // Reading the song file, ez2bms.song.json (song/songfile.ts). The word
  // before "is not" is the setting's name in the file, kept as it is.
  // {error}: what the JSON reader said, in English
  'song.file.json': 'ez2bms.song.json is not valid JSON ({error})',
  'song.file.not-object': 'ez2bms.song.json does not hold an object',
  'song.file.key': 'key is not text; it was ignored',
  'song.file.preview': 'preview is not a preview setting EZ2BMS reads; it was kept as it is',
  'song.file.bga': 'bga is not a BGA setting EZ2BMS reads; it was kept as it is',
  'song.file.plate': 'plate is not a plate setting EZ2BMS reads; it was kept as it is',
  // {field}: disc or eyecatch, the setting's name in the file
  'song.file.art': '{field} is not an image setting EZ2BMS reads; it was kept as it is',
  'song.file.source': 'source is not an import record EZ2BMS reads; it was kept as it is',
  // An undo step's name: the song's title, subtitle, artist or genre changed.
  'song.undo.info': 'Song info',

  // A movie's container when it is none EZ2BMS knows (media/movie.ts).
  'media.container.unknown': 'unknown',

  // Why a file of the game's cannot be read (ez2data/). The executable is
  // the game's own program, whose key tables decrypt its charts.
  'data.exe.no-mz': 'not an executable (no MZ)',
  'data.exe.pe-range': 'PE header out of range',
  'data.exe.not-pe': 'not a PE image',
  'data.exe.not-32': 'not a 32-bit PE image',
  'data.exe.sections': 'section table out of range',
  // PACKED: the executable as shipped, compressed; its tables are only readable once unpacked.
  'data.exe.packed': 'key table address is not in any section (is this the PACKED executable?)',
  'data.exe.truncated': 'executable is truncated',
  'data.exe.not-table':
    'extracted data is not the expected key table (wrong or modified executable)',
  // song.bin: each mode's song list. EZSL: the four letters it starts with.
  'data.songdb.short': 'song.bin is too short',
  'data.songdb.magic':
    "song.bin does not say EZSL: the wrong executable's tables, or not a song.bin",
  'data.songdb.header': "song.bin's header points past its end",
  'data.songdb.encrypted': 'song.bin is encrypted: set the unpacked EZ2AC executable',
  // {key}: a song's key in the game
  'data.songdb.unlisted': 'song.bin does not list {key}',
  // .gds: a mode's lane layout; [SlotN] is a section's name.
  'data.gds.no-slot': 'no [SlotN] section',
  // .pvi: a play screen's layout; [General] is a section's name.
  'data.pvi.no-general': 'not a .pvi (no [General] section)',
  // .abm: the game's images. AW: the two letters it starts with.
  'data.abm.short': 'too short to hold a header',
  'data.abm.magic': 'not an .abm (no AW magic)',
  'data.abm.version': 'no known XOR table decodes this header',
  'data.abm.bpp': 'unsupported bits per pixel {bpp}',
  // {w}x{h}: width by height in pixels
  'data.abm.size': 'implausible dimensions {w}x{h}',
  'data.abm.data': 'pixel data starts past the end',
} satisfies Record<string, string>;
