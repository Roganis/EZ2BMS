// Import and export: the import wizard and the Export dialog (cabinet and BMS).

export const transfer = {
  // The game folder, read the same way for import and export (state/game.ts).
  'import.game.noRoot': 'Set your EZ2AC data folder on the EZ2PORT panel first',
  'import.game.noSongs': 'No songs found: is this the folder with sound/ and system/ in it?',

  'import.label': 'Import a song',
  'import.title': 'Import',
  'import.close': 'Close',
  'import.tab.game': 'EZ2AC songs',
  'import.search': 'Search titles',
  'import.reading': 'Reading the song tables…',
  'import.readAgain': 'Read again',
  'import.game.bpm': '{bpm} BPM',
  // {key} is the song's key (its folder name), drawn in bold.
  'import.game.summary': 'Song key {key} · category {category} · {n} keysounds',
  'import.game.chart': 'level {level} · {notes} notes',
  'import.game.hint':
    "Pick a song. Its charts become bmson files in a new song folder, its keysounds WAVs (the same samples), under a new key - publishing under the game's own would replace that song on the wheel.",

  'import.bms.pick': 'A folder of BMS files',
  'import.bms.folder': 'Folder',
  'import.bms.read': 'Read',
  'import.bms.none': 'No .bms, .bme, .bml or .pms files in that folder',
  'import.bms.file': 'File',
  'import.bms.songTitle': 'Title',
  // The column choosing the file's text encoding.
  'import.bms.text': 'Text',
  // The column choosing a value for each #RANDOM in the file.
  'import.bms.random': 'Random',
  'import.bms.lanes': 'Lanes',
  'import.bms.mode': 'Mode',
  'import.bms.tier': 'Tier',
  'import.bms.notes': '{n, plural, one {{n} note} other {{n} notes}}',
  'import.bms.guess': 'A guess from the bytes',
  // #RANDOM is a BMS command, written as it is.
  'import.bms.randomLine': '#RANDOM on line {line}',
  'import.bms.keysInOrder': 'Keys in order',
  'import.bms.skip': 'Leave this file out',
  'import.bms.clash': '{file} is already that chart',
  // Shown when another file already takes this chart's mode and tier.
  'import.bms.taken': 'taken',
  'import.bms.summary':
    'Song key {key} · {charts, plural, one {{charts} chart} other {{charts} charts}} · {files, plural, one {{files} file} other {{files} files}} used',
  'import.bms.inPlace': 'Write the song beside the BMS files (nothing copied)',

  // {beat7k} and {beat10k} are bmson's lane layouts beat-7k and beat-10k, shown as code.
  'import.bmson.hint':
    "A bmson opens as it is: open its folder. Older bmson (0.21, from BmsONE) is read as 1.0, and lanes numbered the BMS way ({beat7k}, {beat10k}, both numberings) are moved onto EZ2's; Issues says what changed. circus2bmson's output opens the same way.",
  'import.bmson.open': 'Open a folder…',

  'import.findings':
    '{n, plural, one {{n} thing to know (they go to Issues)} other {{n} things to know (they go to Issues)}}',
  'import.dest': 'New folder',
  // Opens a folder picker.
  'import.choose': 'Choose…',
  'import.dest.pick': 'Where the new song folder goes',
  'import.go': 'Import',
  'import.going': 'Importing…',
  'import.progress': '{done} / {total} files',

  'import.nothing': 'Nothing to import',
  'import.clash': '{file} is already in {dir}',
  'import.noDest': 'Choose where the new song goes',
  // {file}: the first that failed, followed by ... when there are more.
  'import.copyFailed':
    '{n, plural, one {{n} keysound} other {{n} keysounds}} could not be copied: {file}',
  'import.done':
    'Imported {n, plural, one {{n} chart} other {{n} charts}} - Issues says what could not come across',
  'import.failed': 'Import failed: {error}',

  'export.label': 'Export the song',
  'export.title': 'Export',
  'export.close': 'Close',
  'export.tab.cabinet': 'EZ2AC cabinet',
  'export.tab.history': 'Past exports',

  'export.search': "Search the game's songs",
  'export.reading': 'Reading the song tables…',
  'export.readAgain': 'Read again',
  'export.hint':
    "Pick the game's song to replace. A cabinet export remixes a song the game already has: your charts take its charts' places (a tier it lacks is added), its song.bin record gets their levels and BPM, and new keysounds go beside its own - nothing of the game's is written over but the charts, and a backup keeps those.",
  // {from} and {dir} are song keys (folder names in the game).
  'export.otherSong':
    "This song came from {from}: exporting into {dir} puts your charts in place of {dir}'s.",

  'export.col.chart': 'Chart',
  // The game's chart file this chart is written as.
  'export.col.becomes': 'Becomes',
  'export.col.level': 'Level',
  'export.col.bpm': 'BPM',
  'export.col.size': 'Size',
  'export.chart.replaces': 'replaces',
  'export.chart.new': 'new',
  // The chart file's size against the most the game reads.
  'export.chart.size': '{size} KB of 128 KB',
  'export.chart.skipped': 'left out',

  // {root} is the game folder's path.
  'export.dest.game': 'Into the game folder {root} - a backup keeps every file it replaces',
  'export.dest.folder': 'Into a new folder shaped like the game, to copy onto the cabinet',
  'export.dest.new': 'New folder',
  // Opens a folder picker.
  'export.choose': 'Choose…',
  'export.dest.pick': 'An empty folder for the export',
  'export.dest.unchanged': 'Also copy the keysounds the game already has',
  // song.bin and EZ2BMS-EXPORT.txt are file names.
  'export.dest.songdb':
    "song.bin is this game's whole table for the mode: copy it only onto a cabinet with the same game version, or its other songs' levels change with it. EZ2BMS-EXPORT.txt in the folder says what each file replaces.",

  'export.preparing': 'Working out the export…',
  // {write} is drawn in bold.
  'export.sounds':
    'Keysounds: {write} new, {reused} already in the folder{missing, plural, =0 {} other {, {missing} missing}}{converted, plural, =0 {} other { ({converted} converted)}}',
  // {mode} is the mode's name in EZ2PORT; song.bin is the game's table of levels for it.
  'export.songdb': '{mode} song.bin:',
  'export.songdb.bytes': '({n} bytes change)',
  'export.songdb.unchanged': 'unchanged',
  'export.findings': '{n, plural, one {{n} thing to know} other {{n} things to know}}',
  // {stamp} is the backup's name, drawn as code.
  'export.done':
    'Exported into the game: {replaced} replaced, {added} added. The backup is {stamp}.',
  'export.undo': 'Undo this export',
  'export.wrote': 'Wrote {files} files into {dir}.',
  'export.go': 'Export',
  'export.going': 'Exporting…',

  'export.noSong': 'no song is open',
  'export.noChart': 'Choose a chart to export',
  'export.blocked.errors': '{n, plural, one {{n} error} other {{n} errors}} to fix first',
  'export.blocked.noChart': 'No chart can go into this song',
  'export.blocked.noFolder': 'Choose the new folder',
  'export.failed': 'Export failed: {error}',
  // {why} is what the game's reading said.
  'export.cabinet.noTables':
    "The game's charts are encrypted with keys from its executable, and there are none: {why}",
  'export.cabinet.noExe':
    "The game's charts are encrypted with keys from its executable, and there are none: set the executable on the EZ2PORT panel",
  'export.cabinet.unreadable': '{file} could not be read',
  // {files}: the first few, followed by ... when there are more.
  'export.cabinet.soundsUnreadable':
    '{n, plural, one {{n} keysound} other {{n} keysounds}} cannot be read: {files}',

  // EZ2BMS-EXPORT.txt, written into a folder export: what each file is.
  'export.note.title': 'EZ2BMS cabinet export: {title} into sound/{dir}',
  // {when} is a date and time (ISO 8601).
  'export.note.made': 'Made {when} against the game folder {root}.',
  'export.note.copy': "Copy the folders here onto the cabinet's game folder. Each file:",
  'export.note.songdb':
    "{file}  (replaces the game's whole table for this mode: copy it only onto the same game version)",
  'export.note.replaces': '{file}  (replaces the game file)',
  'export.note.new': '{file}  (new)',
  'export.note.sound': '{file}  (new keysound)',
  'export.note.own': "{file}  (the game's own, unchanged)",
  'export.note.reused': 'and {n} keysounds the game already has, used as they are',

  'export.bms.hint':
    "One BMS (or BME, when it uses keys 6-7) per chart, and every sound beside them: WAV and OGG files copied as they are, anything else - EZ2's .ssf, FLAC, MP3, a stem's slices - as WAV.",
  // The file each chart is written as.
  'export.bms.writes': 'Writes',
  'export.bms.notes': 'Notes',
  'export.bms.lanes': 'Lanes',
  'export.bms.mapEz2': 'EZ2 BME (scratch 16, pedal 17, effectors 18/19)',
  'export.bms.mapKeys': 'Keys in order (for IIDX/beat players)',
  // The text encoding the BMS files are written in.
  'export.bms.text': 'Text',
  'export.bms.encodingAuto': 'Auto (Shift-JIS, else Korean, else UTF-8)',
  'export.bms.korean': 'Korean (CP949)',
  // beatoraja is a BMS player.
  'export.bms.utf8': 'UTF-8 (beatoraja)',
  // How the sounds are numbered in the BMS (#WAVxx): in base 36 or base 62.
  'export.bms.ids': 'Sound ids',
  'export.bms.idsAuto': 'Auto (base 36, 62 past 1295 sounds)',
  'export.bms.base': 'Base {n}',
  'export.bms.summary':
    '{charts, plural, one {{charts} chart} other {{charts} charts}} · {sounds} sounds ({copied} copied, {made} made)',
  'export.bms.pick': 'An empty folder for the BMS files',

  // {root} is the game folder's path.
  'export.history.hint':
    'Every export into {root} kept the files it replaced. Restore puts them back and takes away what it added - where a file is still what the export wrote.',
  'export.history.hintNoRoot':
    'Every export into the game folder kept the files it replaced. Restore puts them back and takes away what it added - where a file is still what the export wrote.',
  'export.history.none': 'No exports yet.',
  // {state}: applying (cut off while writing), applied (in the game) or restored (undone).
  'export.backup.row':
    '{when} · {files} files · {state, select, applying {applying} applied {applied} restored {restored} other {{state}}}',
  'export.backup.restore': 'Restore',
  'export.backup.restored': 'Restored',
  'export.restore.conflicts':
    '{n, plural, one {{n} file has changed since the export ({files}): restoring would lose that.} other {{n} files have changed since the export ({files}): restoring would lose that.}}',
  'export.restore.anyway': 'Restore anyway',
  'export.restore.done': 'Restored: {restored} put back, {removed} removed',
  'export.restore.nothing': 'Nothing to restore: the game already has its own files',
  'export.restore.failed': 'Restore failed: {error}',
} satisfies Record<string, string>;
