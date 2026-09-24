// Editing on the field: stem strips, the workbench, new charts, drops, the field and its tools.

export const edit = {
  'field.label': 'Playfield',
  'field.noWebgl': 'The playfield needs WebGL: {error}',
  // The last line of a tooltip listing the game chart's records at one spot.
  'field.keptMore': 'and {n} more',
  'field.noCharts': 'This song has no charts yet.',
  'field.newChart': 'New chart',
  'field.pickSound': 'Pick a sound to draw with first',
  'field.pickSoundLeft': 'Pick a sound to draw with first (Sounds, on the left)',
  'field.cantPlaceThere': "Can't place a note there",
  'field.cantPlace': "Can't place a note here: {reason}",
  // The sound new notes are drawn with (picked from a note).
  'field.brush': 'Brush: {sound}',
  // A tag of a few letters on a hold that pays once, after its end.
  'field.holdEnd': 'end',

  'notes.stepOn': 'Step input on: Z S X D C V B, Shift, Space place notes at the cursor',
  'notes.stepOff': 'Step input off',
  'notes.holdBlocked': 'A hold there would cover another note',
  'notes.mirrorBlocked': 'Mirroring would put two notes in one place',
  'notes.swapBlocked': 'Swapping would put two notes in one place',
  'notes.noLane': 'No lane there, or the lane is taken',
  'notes.inTheWay': 'Something is in the way',
  'notes.copied': 'Copied {n, plural, one {{n} note} other {{n} notes}}',
  'notes.cantPaste': "Can't paste here: notes would overlap",
  'notes.cantDuplicate': "Can't duplicate: notes would overlap",
  // These three follow the command's name: “Set BPM at the cursor…: BPM is between 0 and 1000”.
  'notes.bpmRange': 'BPM is between 0 and 1000',
  'notes.stopPulses': 'a STOP lasts a number of pulses',
  'notes.scrollRate': 'a scroll speed is a multiplier above 0, like 1.5',

  // To key: make a note on a lane play the sound that was playing in the background there.
  'classic.on': 'Classic mode: placing a note keys the sound playing there',
  'classic.off': 'Classic mode off: notes use the picked sound',
  // What a note at the pointer would key, by the pointer and in the status bar: the sound's
  // file, which of the candidates it is ({i} of {n}), and whether keying it would change how
  // the chart sounds (bad) or cut a slice of the sound (slice).
  'classic.label':
    '{sound}{n, plural, =1 {} other { ({i}/{n})}}{state, select, bad { - would change the sound} slice { · slice} other {}}',
  'classic.nothingHere': 'nothing sounds here',
  'classic.nothingToKey': 'Nothing sounds there to key',
  'classic.cantKey': "Can't key that: {reason}",
  'classic.cantUnkey': "Can't do that in Classic mode: {reason}",
  'classic.soundStarts': 'That is where a sound starts - Classic mode never removes one',
  'classic.cantHeal': "Can't heal that split: {reason}",
  'classic.nothingToSplit': 'Nothing sounds there to split',
  'classic.cantSplit': "Can't split there: {reason}",
  'classic.cantReset': "Can't reset: {reason}",
  'classic.reset': '{n, plural, one {{n} note} other {{n} notes}} back in the background',
  'classic.resetAsk': 'Send every note on a lane back to the background? The music stays the same.',
  'classic.resetGo': 'Reset',

  // A stem's panel: {sound} is its file.
  'strip.label': '{sound}: slicing',
  'strip.close': 'Close',
  'strip.tempo': 'Tempo',
  // {bpms} is one or more tempos, the likeliest first.
  'strip.soundsLike': 'Sounds like {bpms} BPM',
  // {pct}: how sure the beat tracker is.
  'strip.firstBeat': 'First beat {ms} ms into the file · {pct}% sure',
  'strip.useBpm': 'Use {bpm} BPM',
  'strip.tempoChanges': 'The chart changes tempo: set it on the Timing tab',
  'strip.listeningBeat': 'Listening for the beat…',
  'strip.noBeat': 'No steady beat found.',
  // A heading: where the sound's hits start.
  'strip.onsets': 'Cut at onsets',
  'strip.sensitivity': 'Sensitivity',
  'strip.exact': 'Exactly (to 1/48 beat), not to the snap grid',
  'strip.showOnsets': 'Show them on the strip',
  'strip.listening': 'Listening…',
  'strip.cuts': '{n, plural, one {{n} cut} other {{n} cuts}}',
  // A button.
  'strip.cutAtOnsets': 'Cut at onsets',
  'strip.midi': "Cut at a MIDI file's notes",
  'strip.midiPick': 'MIDI file…',
  'strip.midiPickTitle': 'A MIDI file of the song',
  'strip.notMidi': 'Not a MIDI file EZ2BMS reads: {error}',
  'strip.midiTrack': 'Track {n}',
  'strip.midiNotes': '{n} notes',
  'strip.midiKeepTempo': "Keep the chart's tempo",
  'strip.midiTakeTempo': "Take the MIDI's tempo from the stem's first hit",
  'strip.midiOnGrid': 'On the snap grid, not the nearest 1/48 beat',
  // {ms}: how far the cut furthest from its MIDI note is.
  'strip.midiCount': '{n, plural, one {{n} cut} other {{n} cuts}} · furthest {ms} ms from its note',
  'strip.midiMoves':
    '- the new tempo moves {n, plural, one {{n} other note} other {{n} other notes}} in time',
  'strip.midiCut': 'Cut',
  'strip.midiDone': "{n} cuts at {file}'s notes (Ctrl+Z undoes them)",
  'strip.notCut': 'Not cut: {reason}',
  'strip.remove': 'Remove the strip',
  'strip.pinned': '{sound}: a strip beside the lanes',
  // In a strip's title, where its length goes.
  'strip.notLoaded': 'not loaded',
  'strip.noOnsets': 'No onsets to cut at: raise the sensitivity, or it is cut there already',
  'strip.onsetsDone': '{n} cuts at onsets',

  'chop.title': 'Chop to the grid',
  // Before a grid size (1/8, 1/16…): chop every eighth, every sixteenth.
  'chop.every': 'Every',
  'chop.overSelection': 'over the selected slices',
  'chop.overStem': 'over the whole stem',
  'chop.leaveSilence': 'Leave silence uncut (under -48 dB)',
  'chop.count': '{n, plural, one {{n} cut} other {{n} cuts}} · {total} keysounds in this chart',
  // {max} keysounds: the most EZ2AC's executable loads for one chart.
  'chop.overLimit': "- more than the {max} EZ2AC's own executable loads",
  'chop.go': 'Chop',
  'chop.nothing': 'Nothing to chop there: it is cut on that grid already',
  'chop.done': '{n} cuts',

  'slice.nothingToCut': 'Nothing sounds there to cut',
  'slice.cantCut': "Can't cut there: {reason}",
  'slice.cantHeal': "Can't heal that cut: {reason}",
  'slice.cantMove': "Can't move that cut: {reason}",
  'slice.cantToBackground': "Can't send that to the background: {reason}",
  'slice.cantKey': "Can't key that there: {reason}",
  'slice.cantChop': "Can't chop there: {reason}",
  'slice.cantOnsets': "Can't cut at the onsets: {reason}",

  'audio.unreadable':
    '{n, plural, one {{n} sound} other {{n} sounds}} could not be read (see the Sounds drawer)',

  'workbench.label': 'Keysound workbench',
  'workbench.title': 'Sounds',
  'workbench.all': 'All',
  'workbench.used': 'Used',
  'workbench.unused': 'Not used',
  'workbench.missing': 'Missing',
  // Sounds in a chart's list that play no note in that chart.
  'workbench.channels': 'Unused in a chart',
  'workbench.find': 'Find a sound',
  'workbench.order': 'Order',
  'workbench.byGroup': 'By group',
  'workbench.byName': 'By name',
  'workbench.mostUsed': 'Most used',
  'workbench.longest': 'Longest',
  'workbench.importTitle': 'Copy sound files into the song (or drop them on the window)',
  'workbench.import': 'Import…',
  'workbench.removeUnusedTitle':
    "Remove every sound that plays no note, from each chart's list (files stay on disk)",
  'workbench.removeUnused': 'Remove unused ({n})',
  'workbench.close': 'Close (Esc)',
  'workbench.noMatch': 'No sound matches',
  'workbench.noSounds': 'This song has no sounds yet',
  'workbench.nothing': 'Nothing here',

  // A tag on a sound's waveform (shown in capitals).
  'workbench.tagMissing': 'missing',
  'workbench.tagUnreadable': "can't read",
  'workbench.tagUnused': 'not used',
  'workbench.listen': 'Listen',
  'workbench.notInFolder': 'Not in the song folder',
  'workbench.notes': '{n, plural, one {{n} note} other {{n} notes}}',
  // {chart} is a chart's mode and tier (7K HD).
  'workbench.uses': '{chart}: {lane} on lanes, {bgm} in the background',
  'workbench.drawTitle': 'Draw notes with this sound in the open chart',
  'workbench.draw': 'Draw',
  'workbench.renameTitle': "Rename the file, and every chart's reference to it",
  'workbench.rename': 'Rename',
  'workbench.replaceTitle': 'Play another file wherever this sound plays',
  'workbench.replace': 'Replace',

  'workbench.replaceLabel': 'Replace {sound}',
  'workbench.playInstead': 'Play instead of {sound}',
  'workbench.replaceHint':
    'Every note of it in {n, plural, one {{n} chart} other {{n} charts}} will play the file you pick. Undo is one step per chart.',
  'workbench.findFile': 'Find a file',
  'workbench.noOtherFile': 'No other file',
  'workbench.cancel': 'Cancel',

  'newChart.title': 'New chart',
  'newChart.tier': 'Tier',
  'newChart.level': 'Level {level}',
  'newChart.bpm': 'BPM',
  // The song's short name in EZ2PORT's file names (neonparade).
  'newChart.songKey': 'Song key',
  'newChart.copySounds': "Use this song's {n} sounds",
  'newChart.file': 'File: {file}',
  'newChart.inSong': '- already in this song',
  'newChart.cancel': 'Cancel',
  'newChart.create': 'Create',
  'newChart.taken': 'This song already has that chart',
  'newChart.created': 'New chart: {file}',

  'drop.title': 'Drop to import',
  // {song} is the song's folder.
  'drop.images':
    'Images (PNG, JPEG, BMP) are copied into {song} for the disc and the eyecatch. Nothing in the folder is overwritten.',
  'drop.movie':
    'A movie is copied into {song} and becomes the BGA. Nothing in the folder is overwritten.',
  'drop.sounds':
    'Sound files, or folders of them, are copied into {song}. Nothing in the folder is overwritten.',
  'drop.soundsTo':
    'Sound files, or folders of them, are copied into {song} and added to {chart}. Nothing in the folder is overwritten.',

  // Names of undo steps: the status bar shows the last as "last: …".
  'undo.eraseNotes': 'Erase notes',
  'undo.setLength': 'Set length',
  'undo.moveNotes': '{n, plural, one {Move note} other {Move {n} notes}}',
  'undo.chop': 'Chop to grid',
  'undo.cutOnsets': 'Cut at onsets',
  'undo.chartInfo': 'Chart info',

  'cmd.tool.draw': 'Draw tool',
  'cmd.tool.select': 'Select tool',
  'cmd.tool.knife': 'Knife tool (cut stems)',
  'cmd.edit.stepInput': 'Step input (place notes with the cabinet keys)',
  'cmd.notes.hold': 'Long note on/off',
  'cmd.notes.kind': 'Next hold kind',
  'cmd.notes.mirror': 'Mirror keys',
  'cmd.notes.swapSides': 'Swap 1P / 2P',
  'cmd.notes.left': 'Move one lane left',
  'cmd.notes.right': 'Move one lane right',
  'cmd.notes.later': 'Move later by one snap',
  'cmd.notes.earlier': 'Move earlier by one snap',
  'cmd.edit.copy': 'Copy',
  'cmd.edit.cut': 'Cut',
  'cmd.edit.paste': 'Paste at the cursor',
  'cmd.edit.duplicate': 'Duplicate after itself',
  'cmd.timing.bpm': 'Set BPM at the cursor…',
  'cmd.timing.bpmPrompt': 'BPM change here…',
  'cmd.timing.stop': 'Set STOP at the cursor…',
  'cmd.timing.scroll': 'Set scroll speed at the cursor…',
  'cmd.timing.stopPrompt': 'STOP here…',

  'cmd.view.classic': 'Classic mode on / off (key the sound playing there)',
  'cmd.classic.next': 'Classic: next sound to key',
  'cmd.classic.prev': 'Classic: previous sound to key',
  'cmd.classic.resetAll': 'Classic: reset all notes to the background',

  'cmd.view.strips': 'Stem strips shown / hidden',
  'cmd.strip.chop': 'Chop the stem to the grid…',
  'cmd.strip.onsets': 'Cut the stem at its onsets…',
  'cmd.strip.pin': 'Stem strip for the picked sound on / off',
} satisfies Record<string, string>;
