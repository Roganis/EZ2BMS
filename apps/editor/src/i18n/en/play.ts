// Playing and recording: test play, the result card, record mode, controls and timing calibration.

export const play = {
  // The run's kind, over the field and on the result card, in the cabinet's capitals.
  'play.kindAuto': 'AUTO PLAY',
  'play.kindTest': 'TEST PLAY',
  'play.bgmMuted': 'Background muted',
  'play.bgmOn': 'Background on',
  'play.soloOff': 'Solo off',
  // {lane} is the lane's short name (1…10, TT, PD, E1).
  'play.solo': 'Solo: lane {lane}',

  'hud.gauge': 'Gauge {value}',
  // Under the judgement (not after KOOL): the press came early or late.
  'hud.fast': 'FAST',
  'hud.slow': 'SLOW',

  'result.label': 'Result',
  'result.untitled': 'Untitled',
  // Under the song title: the chart (7 KEY HD) and its level.
  'result.chart': '{chart} · level {level}',
  // {rate} is a percentage (99.50). STOPPED: the run was ended before the chart did.
  'result.rate': '{rate}% · {state, select, failed {FAILED} stopped {STOPPED} other {CLEAR}}',
  'result.partial': 'graded on the {n} notes played',
  'result.maxCombo': 'MAX COMBO',
  'result.notes': 'NOTES',
  'result.gauge': 'GAUGE',
  'result.retry': 'Retry',
  'result.close': 'Close',

  'record.starting': 'Recording from the cursor…',
  // REC: the recording light, as on a recorder.
  'record.live': 'REC · {n, plural, one {{n} press} other {{n} presses}}',
  // R and Esc are keys.
  'record.stopHint': 'R or Esc stops',
  // One recording, as a take in a studio.
  'record.take': 'Take',
  'record.notes': '{n, plural, one {{n} note} other {{n} notes}}',
  // Classic mode: a press keys the background sound playing there.
  'record.classic': 'Classic: keys what plays',
  'record.ok': '{n} to place',
  'record.clash': '{n} on notes already there',
  // Classic mode: presses where no background sound plays.
  'record.silent': '{n} with nothing to key',
  'record.statsTitle': 'How the presses sat against the grid (after the input offset)',
  // {mean} and {median} are signed (+1.5, -3.0).
  'record.stats': 'mean {mean} ms · median {median} ms · {early} early · {late} late',
  // {field} is the number box.
  'record.holdsFrom': 'Holds from {field} ms',
  'record.grid': 'Grid',
  'record.exact': 'EZ2 exact',
  'record.exactTitle': "EZ2's own grid: 1/48 beat",
  // {field} is the number box.
  'record.countIn': 'Count-in {field} beats',
  'record.metronome': 'metronome',
  'record.muteLanes': 'mute the lanes while recording',
  'record.keep': 'Keep',
  'record.retake': 'Retake',
  'record.discard': 'Discard',
  'record.noBrush': 'Pick a sound to record with first (or turn Classic mode on)',
  'record.nothing': 'Nothing was recorded',
  // Each `{x, plural, =0 {} …}` adds its part only when there is one.
  'record.kept':
    'Take kept: {placed, plural, one {{placed} note} other {{placed} notes}}{clash, plural, =0 {} other {, {clash} on notes already there}}{silent, plural, =0 {} other {, {silent} with nothing to key}}{refused, plural, =0 {} other {, {refused} that would have changed the sound}}{shortened, plural, =0 {} one {, {shortened} hold made taps} other {, {shortened} holds made taps}}',
  'record.discarded': 'Take discarded',
  // An undo step's name (the status bar's "last: …").
  'record.undoStep': 'Record take',

  'controls.title': 'Controls and timing',
  'controls.bindings': 'Bindings',
  'controls.controllers': 'Controllers',
  'controls.timing': 'Timing',
  // {plus} is the + button; {file} is keys.ini.
  'controls.hint':
    "Four bindings a channel, keys or controller buttons and hats: {plus} and press one. They are EZ2BMS's own; EZ2PORT's {file} is only read.",
  'controls.laneTitle': "Where it plays in this chart's mode",
  // In the lane column: ScratchMix's turntable strums the frets held.
  'controls.strum': 'strum',
  // In the lane column: a turntable is bound to a controller's axis.
  'controls.axis': 'axis',
  'controls.remove': 'Remove',
  'controls.bindTitle': 'Bind by pressing',
  'controls.pressKey': 'Press a key or button…',
  'controls.bindAxisTitle': 'Bind an axis by turning it',
  // The turntable: turn it to bind its axis.
  'controls.turnIt': 'Turn it…',
  // The turntable's axis, read the other way round.
  'controls.reversed': 'reversed',
  // The turntable's axis, read as how fast it turns rather than where it is.
  'controls.velocity': 'speed, not position',
  'controls.padError': 'Controllers are unavailable: {error}',
  'controls.noPads': 'No controller found. Plug one in: it shows here as soon as it is seen.',
  'controls.padShape':
    '{buttons, plural, one {{buttons} button} other {{buttons} buttons}} · {axes, plural, one {{axes} axis} other {{axes} axes}} · {hats, plural, one {{hats} hat} other {{hats} hats}}',
  // The buttons held now: {list} is like "b0 b3", or "-".
  'controls.readout': 'buttons: {list}',
  // {field} is the number box.
  'controls.debounce': 'Debounce {field} ms',
  'controls.defaults': 'EZ2PORT defaults',
  'controls.import': 'Import from EZ2PORT',
  'controls.copy': 'Copy as keys.ini',
  'controls.done': 'Done',
  // {token} is a binding (Z, 0810:e501/b3).
  'controls.already': '{token} is bound there already',
  'controls.full': 'A channel takes {n} bindings; remove one first',
  'controls.defaultsSet': "EZ2PORT's default bindings",
  'controls.noPortKeys': "No keys.ini of EZ2PORT's found (its data folder, or its settings folder)",
  'controls.imported': 'Bindings from {path}',
  'controls.copied': "Copied as keys.ini - paste it into EZ2PORT's keys.ini",
  'controls.noClipboard': 'The clipboard is not available here',

  'calib.hint':
    'How late EZ2BMS hears, shows and takes presses on this machine. EZ2PORT has no offsets: these are for playing and recording in the editor only.',
  'calib.sound': 'Sound test',
  'calib.soundHint':
    'Tap any of your keys or buttons on each click (20, the first 4 to find the beat). Sets the input offset.',
  'calib.picture': 'Picture test',
  'calib.pictureHint':
    'Tap on each flash (silent). Sets the picture offset; run the sound test first.',
  'calib.start': 'Start',
  'calib.taps': '{n, plural, one {{n} tap} other {{n} taps}}',
  'calib.stop': 'Stop',
  // {offset} is calib.offset, in bold.
  'calib.land': 'Taps land {offset}',
  'calib.offset': '{ms} ms {dir, select, early {early} other {late}}',
  // {spread}: how far apart the taps were.
  'calib.detail': '({used} taps, spread {spread} ms)',
  'calib.detailDropped': '({used} taps, spread {spread} ms, {dropped} left out)',
  'calib.use': 'Use as the {kind, select, sound {input} other {picture}} offset',
  'calib.failed':
    'Too few taps on the beat to tell. Try again, tapping on every {kind, select, sound {click} other {flash}}.',
  'calib.audioOffset': 'Audio offset (ms)',
  'calib.pictureOffset': 'Picture offset (ms)',
  'calib.inputOffset': 'Input offset (ms)',

  'cmd.play.toggle': 'Play / stop from the cursor',
  'cmd.play.test': 'Test play from the cursor (your keys, judged like EZ2PORT)',
  'cmd.play.record':
    'Record: play along from the cursor, then keep the take (R again stops, or retakes)',
  'cmd.input.controls': 'Controls and timing… (keys, controllers, offsets)',
  'cmd.play.again': 'Play again from where playback last started',
  'cmd.audio.muteBgm': 'Mute / unmute background sounds',
  'cmd.audio.solo': 'Solo the lane under the pointer (again to clear)',
} satisfies Record<string, string>;
