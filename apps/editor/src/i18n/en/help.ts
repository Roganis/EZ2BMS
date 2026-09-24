// About, updates, preferences, and what the app says when something goes wrong.

export const help = {
  'about.label': 'About EZ2BMS',
  'about.lead': 'An arcade-native chart editor for EZ2PORT and EZ2AC cabinets.',
  'about.version': 'Version',
  'about.system': 'System',
  'about.settings': 'Settings',
  'about.cache': 'Cache',
  'about.log': 'Log',
  'about.crashed':
    'The last run ({version}, started {when}) closed without shutting down. Its last lines are in the log; the autosave kept unsaved charts.',
  'about.errors': '{n, plural, one {# error} other {# errors}} this run, the last: {last}',
  'about.noKey': 'This build cannot update itself (it was built without the update key).',
  'about.checkNow': 'Check now',
  'about.logHint':
    "The log stays on this computer. To report a problem, copy a report (the version, this run's errors and the end of the log) and paste it into your message.",
  'about.openLogs': 'Open the log folder',
  'about.copyReport': 'Copy a report',
  'about.close': 'Close',
  'about.legal':
    'GPL-3.0. Uses SDL 3 (zlib licence) to read game controllers, as EZ2PORT does. Nothing of the game ships with EZ2BMS: it reads your own files.',
  'about.logsFailed': 'Could not open the log folder: {error}',

  'diag.crashed': 'EZ2BMS closed unexpectedly last time. The log may say why.',
  'diag.details': 'Details',
  'diag.failed': 'Something went wrong: {message}. The log has the details (About EZ2BMS).',
  'diag.copied': 'Copied a report: paste it into a bug report or a message',

  'update.label': 'Update',
  'update.title': 'EZ2BMS {version}',
  'update.youHave': 'You have {current}.',
  'update.published': 'Published {date}.',
  'update.package':
    'This EZ2BMS came as a Linux package, which your package manager updates: download the new version from its release page.',
  'update.openReleases': 'Open the release page',
  'update.installed': 'Installed: starting again…',
  'update.downloadingOf': 'Downloading {done} of {total} MB…',
  'update.downloading': 'Downloading…',
  'update.saveFirst': 'Save your charts first: installing restarts EZ2BMS.',
  'update.install': 'Install and restart',
  'update.skip': 'Skip this version',
  'update.later': 'Later',
  'update.upToDate': 'EZ2BMS is up to date',
  'update.out': 'EZ2BMS {version} is out (you have {current}).',
  'update.whatsNew': "What's new",
  'update.checkFailed': 'Could not look for updates: {error}',
  'update.saveFirstToast': 'Save your charts first: installing restarts EZ2BMS',

  'cmd.help.about': 'About EZ2BMS',
  'cmd.help.updates': 'Check for updates',
  'cmd.help.report': 'Copy a problem report (version, errors, the end of the log)',
  'cmd.help.logs': 'Open the log folder',
  'cmd.app.preferences': 'Preferences (language, updates)',

  'prefs.label': 'Preferences',
  'prefs.language': 'Language',
  'prefs.languageAuto': 'As the system ({name})',
  'prefs.languageHint':
    'Korean and Japanese are first translations, drafted by an AI: corrections are welcome.',
  'prefs.updates': 'Look for a new version at start (once a day)',
  'prefs.close': 'Close',
} satisfies Record<string, string>;
