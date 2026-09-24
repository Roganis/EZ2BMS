// The chart drawers (notes, chart info, timing, issues, sounds) and the frame: files, autosave, the app.

export const drawers = {
  'inspector.hintPlace':
    'Click a lane to place a note with the sound picked on the left; drag up to make a hold.',
  // Each {…} is a key cap (Shift, Alt).
  'inspector.hintDrag':
    "Drag notes to move them, their end to resize. Right-drag erases, {shift}-drag selects, {alt}-click picks up a note's sound.",
  // Each {…} is a key cap (L, K, M, Alt ← →, [ ], B, Tab, Ctrl K), then what it does. A hold is a long note.
  'inspector.hintKeys':
    '{l} hold · {k} hold kind · {m} mirror · {lanes} lanes · {snap} snap · {b} BPM · {tab} play view · {palette} everything else',
  'inspector.selection': 'Selection',
  // {count} is {n} drawn in bold; {pos} is a position (measure:beat).
  'inspector.summary':
    '{count} {n, plural, one {note} other {notes}} · {lanes, plural, one {{lanes} lane} other {{lanes} lanes}}{bgm, plural, =0 {} other { · {bgm} background}} · from {pos}',
  'inspector.sound': 'Sound',
  // In a menu, when the selected notes differ.
  'inspector.several': '(several)',
  // The hold's length, in beats.
  'inspector.holdBeats': 'Hold, beats',
  // In the empty length box: the selected notes have different lengths.
  'inspector.lengthMixed': 'mixed',
  // In the empty length box: a note with no hold.
  'inspector.lengthTap': 'tap',
  'inspector.lengthCovers': 'That length would cover another note',
  'inspector.holdKind': 'Hold kind',
  // A hold kind the engine does not know: it plays as kind 0.
  'inspector.kindUnknown': '{kind} (as 0)',
  // How often the game judges the selected holds, and how many notes they count for in the score.
  'inspector.holdCounts': 'Judged {judged}× (heads and instalments), counted as {counts}.',
  'inspector.holdCountsShort':
    'Judged {judged}× (heads and instalments), counted as {counts}. A perfect play cannot score exactly 100%.',
  'inspector.velocity': 'Velocity',
  // {vel} is the note's velocity (0-127), {db} its level in decibels.
  'inspector.velocityDb': '{vel} · {db} dB',
  'inspector.pan': 'Pan',
  'inspector.panCentre': 'centre',
  // L or R: panned left or right, {db} decibels quieter on the other side.
  'inspector.panSide': '{side, select, left {L} other {R}} {db} dB',
  // Buttons: make the selected notes holds (long notes) or taps again; mirror them across the lanes.
  'inspector.hold': 'Hold',
  'inspector.mirror': 'Mirror',
  'inspector.delete': 'Delete',

  'chartInfo.mode': 'Mode',
  'chartInfo.title': 'Title',
  // Beside a field: it applies to every chart of the song.
  'chartInfo.everyChart': 'every chart',
  'chartInfo.titleBytes': "EZ2PORT's song list keeps the first 32 bytes",
  'chartInfo.artist': 'Artist',
  'chartInfo.genre': 'Genre',
  // {fields} are bmson's field names (title, artist…), as the file writes them.
  'chartInfo.differs': "The charts differ in {fields}: this shows the NM chart's",
  'chartInfo.tier': 'Tier',
  // {tier} is a difficulty code (NM, HD, SHD, EX).
  'chartInfo.makeTier': 'Make this chart {tier} (its file follows when saved)',
  'chartInfo.level': 'Level',
  'chartInfo.judgement': 'Judgement',
  // A preset menu's entry when the values match no preset.
  'chartInfo.custom': 'Custom',
  'chartInfo.windowsHint':
    "Windows in 1/192-beat ticks at each note's BPM; EZ2PORT adds 3 when it loads.",
  // The life gauge: how much each judgement fills or drains it.
  'chartInfo.gauge': 'Gauge',
  'chartInfo.song': 'Song',
  // The song key: EZ2PORT's id for the song.
  'chartInfo.key': 'Key (folder name in EZ2PORT)',
  'chartInfo.keyRule': '1-15 lowercase letters or digits',
  'chartInfo.category': 'Category on the song wheel',
  // ALL is the song wheel's bank that lists every song.
  'chartInfo.categoryHint': 'EZ2PORT lists the song in this one bank only (not in ALL)',

  'timing.startBpm': 'Start BPM',
  // Pulses (ticks) per beat.
  'timing.resolution': 'Resolution',
  'timing.perBeat': '{n} / beat',
  'timing.bpmChanges': 'BPM changes',
  'timing.remove': 'Remove',
  // {key} is a key cap (B).
  'timing.noBpm': 'None. {key} adds one at the cursor.',
  // STOP is the game's term for a pause in the scroll.
  'timing.stops': 'STOPs',
  // {key} is a key cap (S).
  'timing.noStops': 'None. {key} adds one at the cursor (length in pulses).',
  'timing.stopWarn':
    'EZ2 has no STOP: EZ2PORT gets a gap in time instead, so the scroll does not freeze.',
  'timing.scroll': 'Scroll speed',
  'timing.scrollMultiplier': 'Scroll multiplier',
  // {palette} is a key cap (Ctrl K), {command} what to type in the palette (scroll 1.5).
  'timing.noScroll':
    'None. {palette} {command} makes the field scroll 1.5 times as fast from the cursor on.',
  // Issues is the drawer's tab of that name.
  'timing.legacy':
    '{n} more from the game chart, kept by an older import: they play and publish; Issues turns them into changes you can edit here.',
  'timing.scrollHint':
    "A multiplier on the player's speed: EZ2PORT eases to it over a few frames, and every note on the field moves with it. Timing does not change.",
  'timing.kept': 'From the game chart ({n})',
  'timing.keptHint':
    'Records bmson has no place for, kept for a cabinet export, which writes them back on their tracks. Read-only; they move with a change of resolution. EZ2PORT does not use them.',
  // A track of the game's chart file.
  'timing.track': 'track {n}',
  'timing.andMore': 'and {n} more',

  // Which findings the list shows.
  'issues.show': 'Show',
  'issues.all': 'All {n}',
  'issues.errors': 'Errors {n}',
  'issues.warnings': 'Warnings {n}',
  // Findings of the mildest kind (for information), not the chart's notes.
  'issues.notes': 'Notes {n}',
  'issues.none': 'Nothing to fix: this song is ready for EZ2PORT.',
  'issues.fixAllTitle': 'One undo step in each chart',
  'issues.fixAll': 'Fix all',
  // {fix} is the fix's own name, as its button shows it.
  'issues.fixed': '{fix}: done (Ctrl+Z undoes it)',
  'issues.fixFailed': 'The fix failed: {error}',

  'channels.title': 'Sounds',
  'channels.filter': 'Filter {n} sounds',
  'channels.importTitle': 'Import sound files into the song (or drop them on the window)',
  'channels.workbenchTitle': 'Every sound of the song, with waveforms (Ctrl+Shift+B)',
  'channels.renameTitle': '{name} - double-click to rename',
  'channels.listen': 'Listen',
  'channels.remove': 'Remove (unused)',
  'channels.noMatch': 'No sound matches',
  'channels.none': 'No sounds yet',
  'channels.more': '…and {n} more, filter to find them',
  'channels.unused': 'In the folder, not in this chart',
  'channels.addAll': 'Add all',
  'channels.add': 'Add {name}',
  // Always more than one.
  'channels.added': 'Added {n} sounds',

  'sounds.pickTitle': 'Import sounds into the song',
  'sounds.importFailed': 'Import failed: {error}',
  // The import's report is made of these clauses, joined by " - ".
  'sounds.imported': '{n, plural, one {Imported {n} sound} other {Imported {n} sounds}}',
  'sounds.alreadyThere': 'Already in the folder',
  // {chart} is the chart's mode and difficulty (7 KEY HD).
  'sounds.addedTo': '{n, plural, one {{n} sound} other {{n} sounds}} added to {chart}',
  // {files} are file names; {error} why the first was skipped.
  'sounds.skipped': 'skipped {files} ({error})',
  'sounds.nothing': 'Nothing to import',
  'sounds.reloaded': 'Sounds reloaded',
  'sounds.replaced': 'Replaced {from} with {to} in {n, plural, one {{n} chart} other {{n} charts}}',
  // Names the change in “Replace undone, except in 2 charts edited since”.
  'sounds.replaceStep': 'Replace',
  'sounds.allUsed': 'Every sound is used in its charts',
  'sounds.removed':
    'Removed {n, plural, one {{n} unused sound} other {{n} unused sounds}} from {charts, plural, one {{charts} chart} other {{charts} charts}}',
  // Names the change in “Remove undone, except in 2 charts edited since”.
  'sounds.removeStep': 'Remove',
  'sounds.cantRename': "Can't rename {file}: {reason}",
  'sounds.renamed':
    'Renamed {from} to {to}{charts, plural, =0 {} one { in {charts} chart} other { in {charts} charts}}{unsaved, plural, =0 {} other { ({unsaved} unsaved)}}',
  // After the rename's report, joined by " - ": charts that named the new file, which now plays for them.
  'sounds.adopted':
    '{names} {n, plural, one {was missing and now plays it} other {were missing and now play it}}',
  'sounds.undo': 'Undo',

  // The title of the system's folder picker.
  'project.pickFolder': 'Open a song folder',
  'project.saved': '{n, plural, one {Saved {n} chart} other {Saved {n} charts}}',
  'project.nothingToSave': 'Nothing to save',
  // {detail} is the chart's file and why the disk refused the new name.
  'project.keptOldName': 'Kept the old file name - {detail}',

  'autosave.kept': 'Unsaved changes to {file} from {when} were kept after EZ2BMS closed.',
  'autosave.recover': 'Recover',
  'autosave.recovered': 'Recovered {file} - save to keep it',

  // A command that failed: its title, then what went wrong.
  'app.commandFailed': '{command}: {message}',
  'app.noAudio': 'No audio device - playing silently ({error})',
  'app.cannotOpen': 'EZ2BMS does not open {file}',
  'app.notAChart': 'Opened the song, but {file} is not one of its charts',
  // {song} is the open song's folder, {what} the file to open instead.
  'app.leaveUnsaved': '{song} has unsaved changes. Open {what} anyway? The autosave keeps them.',
  'app.open': 'Open',
  'app.startBpm': '{bpm} BPM from the start',
  'app.openFailed': 'Could not open {dir}: {error}',
  // The title of the system's folder picker.
  'app.newSongFolder': 'Folder for the new song (its sounds can already be there)',
  // Typed in the palette wrong. {verb} is the palette word (snap, speed, goto): it stays as typed.
  'app.snapArg': '{verb} is one of {grids}',
  'app.speedArg': '{verb} is 50-999 %',
  'app.gotoArg': '{verb} takes a measure number',

  'cmd.file.open': 'Open song folder…',
  'cmd.file.save': 'Save',
  'cmd.file.newSong': 'New song…',
  'cmd.file.import': 'Import a song… (EZ2AC, BMS, bmson)',
  'cmd.file.exportCabinet': 'Export to EZ2AC… (into a song the game has)',
  'cmd.file.exportBms': 'Export as BMS…',
  'cmd.file.exportRestore': 'Undo a cabinet export…',
  'cmd.song.clearImportNotes': 'Forget what the import said (clear it from Issues)',
  'cmd.file.close': 'Close song',

  'cmd.edit.undo': 'Undo',
  'cmd.edit.redo': 'Redo',
  'cmd.edit.selectAll': 'Select all notes',
  'cmd.edit.deselect': 'Select nothing',
  'cmd.edit.delete': 'Delete selected notes',

  'cmd.view.palette': 'Command palette',
  // Edit and Play are the editor's two views (the top bar's EDIT and PLAY).
  'cmd.view.togglePlay': 'Switch Edit / Play view',
  'cmd.view.snapFiner': 'Finer snap',
  'cmd.view.snapCoarser': 'Coarser snap',
  'cmd.view.snap': 'Snap to…',
  'cmd.view.zoomIn': 'Zoom in',
  'cmd.view.zoomOut': 'Zoom out',
  'cmd.view.speed': 'Play speed…',
  // P1 and P2: the cabinet's player sides.
  'cmd.view.side': 'Swap P1 / P2 view',
  'cmd.view.gameSkin': 'Game skin on / off',
  'cmd.view.left': 'Show / hide sounds',
  // Keysounds: the sounds the notes play.
  'cmd.view.workbench': 'Keysound workbench',
  'cmd.view.songManager': 'Song manager (info, category, every chart)',
  'cmd.view.inspector': 'Inspector',
  'cmd.view.chartInfo': 'Chart info',
  'cmd.view.timing': 'Timing',
  'cmd.view.goto': 'Go to measure…',
  'cmd.view.start': 'Go to start',
  'cmd.view.end': 'Go to last note',
  'cmd.view.stepUp': 'Cursor up one snap',
  'cmd.view.stepDown': 'Cursor down one snap',
  'cmd.view.measureUp': 'Cursor up one measure',
  'cmd.view.measureDown': 'Cursor down one measure',

  'cmd.chart.new': 'New chart…',
  'cmd.sounds.import': 'Import sounds…',
  'cmd.sounds.reload': 'Reload sound files (after editing them in another program)',
  'cmd.sounds.removeUnused': 'Remove unused sounds from every chart',
  // The title of the commands chart.select1…9 (Ctrl+1…9): {n} is the chart's place in the top bar.
  'app.switchChart': 'Switch to chart {n}',
} satisfies Record<string, string>;
