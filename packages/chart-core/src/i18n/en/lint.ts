// What the pre-flight check says about a chart and a song (lint/lint.ts),
// and its quick fixes (lint/fixes.ts). EZ2PORT, EZ2, NM and the mode names
// are names; "EZ2 tick" is 1/48 of a beat, the finest step a chart has.

export const lint = {
  'lint.level': "Level {level} is outside 1-20, which EZ2PORT's song list uses",
  'lint.bpm.start': 'Start BPM {bpm} must be between 0 and 1000',
  'lint.bpm': 'BPM {bpm} must be between 0 and 1000',
  'lint.init-bpm': 'A BPM change at the start ({bpm}) disagrees with the start BPM ({start})',
  'lint.bpm-same-tick': 'Two BPM changes ({a}, {b}) land on the same EZ2 tick',
  'lint.stops':
    '{n, plural, one {{n} STOP} other {{n} STOPs}}: EZ2 has none, so EZ2PORT gets a gap in time and the scroll does not freeze',
  // ×{rate}: a scroll speed multiplier, e.g. ×1.5
  'lint.scroll-rate':
    'A scroll change of {rate}: the field would stand still or run backwards (it must be above 0)',
  'lint.scroll-same-tick':
    "Two scroll changes (×{a}, ×{b}) land on the same EZ2 tick: EZ2PORT's sort does not say which one it keeps",
  'lint.scroll-count':
    '{n} scroll changes: EZ2PORT keeps the first {max} (in track order) and drops the rest',
  'lint.scroll-legacy':
    "{n, plural, one {{n} scroll change from the game chart, kept from an older import: it plays and publishes, but cannot be edited until turned into the chart's own} other {{n} scroll changes from the game chart, kept from an older import: they play and publish, but cannot be edited until turned into the chart's own}}",
  // {mode}: a game mode's name, e.g. StreetMix
  'lint.off-mode':
    '{n, plural, one {{n} note is} other {{n} notes are}} on lanes {mode} does not have; EZ2PORT plays them as background',
  'lint.empty': 'No notes to play in this chart yet',
  'lint.notes-limit': '{n} notes: EZ2PORT holds at most {max}',
  // {worst}: a fraction of a tick, e.g. 0.50
  'lint.off-grid':
    '{n, plural, one {{n} note} other {{n} notes}} between EZ2 ticks (1/48 beat) will be rounded, by up to {worst} tick',
  'lint.hold-kind-max':
    '{n, plural, one {{n} hold uses a kind} other {{n} holds use kinds}} (4, 5, 9-12) the engine counts differently from how it pays: a perfect play will not score exactly 100%',
  // A "slice": the part of a sound a note plays.
  'lint.same-pulse-sound':
    '{n, plural, one {{n} note shares} other {{n} notes share}} a position with another note of the same sound: the slice that plays is ambiguous',
  'lint.lane-duplicates':
    '{n, plural, one {{n} note shares} other {{n} notes share}} a lane and an EZ2 tick with another: one press cannot hit both',
  'lint.note-in-hold':
    '{n, plural, one {{n} hold covers} other {{n} holds cover}} a later note on the same lane',
  'lint.up-notes':
    '{n, plural, one {{n} release (up) note} other {{n} release (up) notes}}: EZ2 has no release sound, they play as ordinary notes',
  'lint.lines':
    "The chart's bar lines are not every four beats: EZ2PORT draws a line every four beats whatever the chart says",
  // judge_rank and total are bmson fields' names.
  'lint.bms-judge':
    'judge_rank {rank} and total {total} are BMS settings EZ2PORT does not use: its judgement and gauge are set in Chart info',
  'lint.slots': "{n} sounds: more than EZ2PORT's {max} keysound slots",
  'lint.slots.original': '{n} sounds: the original game loads at most {max} (EZ2PORT is fine)',
  'lint.unused-sounds':
    '{n, plural, one {{n} sound plays} other {{n} sounds play}} no note in this chart',
  // {names}: up to three file names, e.g. "kick.wav, snare.wav…"
  'lint.missing-sounds':
    '{n, plural, one {{n} sound} other {{n} sounds}} used by notes cannot be read: {names}',
  'lint.mode-keyword':
    "EZ2PORT's bmson importer would read this chart as {mode}; Publish writes the package itself, so only a raw bmson dropped into the songs folder is affected",
  'lint.mode-keyword.because':
    'EZ2PORT\'s bmson importer would read this chart as {mode} (because of "{keyword}"); Publish writes the package itself, so only a raw bmson dropped into the songs folder is affected',
  'lint.title': "The title is over {max} bytes; EZ2PORT's song list shows the first {max}",
  'lint.title-semicolon':
    "The title contains ';', which song.ini reads as a comment; Publish writes ',' instead",

  'lint.song-key.none':
    'The song needs a key: its folder name in EZ2PORT (1-15 lowercase letters or digits)',
  'lint.song-key': 'Song key "{key}" must be 1-15 lowercase letters or digits',
  'lint.inside-songs-root':
    "The song folder is inside EZ2PORT's songs folder: the port would import its bmson files itself, beside what Publish writes",
  'lint.no-charts': 'The song has no charts',
  'lint.chart-count': '{n} charts: a song holds at most {max}',
  'lint.song-invisible': 'EZ2PORT only lists a song with an NM chart of level 1 or more',
  'lint.mode-invisible':
    '{mode} charts will not show: EZ2PORT lists a song in a mode only when that mode has an NM chart of level 1 or more',
  // {category}: the category's value as stored, e.g. 0 or "pop"
  'lint.category':
    'Category {category} is not one EZ2PORT knows (1-48): the song goes under CUSTOM',
  // {category}: a song-list category's label, e.g. HOT
  'lint.category-unreachable': '{mode} pages past {category}: its charts cannot be reached there',
  'lint.art-missing.disc': 'The disc image {src} is not in the song folder',
  'lint.art-missing.eyecatch': 'The eyecatch image {src} is not in the song folder',
  'lint.no-disc': 'The song has no disc art: its disc on the wheel will be blank',
  'lint.art-missing.plate': 'The title plate image {src} is not in the song folder',
  'lint.plate-failed': 'The title plate cannot be made: {error}',
  // {chars}: the characters, separated by spaces
  'lint.plate-glyphs': "The title plate's fonts have no {chars}: they come out as boxes",
  'lint.plate-text': 'The title plate reads "{text}"; the song is titled "{title}"',
  'lint.art-missing.preview': "The preview's audio file {src} is not in the song folder",
  'lint.preview-late': 'The preview starts after the last note: the wheel may loop silence',
  // {value}: the value Publish uses, e.g. a title
  'lint.song-meta': `{field, select,
    title {The charts have different titles; Publish uses "{value}" (the NM chart's)}
    subtitle {The charts have different subtitles; Publish uses "{value}" (the NM chart's)}
    artist {The charts have different artists; Publish uses "{value}" (the NM chart's)}
    genre {The charts have different genres; Publish uses "{value}" (the NM chart's)}
    other {The charts have different {field}s; Publish uses "{value}" (the NM chart's)}
  }`,
  'lint.chart-file-name': '{file} will be saved as {want} (its mode, key and tier)',
  // {tier}: NM, HD, SHD or EX
  'lint.duplicate-chart': 'Two charts are {mode} {tier}',
  'lint.mode-unsupported': '{mode} cannot be published to EZ2PORT yet (cabinet export only)',

  'lint.bga-not-movie': 'The BGA {src} is not a movie: EZ2PORT shows none for it',
  'lint.art-missing.bga': 'The BGA movie {src} is not in the song folder',
  'lint.bga-unreadable': 'The BGA {src} cannot be read: {error}',
  // {why}: one of the movie.* reasons
  'lint.bga-codec': 'The BGA {src} will not play: {why}',
  'lint.bga-large':
    "The BGA is {w}x{h}: a 1280x960 movie drew nothing on EZ2PORT's cabinet; 640x480 is all it shows",
  'lint.bga-aspect': 'The BGA is {w}x{h}: EZ2PORT stretches it to 640x480 (4:3)',
  'lint.bga-short': 'The BGA ends {s} s before the song: it does not loop, the screen goes black',

  // Why EZ2PORT cannot play a BGA movie (media/movie.ts).
  'movie.unknown': 'it is not a movie EZ2PORT can open',
  'movie.avi.rewrap':
    "EZ2PORT's Windows build has no AVI reader: re-wrap it as MP4 or MKV (the picture need not be encoded again)",
  'movie.avi.convert':
    "EZ2PORT's Windows build has no AVI reader: convert it to H.264 in MP4, or VP9 in WebM",
  // {container}: a file format's name, e.g. MPEG
  'movie.container':
    "EZ2PORT's Windows build cannot read {container} files: convert it to H.264 in MP4, or VP9 in WebM",
  'movie.no-video': 'no video track was found in it',
  // {codec}: a video codec's name, e.g. HEVC
  'movie.codec':
    "EZ2PORT's Windows build has no {codec} decoder (it has H.264, MPEG-4 part 2, VP8, VP9 and WMV): convert it",

  // Quick fixes: what a button in Issues does.
  'fix.snap-off-grid': 'Snap them to the nearest EZ2 tick',
  'fix.lane-duplicates-to-bgm': 'Move the extra notes to the background',
  'fix.drop-bgm-copies': 'Remove the background copies',
  'fix.shorten-holds': 'Shorten each hold to end before the note',
  'fix.align-start-bpm': 'Make the start BPM match',
  'fix.clamp-level': 'Bring the level into 1-20',
  'fix.title-semicolon': "Write ',' for ';'",
  'fix.off-mode-to-bgm': 'Move them to the background',
  'fix.clear-up': 'Make them ordinary notes',
  'fix.remove-unused-sounds': 'Remove the unused sounds',
  'fix.lines-4-4': "Use EZ2's 4/4 bar lines",
  'fix.scroll-legacy': "Make them the chart's scroll changes",
  'fix.derive-key': 'Make one from the title',
  'fix.category-custom': 'Make it CUSTOM (48)',
} satisfies Record<string, string>;
