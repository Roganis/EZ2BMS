// The editor in Korean. Typed against the English: a key English does not
// have is an error; one not translated yet falls back to English.
// Drafted by an AI, for a native speaker to review (AI-DISCLOSURE.md).

import type { MessageKey } from '../en';

export const ko: Partial<Record<MessageKey, string>> = {
  'cmd.app.preferences': '환경 설정 (언어, 업데이트)',
  'cmd.help.about': 'EZ2BMS 정보',
  'prefs.label': '환경 설정',
  'prefs.language': '언어',
  'prefs.languageAuto': '시스템 설정 따름 ({name})',
  'prefs.languageHint': '한국어 번역은 AI가 작성한 초안입니다. 고칠 곳을 알려 주세요.',
  'prefs.updates': '시작할 때 새 버전 확인 (하루 한 번)',
  'prefs.close': '닫기',
};
