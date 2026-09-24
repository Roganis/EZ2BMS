// Japanese: see en/help.ts. Terms follow docs/i18n-glossary.md.

import type { help as en } from '../en/help';

export const help: Partial<Record<keyof typeof en, string>> = {
  'cmd.app.preferences': '環境設定（言語、アップデート）',
  'cmd.help.about': 'EZ2BMS について',
  'prefs.label': '環境設定',
  'prefs.language': '言語',
  'prefs.languageAuto': 'システムに合わせる（{name}）',
  'prefs.languageHint': '日本語訳は AI による下訳です。誤りがあればお知らせください。',
  'prefs.updates': '起動時に新しいバージョンを確認する（1日1回）',
  'prefs.close': '閉じる',
};
