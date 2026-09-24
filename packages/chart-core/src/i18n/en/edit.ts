// Editing: why an edit was refused (placing, Classic, slicing, renaming a
// sound), undo steps' names, and the names and descriptions the editor shows
// (hold kinds, judgement and gauge presets).
//
// A reason is said inside the editor's own sentence ("Can't key that:
// {reason}"), so it starts in lower case and has no full stop. "Keying" a
// sound puts it on a lane, where a press plays it; the background plays by
// itself. A "slice" is the part of a sound a note plays; a "cut" is where one
// slice ends and the next begins. Classic is the name of a mode of the editor.

export const edit = {
  // Why a note cannot go where it was put.
  'edit.place.before-start': 'before the start of the chart',
  'edit.place.taken': 'a note is already there',
  'edit.place.in-hold': 'inside a hold',
  'edit.place.covers': 'the hold would cover another note',
  // Another edit (or an undo) removed the note first.
  'edit.note-gone': 'that note is gone',

  // Classic mode: the music is already complete in the background, and
  // charting moves what is sounding onto lanes without changing what plays.
  // {src}: a sound file's name, e.g. stem_pad.wav
  'classic.changes-sound': 'it would change how {src} sounds',
  'classic.no-lane': 'pick a lane to key onto',
  'classic.lane-taken': 'a lane is taken there',
  'classic.sound-starts': 'that is where a sound starts - Classic mode never removes one',
  'classic.nothing-to-split': 'nothing to split there',
  'classic.heal-background': 'only a split in the background can be healed',

  // Slicing a long sound (a stem) into keysounds. {src}: a sound file's name.
  'slice.nothing-to-cut': 'nothing to cut there',
  'slice.already-cut': 'it is already cut there',
  'slice.not-playing': '{src} is not playing there',
  'slice.sound-starts': 'that is where the sound starts - only cuts move',
  'slice.between-cuts': 'a cut stays between the cuts either side of it',
  'slice.lane-taken': 'the lane is taken there',
  // Cutting a stem where a MIDI file of the song has notes; the MIDI's time 0
  // is the stem's first hit.
  'slice.midi.no-hit': '{src} has no hit in this chart to start the MIDI from',
  'slice.midi.no-notes': 'the tracks chosen have no notes',
  'slice.midi.not-playing': "{src} is not playing where the MIDI's notes are",

  // Renaming a sound file in the song folder. {file}: a file's name.
  'sound.rename.missing': '{file} is not in the song folder',
  'sound.rename.empty': 'the name is empty',
  // {name}: the new name typed
  'sound.rename.windows': '"{name}" is not a file name Windows accepts',
  // {ext}: the file's extension, e.g. .wav
  'sound.rename.extension': "keep the {ext} extension (the file's format does not change)",
  'sound.rename.same': 'that is its name already',
  'sound.rename.taken': '{file} is already in the folder',
  'sound.rename.same-stem': '{file} has the same name before the extension',

  // An undo step's name: the status bar's "last: …" and the undo toast. A
  // short command, as on a menu.
  'undo.place-note': 'Place note',
  'undo.erase-notes': '{n, plural, =1 {Erase note} other {Erase {n} notes}}',
  'undo.move-notes': 'Move notes',
  'undo.shift-lanes': 'Shift lanes',
  'undo.to-background': 'Move to background',
  'undo.to-lane': 'Move to lane',
  // A note's length: how long a hold is.
  'undo.set-length': 'Set length',
  'undo.make-holds': 'Make holds',
  'undo.make-taps': 'Make taps',
  'undo.hold-kind': 'Set hold kind',
  'undo.vel-pan': 'Set velocity/pan',
  // Mirroring the keys: 1 and 5 swap, 2 and 4.
  'undo.mirror': 'Mirror',
  // 1P's notes to 2P's lanes and back.
  'undo.swap-sides': 'Swap sides',
  'undo.bpm.set': 'Set BPM',
  'undo.bpm.remove': 'Remove BPM change',
  // STOP: a pause in the scroll, a BMS event's name.
  'undo.stop.set': 'Set STOP',
  'undo.stop.remove': 'Remove STOP',
  'undo.scroll.set': 'Set scroll change',
  'undo.scroll.remove': 'Remove scroll change',
  'undo.add-sound': 'Add sound',
  'undo.add-sounds': '{n, plural, one {Add {n} sound} other {Add {n} sounds}}',
  'undo.remove-sound': 'Remove sound',
  'undo.rename-sound': 'Rename sound',
  // Pointing sounds at another file.
  'undo.replace-sound': 'Replace sound',
  'undo.remove-unused':
    '{n, plural, one {Remove {n} unused sound} other {Remove {n} unused sounds}}',
  // Giving notes another sound.
  'undo.change-sound': 'Change sound',
  'undo.paste': 'Paste',
  'undo.record-take': 'Record take',
  'undo.key-sound': 'Key sound',
  'undo.move-keyed': 'Move keyed notes',
  'undo.unkey': '{n, plural, =1 {Un-key note} other {Un-key notes}}',
  'undo.split-sound': 'Split sound',
  'undo.heal-split': 'Heal split',
  'undo.reset-background': 'Reset all to background',
  'undo.cut-stem': 'Cut stem',
  'undo.move-cut': 'Move cut',
  'undo.slice-to-background': '{n, plural, =1 {Slice to background} other {Slices to background}}',
  'undo.key-slice': '{n, plural, =1 {Key slice} other {Key slices}}',
  'undo.chop': 'Chop to grid',
  'undo.midi-tempo': 'Tempo from MIDI',
  'undo.midi-cuts': 'Cut stem at MIDI notes',

  // Hold kinds (0-12): what a hold of the kind pays while it is held, shown
  // after its number ("4: once, after the end…"). KOOL is a judgement's name.
  'hold.kind.0': 'every 1/4 beat (default)',
  'hold.kind.1': 'every 1/2 beat',
  'hold.kind.2': 'every 1/8 beat',
  'hold.kind.3': 'every 1/16 beat',
  // "Counted as 1/32s": the engine counts the hold in 1/32 beats but pays it
  // once, so a perfect play falls short of 100%.
  'hold.kind.4': 'once, after the end (counted as 1/32s: never 100%)',
  'hold.kind.5': 'once, after the end (counted as 1/4s: never 100%)',
  'hold.kind.6': 'once at the end, if still KOOL',
  // Kinds 7 and 8.
  'hold.kind.7': 'nothing while held',
  // Kinds 9-12: the hold's first note does not count towards the score.
  'hold.kind.9': 'nothing; the head is not counted',

  // Judgement presets in Chart info. The numbers are the KOOL, COOL, GOOD
  // and MISS windows as a chart's .ini stores them: keep them as they are.
  'edit.judge.shipped': 'Shipped (9/27/53/73)',
  'edit.judge.missing': 'Engine default (6/24/36/72)',
  'edit.judge.override': 'Common override (6/24/50/70)',
  'edit.judge.lenient': 'Lenient (7/30/50/80)',
  // Gauge presets: how much the life gauge gains and loses per judgement.
  'edit.life.default': 'Default',
  'edit.life.forgiving': 'Forgiving',
  'edit.life.recovery': 'Fast recovery',
} satisfies Record<string, string>;
