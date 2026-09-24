// The editor in Japanese. Typed against the English: a key English does not
// have is an error; one not translated yet falls back to English.
// Drafted by an AI, for a native speaker to review (AI-DISCLOSURE.md).

import type { MessageKey } from '../en';

export const ja: Partial<Record<MessageKey, string>> = {
  'cmd.app.preferences': '環境設定（言語、アップデート）',
  'cmd.help.about': 'EZ2BMS について',
  'prefs.label': '環境設定',
  'prefs.language': '言語',
  'prefs.languageAuto': 'システムに合わせる（{name}）',
  'prefs.languageHint': '日本語訳は AI による下訳です。誤りがあればお知らせください。',
  'prefs.updates': '起動時に新しいバージョンを確認する（1日1回）',
  'prefs.close': '閉じる',
};
