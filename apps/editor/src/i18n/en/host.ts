// What the desktop host refuses, said in the editor's language
// (bridge/hosterror.ts; the kinds are src-tauri/src/error.rs's). The OS's
// own error text and decoders' details arrive as they are, in `{error}` and
// `{detail}`.

export const host = {
  'host.not-ez2play': "{path} is not EZ2PORT's ez2play (none of its options are in it)",
  'host.changed': '{path} changed since it was checked: look again',
  // {path}: a file in the game folder, e.g. sound/alpha/streetmix1p-alpha.ez
  'host.stale': '{path} is not what it was when the export was planned: plan it again',
  'host.not-empty': '{path} is not empty',
  'host.not-a-folder': '{path} is not a folder',
  // {name}: a backup's date and time, e.g. 20260924-101500
  'host.no-backup': 'No backup named {name}',
  'host.backup-exists': 'A backup named {name} is already there',
  'host.exists': '{path} already exists',
  'host.not-a-file': '{path} is not a file',
  'host.cannot-decode': 'Cannot decode: {detail}',
  'host.audio-device': 'Audio device: {detail}',
  'host.not-an-image': 'Not an image EZ2BMS can read (PNG, JPEG or BMP): {detail}',
  'host.not-an-image-file': '{path}: not an image EZ2BMS can read (PNG, JPEG or BMP): {detail}',
  'host.image-too-large': '{w}x{h} is too large (at most {max} pixels a side)',
  'host.font-unreadable': 'Cannot read the font {path}: {error}',
  'host.not-a-font': '{path} is not a font EZ2BMS can use',
  'host.no-cjk-font':
    'The text needs a CJK font, and none is installed (run scripts/fetch-fonts.mjs)',
  'host.no-update': 'No update to install: look for one first',
} satisfies Record<string, string>;
