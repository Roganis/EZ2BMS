// Publishing to EZ2PORT and testing in it: the Publish dialog, the EZ2PORT panel, the run log.

export const port = {
  // The dialog's name, for screen readers.
  'publish.label': 'Publish',
  'publish.heading': 'Publish to EZ2PORT',
  'publish.noSong': 'no song is open',
  // The title of the system's folder picker.
  'publish.pickRoot': 'Where EZ2PORT keeps its songs',
  'publish.noRoot': 'Choose the folder EZ2PORT keeps its songs in (its {dir}).',
  'publish.chooseRoot': 'Choose the songs folder…',
  'publish.errors': '{n, plural, one {{n} problem} other {{n} problems}} to fix first',
  'publish.showIssues': 'Show them in Issues',
  'publish.preparing':
    'Rendering the title plate and art, compiling every chart, reading what is in the songs folder…',
  'publish.cancel': 'Cancel',
  'publish.close': 'Close',
  'publish.done': 'Done',
  'publish.go': 'Publish',
  'publish.goOver': 'Publish over it',

  // Whose package is in the songs folder under this key now: a badge by the destination
  // (owner), and a line on what publishing does to it (note).
  'publish.owner.new': 'New',
  'publish.owner.ours': 'Update',
  'publish.owner.legacy': 'Earlier EZ2BMS package',
  'publish.owner.foreign': "Another song's package",
  'publish.owner.shipped': 'Shipped key',
  'publish.note.new': 'There is no package with this key yet.',
  'publish.note.ours': "This song's earlier publish is replaced (kept in .ez2bms-backup).",
  'publish.note.legacy': 'A package from an earlier EZ2BMS, with no song id: it may be this song.',
  'publish.note.foreign':
    'Another tool or song made this folder. Replacing it keeps a copy in .ez2bms-backup.',
  'publish.shipped':
    '"{key}" is the key of a song the game ships: EZ2PORT would play this package in its place everywhere. Choose another key.',
  // {folder} is the package's folder name, {key} the song key to type.
  'publish.confirmForeign': "{folder} is another song's package. Type {key} to replace it:",
  'publish.confirmLegacy': 'Replace it with this song',
  'publish.blockedForeign': "Type {key} to replace another song's package",
  'publish.blockedLegacy': 'Confirm replacing the earlier EZ2BMS package',
  'publish.warnings':
    '{n, plural, one {{n} warning} other {{n} warnings}}: it publishes, but look first',

  'publish.charts': 'Charts',
  'publish.col.chart': 'Chart',
  'publish.col.level': 'Level',
  'publish.col.file': 'File',
  // What becomes of the chart's high scores in EZ2PORT.
  'publish.col.scores': 'Scores',
  'publish.scores.kept': 'kept',
  'publish.scores.reset': 'reset (changed)',
  // {size} is in megabytes, one decimal.
  'publish.keysounds':
    '{n, plural, one {{n} keysound} other {{n} keysounds}}, about {size} MB of 16-bit audio',

  // The game's song select wheel; the title plate, disc and eyecatch are the song's pictures there.
  'publish.wheel': 'On the wheel',
  'publish.noDisc': 'no disc',
  'publish.noEyecatch': 'no eyecatch',
  // The song's preview on the wheel: {from} is minutes:seconds, {length} seconds.
  'publish.preview': 'Preview {from} + {length} s',
  'publish.previewOf': 'Preview {from} + {length} s of {file}',
  'publish.previewPlay': 'Play',
  'publish.previewStop': 'Stop',
  'publish.noPreview': 'No preview: the wheel is silent for this song',
  // {src} is the movie in the song folder, {file} its name in the package, {from} minutes:seconds.
  'publish.bga': 'BGA {src} as {file} from {from}',
  'publish.noBga': 'No BGA',

  'publish.writing':
    'Cutting {n, plural, one {{n} keysound} other {{n} keysounds}} and writing the package…',
  // {dir} is where the package was written; {kept} and {reset} count ranking tables (a
  // chart's high scores in EZ2PORT), kept or cleared.
  'publish.written': 'Published {key}: {files} files in {dir}',
  'publish.writtenKept':
    'Published {key}: {files} files in {dir} (kept {kept, plural, one {{kept} ranking table} other {{kept} ranking tables}})',
  'publish.writtenReset':
    'Published {key}: {files} files in {dir} (reset {reset} for changed charts)',
  'publish.writtenKeptReset':
    'Published {key}: {files} files in {dir} (kept {kept, plural, one {{kept} ranking table} other {{kept} ranking tables}}, reset {reset} for changed charts)',
  'publish.missing':
    '{n, plural, one {{n} keysound source} other {{n} keysound sources}} could not be read: {files}',
  'publish.retire': 'This song is still in the songs folder as "{key}" too.',
  'publish.retireButton': 'Remove that copy',
  'publish.retired': 'Removed {key} (kept in .ez2bms-backup)',
  'publish.failed': 'Publish failed: {error}',

  'port.web':
    'The browser preview cannot run EZ2PORT or write to your songs folder. Use the desktop app.',
  // "sound" and "system" are the names of folders in the game's data: keep them as written.
  'port.gameRoot': 'Game folder (with sound and system)',
  // EZ2PORT's player program, by its file name: keep it as written.
  'port.ez2play': 'ez2play',
  'port.exe': 'Unpacked executable (optional)',
  'port.songsRoot': 'Publish into',
  'port.notSet': 'not set',
  'port.notFound': 'not found',
  'port.exeAuto': 'let EZ2PORT find it',
  'port.choose': 'Choose…',
  // Titles of the system's file and folder pickers.
  'port.pickGame': 'Your EZ2AC data folder',
  'port.pickEz2play': "EZ2PORT's ez2play",
  'port.pickExe': 'Your unpacked EZ2AC executable',
  'port.pickSongs': 'EZ2PORT songs folder',

  'port.playfield': 'Play field',
  'port.gameSkin': "Draw with the game's own panel",

  'port.cache.heading': 'Long sounds',
  'port.cache.hint':
    'Sounds of 20 s and more (stems) are kept decoded on disk, so a song opens and publishes without decoding them again.',
  'port.cache.cap': 'Disk to use (MB, 0 = off)',
  'port.cache.clear': 'Clear',
  'port.cache.web': 'Not in the browser preview.',
  'port.cache.info': '{n, plural, one {{n} sound} other {{n} sounds}}, {used} MB of {cap} MB',

  // What the chosen ez2play build can do, as it reports itself.
  'port.probe.heading': 'This ez2play',
  'port.probe.options': '{n, plural, one {{n} option} other {{n} options}}',
  // {commit} is the source version EZ2PORT was built from.
  'port.probe.optionsSource': '{n, plural, one {{n} option} other {{n} options}} · source {commit}',
  'port.cap.songsRoot': 'Private songs folder',
  'port.cap.logFile': 'Log file',
  'port.cap.start': 'Test from the cursor (--start)',
  // READY is the game's screen before a song starts.
  'port.cap.skipReady': 'Skip READY (--no-ready)',
  'port.cap.viewer': 'One window, reused (--viewer)',
  'port.cap.result': 'Result back to EZ2BMS (--result)',
  // After a feature this ez2play lacks: asked of EZ2PORT's developers.
  'port.cap.requested': 'requested from EZ2PORT',

  // A heading over the buttons that test and publish.
  'port.go': 'Go',
  'port.test': 'Test',
  // Test with the game playing the chart itself.
  'port.auto': 'Auto',
  'port.publish': 'Publish song',

  // The panel as the game draws it (skin/game.ts), or EZ2BMS's own neon drawing.
  'skin.noRoot': 'No game folder set',
  'skin.off': 'Off - drawing the neon skin',
  'skin.loading': 'Reading the panel…',
  // {file} is the panel's file, {dir} the folder it should be in.
  'skin.noPanel': 'no {file} in {dir}',
  'skin.failed': '{error} - drawing the neon skin',
  'skin.missing': '{n, plural, one {{n} texture not found} other {{n} textures not found}}',
  // A heading over the textures the panel names that the game folder lacks.
  'skin.notFound': 'Not found',
  'skin.reload': 'Reload the panel',

  'run.label': 'EZ2PORT log',
  // In the log's header while a test runs.
  'run.running': 'running',
  'run.stop': 'Stop',
  'run.clear': 'Clear',
  'run.hide': 'Hide',
  // How the last test run ended, as the back end names it; "usage" is a command line EZ2PORT rejected.
  'run.outcome':
    '{outcome, select, finished {finished} failed {failed} usage {usage} skipped {skipped} killed {killed} other {{outcome}}}',
  'run.finished': 'EZ2PORT closed normally.',
  'run.usage':
    'EZ2PORT did not understand the command line (exit 2): this build may be older or newer than EZ2BMS expects.',
  'run.skipped': 'EZ2PORT could not find the game data it needs (exit 77).',
  'run.ended': 'EZ2PORT ended: {outcome}.',
  'run.endedCode': 'EZ2PORT ended: {outcome} (exit {code}).',
  // {chart} is the chart's mode and difficulty, {speed} the scroll speed in percent.
  'run.testing':
    '{auto, select, true {Testing {chart} in EZ2PORT (autoplay) at {speed}%} other {Testing {chart} in EZ2PORT at {speed}%}}',
  'run.testingFromCursor':
    '{auto, select, true {Testing {chart} in EZ2PORT (autoplay) at {speed}% from the cursor} other {Testing {chart} in EZ2PORT at {speed}% from the cursor}}',
  'run.testingFromStart':
    '{auto, select, true {Testing {chart} in EZ2PORT (autoplay) at {speed}% from the start - this ez2play has no --start yet} other {Testing {chart} in EZ2PORT at {speed}% from the start - this ez2play has no --start yet}}',
  'run.errors':
    '{n, plural, one {{n} problem} other {{n} problems}} in {chart} to fix first (see Issues)',
  'run.noGame': 'Set your game folder (and ez2play) in the EZ2PORT tab first',

  // {fix} is the fix's own name, as the Issues tab shows it.
  'fix.done': '{fix}: done (Ctrl+Z undoes it)',
  'fix.doneAll': '{fix}: done in {n, plural, one {{n} chart} other {{n} charts}}',
  'fix.key': 'The song key is now "{key}"',

  'cmd.port.publish': 'Publish to EZ2PORT',
  'cmd.port.test': 'Test in EZ2PORT',
  'cmd.port.testAuto': 'Watch in EZ2PORT (autoplay)',
  'cmd.port.stop': 'Stop the EZ2PORT test',
  'cmd.view.port': 'EZ2PORT settings',
  'cmd.view.issues': 'Issues (pre-flight check)',
  'cmd.view.log': 'EZ2PORT log',
} satisfies Record<string, string>;
