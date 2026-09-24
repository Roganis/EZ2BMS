// The song manager: info, the chart matrix, plate, art, preview, BGA, the wheel preview.

export const song = {
  'song.label': 'Song manager',
  'song.heading': 'Song',
  'song.chartCount': '{n, plural, one {{n} chart} other {{n} charts}}',
  'song.pages': 'Song manager pages',
  'song.tab.charts': 'Charts',
  'song.tab.plate': 'Title plate',
  'song.tab.art': 'Disc & eyecatch',
  'song.tab.preview': 'Preview',
  'song.tab.bga': 'BGA',
  // The song select screen's wheel, as the game shows it.
  'song.tab.wheel': 'Wheel',
  'song.close': 'Close (Esc)',
  'song.charts': 'Charts',
  // {file}: the file name pattern, <mode>1p-<key>[-hd|-shd|-ex].bmson.
  'song.chartsHint':
    'Click a chart to open it, an empty cell to start one there. Charts are saved as {file}, the way EZ2PORT names them.',
  // {disc} and {eyecatch}: the file names disc.abm and eyecatch.abm.
  'song.artHint':
    "Cut here exactly as they are published ({disc}, {eyecatch}). Without a choice, the image a chart's bmson names is used, as EZ2PORT's own importer would. Drop images anywhere on this page to add them.",
  'song.import': 'Import…',
  'song.importFailed': 'Import failed: {error}',
  'song.missing': '{file} (missing)',
  'song.notInFolder': '{file} is not in the song folder.',

  'song.metaChanged': 'Song info changed in {n, plural, one {{n} chart} other {{n} charts}}',
  // The change's name in "… undone, except in 2 charts".
  'song.metaStep': 'Song info',
  'song.tierTaken': '{chart} already exists - move that chart first',
  // An undo step's name (the status bar's "last: …").
  'song.changeTier': 'Change tier',
  'song.cannotMake': "Can't make that chart: {why}",
  'song.noSong': 'no song is open',
  'song.needKey': 'set a song key first (1-15 lowercase letters or digits)',
  'song.unpublishable': '{mode} cannot be published yet',
  'song.chartExists': 'the song already has {mode} {tier}',
  'song.removeFailed': "Can't remove {file}: {error}",
  'song.removed': 'Removed {chart}',
  'song.removedTrash': 'Removed {chart} (its file is in {folder})',
  'song.undo': 'Undo',
  'song.restoreFailed': 'Could not restore {file}: {error}',
  'song.undoAll': 'Undo in all charts',
  // {what}: the change's name, e.g. "Song info".
  'song.undoneExcept':
    '{what} undone, except in {n, plural, one {{n} chart} other {{n} charts}} edited since (undo there with Ctrl+Z)',

  'matrix.copyTo': 'Copy {chart} to…',
  'matrix.moveTo': 'Move {chart} to…',
  'matrix.open': 'Open {file}',
  'matrix.notes': '{n, plural, one {{n} note} other {{n} notes}}',
  'matrix.unsaved': 'unsaved',
  // NM is the tier: EZ2PORT lists a mode's charts only when it has an NM one.
  'matrix.unlistedWhy': "No {mode} NM: EZ2PORT won't list these",
  'matrix.unlisted': 'not listed',
  'matrix.copyTitle': 'Copy into another cell',
  'matrix.copy': 'Copy',
  'matrix.moveTitle': 'Make it another tier',
  'matrix.move': 'Move',
  'matrix.remove': 'Remove from the song',
  'matrix.new': 'New {mode} {tier} chart',
  // In an empty cell, while copying or moving a chart: put it here.
  'matrix.here': 'here',

  'meta.title': 'Title',
  'meta.subtitle': 'Subtitle',
  'meta.subtitleHint': 'a second line on the title plate',
  'meta.artist': 'Artist',
  'meta.genre': 'Genre',
  'meta.bytes': '{n}/32 bytes',
  'meta.differsWhy': 'Saving here makes them equal',
  'meta.differs': 'charts differ',
  // The song's key: its folder's name in the game, not a keyboard key.
  'meta.key': 'Key',
  'meta.keyHint': 'the folder EZ2PORT reads',
  'meta.keyInvalid': '1-15 lowercase letters or digits',

  // A category is a bank of the song wheel; the categories' own names are the game's.
  'category.label': 'Category on the song wheel',
  'category.group.custom': 'The port’s own',
  'category.group.featured': 'Featured',
  'category.group.version': 'Game versions',
  'category.group.level': 'Levels',
  'category.group.alphabet': 'Title A-Z',
  'category.group.other': 'Other',
  'category.default': '{name} (default)',
  // CUSTOM and HOT are categories, named as the game shows them.
  'category.hint': 'Players find the song in this one bank. CUSTOM is one step left of HOT.',
  // {modes}: the modes whose pager skips it (ruby, 5k-only), as a list.
  'category.skipped': 'The {modes} pager skips this bank.',

  'plate.label': 'Title plate',
  // The tint the player mixed from their own colours.
  'plate.tintCustom': 'Custom',
  'plate.actualSize': 'actual size - the title the song wheel and the result screen show',
  // {chars}: the characters the fonts lack; {n}: how many.
  'plate.missing':
    'The fonts have no {chars}: {n, plural, one {it comes} other {they come}} out as a box.',
  'plate.shows': 'What the plate shows',
  'plate.text': 'Text',
  'plate.image': 'Your own image',
  'plate.title': 'Title',
  'plate.titleDiffers': "differs from the song's",
  'plate.subtitle': 'Subtitle',
  'plate.subtitleHint': 'a second, smaller line in grey',
  'plate.subtitleNone': 'none',
  'plate.colour': 'Colour',
  'plate.colourHint': "as the game's plates carry their version",
  'plate.colours': 'Plate colour',
  // The shipped plates' colours; the number is the game version whose plates have it.
  // The custom colour of the letters, and of the glow around them.
  'plate.ink': 'Letters',
  'plate.glow': 'Halo',
  // CJK: the Chinese, Japanese and Korean scripts, which draw some ideographs differently.
  'plate.cjk': 'CJK forms',
  'plate.cjkHint': 'how shared ideographs are drawn',
  'plate.cjkAuto': 'Automatic ({forms})',
  'plate.cjk.kr': 'Korean',
  'plate.cjk.jp': 'Japanese',
  'plate.cjk.sc': 'Chinese (Simplified)',
  'plate.cjk.tc': 'Chinese (Traditional, Taiwan)',
  'plate.cjk.hk': 'Chinese (Traditional, Hong Kong)',
  'plate.textHint':
    "Set as the game's own titles are: right-aligned to column 246 on row 22, capitals nine pixels tall (a title with a subtitle sits higher and smaller), condensed when it would not fit - rendered exactly as EZ2PORT renders its plates.",
  'plate.imageLabel': 'Image',
  'plate.imageHint': 'fit to 256x32; black is see-through',
  'plate.choose': 'Choose an image',
  'plate.imageInfo':
    'A 256x32 image is used as it is; any other size is squeezed to it. Leave the background black: the wheel adds the plate onto its row, so black shows the row through.',
  'plate.failed': 'The title plate: {error}',

  // The disc spins on the song wheel; the eyecatch fills the screen as the song is chosen.
  'art.disc.name': 'Disc',
  'art.disc.what': '{w}x{h} - spins on the song wheel',
  'art.disc.image': 'Disc image',
  'art.disc.crop': 'Disc crop: drag to move, arrow keys to nudge, + and - to zoom',
  'art.disc.off': 'No disc: turned off for this song.',
  'art.disc.empty':
    'No disc yet: the wheel shows a blank one. Choose an image above, or drop one here.',
  'art.disc.missing': 'The disc image {file} is not in the song folder',
  'art.disc.failed': 'The disc: {error}',
  'art.eyecatch.name': 'Eyecatch',
  'art.eyecatch.what': '{w}x{h} - fills the screen when the song is chosen',
  'art.eyecatch.image': 'Eyecatch image',
  'art.eyecatch.crop': 'Eyecatch crop: drag to move, arrow keys to nudge, + and - to zoom',
  'art.eyecatch.off': 'No eyecatch: turned off for this song.',
  'art.eyecatch.empty': 'No eyecatch yet. Choose an image above, or drop one here.',
  'art.eyecatch.missing': 'The eyecatch image {file} is not in the song folder',
  'art.eyecatch.failed': 'The eyecatch: {error}',
  'art.auto': "Automatic - as EZ2PORT's importer",
  'art.none': 'None',
  'art.offscreen': 'Past the right edge of the screen',
  // {field}: the bmson field the image comes from (eyecatch_image, title_image).
  'art.fromCharts': "From the charts' {field}, as EZ2PORT's importer picks it",
  'art.upscaledWidth': 'Upscaled from {w} px across: it will look soft',
  'art.upscaledSize': 'Upscaled from {w}x{h}: it will look soft',
  'art.framing': 'Eyecatch framing',
  'art.visibleTitle': 'Your 4:3 crop fills the screen; the image carries on past its edges',
  'art.visible': 'Screen 4:3',
  'art.stretchTitle': "The whole image squeezed to 1024x512, as EZ2PORT's importer does",
  'art.stretch': 'Whole image',
  'art.reset': 'Reset',
  // The file chooser's title.
  'art.pick': 'Images for the disc and eyecatch',
  'art.imported': 'Imported {n, plural, one {{n} image} other {{n} images}}',
  'art.already': 'Already in the folder',
  // {files}: the files not imported; {error}: why the first was not.
  'art.skipped': 'Skipped {files} ({error})',
  'art.importedSkipped':
    'Imported {n, plural, one {{n} image} other {{n} images}}; skipped {files} ({error})',
  'art.alreadySkipped': 'Already in the folder; skipped {files} ({error})',
  'art.plateMissing': 'The title plate image {file} is not in the song folder',

  // The loop the song wheel plays while the song is highlighted.
  'preview.label': 'Preview',
  'preview.source': 'What the preview is cut from',
  'preview.fromChart': "A chart's mix",
  'preview.fromFile': 'An audio file',
  'preview.chart': 'Chart',
  'preview.file': 'Audio file',
  'preview.mixing': 'Mixing the song…',
  'preview.window': 'Preview window: drag to move, arrow keys to nudge',
  'preview.stop': '■ Stop',
  'preview.play': '▶ Play the loop',
  // {start}: where the loop starts (1:23.45); {length}: how long it is, with its unit.
  'preview.at': 'from {start}, {length}, fades {fade} s',
  'preview.seconds': '{s} s',
  'preview.picked': "EZ2PORT's importer's pick",
  // The length of the fade in and out.
  'preview.fades': 'Fades',
  'preview.reset': 'Reset',
  'preview.hint':
    'The wheel loops this while the song is chosen, restarting it hard at its end, so its fades are part of the file.',
  'preview.hintChart':
    "It is mixed as EZ2PORT plays the chart - every keysound at its velocity and pan - then brought down to a peak of 32000 if it is louder, as the port's own importer does. A click on the song moves the window there; its start keeps to a note unless Alt is held.",
  'preview.importerStart': "EZ2PORT's importer would start at {time}.",

  // BGA: the movie behind the play field.
  'bga.label': 'BGA',
  'bga.which': 'Which movie',
  'bga.none': 'None',
  'bga.noChartMovie': 'No chart names a movie',
  // The movie the charts name.
  'bga.charts': "The charts'",
  'bga.file': 'A movie',
  'bga.movie': 'Movie',
  // {movie}: its file; {chart}: the chart file naming it.
  'bga.fromCharts':
    "{movie}, named by {chart}'s first BGA event - as EZ2PORT's importer would take it.",
  'bga.import': 'Import a movie…',
  'bga.notMovie': '{file} is not a movie: EZ2PORT shows no BGA for it.',
  'bga.reading': 'Reading {file}…',
  'bga.fileLabel': 'File',
  'bga.container': 'Container',
  'bga.video': 'Video',
  'bga.size': 'Size',
  'bga.length': 'Length',
  // No video track in the file.
  'bga.noCodec': 'none found',
  'bga.unknown': 'unknown',
  'bga.cannotPlay': 'EZ2PORT will not play it: {reason}',
  'bga.plays': "EZ2PORT's Windows build plays it.",
  'bga.start': 'Frame 0 at (chart ms)',
  'bga.eventTitle': "The chart's first BGA event, as the importer times it",
  'bga.event': "The chart's event",
  'bga.atZero': 'At 0',
  'bga.atCursor': 'At the cursor',
  // {file}: the name bga, which the copy is given.
  'bga.hint':
    'EZ2PORT draws the movie behind the play field, stretched to 640x480, from its frame 0 at the start above; it is black before that and after the movie ends - it never loops - and its sound is not played. It is copied into the package as {file} plus its extension.',
  'bga.cannotShow':
    'This webview cannot show this movie. What EZ2PORT can play is its own decoder’s call, above.',
  'bga.before': 'black: the movie starts at {time}',
  'bga.after': 'black: the movie has ended',
  'bga.noBga': 'no BGA',
  'bga.stop': 'Stop',
  'bga.play': 'Play from here',
  'bga.position': 'Song position',
  // The file chooser's title.
  'bga.pick': 'A movie for the BGA',
  'bga.imported': 'Imported {n, plural, one {{n} movie} other {{n} movies}}',
  'bga.skipped': 'Skipped {files} ({error})',

  // The song select screen, as EZ2PORT shows it: the wheel of songs, and the eyecatch after.
  'wheel.label': 'Song select preview',
  'wheel.screen': 'Song select',
  'wheel.screens': 'Screen',
  'wheel.select': 'Song select',
  'wheel.eyecatch': 'Eyecatch',
  // {mode}: the mode's name (e.g. 7 KEY); the tier buttons follow.
  'wheel.modeTier': '{mode} · tier',
  'wheel.noChartTier': 'No chart · tier',
  'wheel.tier': 'Tier',
  'wheel.noTier': 'No {tier} chart in this mode',
  'wheel.previous': '▲ Previous',
  'wheel.next': 'Next ▼',
  'wheel.alone': 'Alone in its category (the rail repeats it)',
  'wheel.sound': 'Play the preview when the wheel stops',
  'wheel.replay': 'Replay the fade',
  'wheel.exit':
    "The song select's exit: the eyecatch at its own size from the top left - a 1024x512 picture shows its top-left 640x480 - under the stage mask and plate, faded in from black.",
  // {missing}: "This song has no eyecatch" (wheel.noEyecatch), in bold.
  'wheel.noEyecatchThen': '{missing}: the screen stays black under the plate.',
  'wheel.noEyecatch': 'This song has no eyecatch',
  // {turn}, {tiers}, {eyecatch}: the keys (↑↓, 1–4, E).
  'wheel.keys':
    'Click the screen, then {turn} to turn the wheel, {tiers} for the tier, {eyecatch} for the eyecatch. The preview starts after the wheel stands still for half a second, as the game waits.',
  'wheel.neon':
    "Neon stand-ins: set your game folder (the EZ2PORT tab) to see your song select's own masks.",
  'wheel.reading': "Reading your game's song select art…",
  'wheel.gameArt': "Drawn with your game's song select masks.",
  'wheel.partial': 'Your game folder has no {files}: neon stand-ins take their place.',
  'wheel.notDrawn': 'The animated backdrop and frame are not drawn yet.',
  'wheel.noDisc': 'No disc: EZ2PORT shows the masks alone at the focus.',
  // {folder}: the game's folder system\discsmall.
  'wheel.thumb':
    "While it flies along the arc a package's disc shows no picture: EZ2PORT looks for that thumbnail in the game's {folder}, never in the package.",
} satisfies Record<string, string>;
