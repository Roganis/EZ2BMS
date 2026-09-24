// Korean: see en/help.ts. Terms follow docs/i18n-glossary.md.

import type { help as en } from '../en/help';

export const help: Record<keyof typeof en, string> = {
  'about.label': 'EZ2BMS 정보',
  'about.lead': 'EZ2PORT와 EZ2AC 기체를 위한, 아케이드에 맞춘 채보 에디터입니다.',
  'about.version': '버전',
  'about.system': '시스템',
  'about.settings': '설정',
  'about.cache': '캐시',
  'about.log': '로그',
  'about.crashed':
    '지난 실행({version}, {when} 시작)이 정상적으로 종료되지 않았습니다. 마지막 기록은 로그에 있으며, 저장하지 않은 채보는 자동 저장에 남아 있습니다.',
  'about.errors': '이번 실행의 오류 {n}개, 마지막 오류: {last}',
  'about.noKey': '이 빌드는 스스로 업데이트할 수 없습니다 (업데이트 키 없이 빌드되었습니다).',
  'about.checkNow': '지금 확인',
  'about.logHint':
    '로그는 이 컴퓨터에만 남습니다. 문제를 알리려면 보고서(버전, 이번 실행의 오류, 로그의 끝부분)를 복사해 메시지에 붙여 넣으세요.',
  'about.openLogs': '로그 폴더 열기',
  'about.copyReport': '보고서 복사',
  'about.close': '닫기',
  'about.legal':
    'GPL-3.0. EZ2PORT와 마찬가지로 게임 컨트롤러를 읽는 데 SDL 3 라이브러리(zlib 라이선스)를 사용합니다. EZ2BMS에는 게임의 어떤 데이터도 들어 있지 않으며, 사용자가 가진 파일을 읽습니다.',
  'about.logsFailed': '로그 폴더를 열 수 없습니다: {error}',

  'diag.crashed':
    '지난번에 EZ2BMS가 예기치 않게 종료되었습니다. 로그에 원인이 남아 있을 수 있습니다.',
  'diag.details': '자세히',
  'diag.failed': '문제가 발생했습니다: {message}. 자세한 내용은 로그에 있습니다 (EZ2BMS 정보).',
  'diag.copied': '보고서를 복사했습니다. 버그 보고나 메시지에 붙여 넣으세요',

  'update.label': '업데이트',
  'update.title': 'EZ2BMS {version}',
  'update.youHave': '현재 버전은 {current}입니다.',
  'update.published': '{date}에 공개되었습니다.',
  'update.package':
    '이 EZ2BMS는 Linux 패키지로 설치되어 패키지 관리자가 업데이트합니다. 새 버전은 릴리스 페이지에서 받으세요.',
  'update.openReleases': '릴리스 페이지 열기',
  'update.installed': '설치했습니다. 다시 시작하는 중…',
  'update.downloadingOf': '다운로드 중 {done} / {total} MB…',
  'update.downloading': '다운로드 중…',
  'update.saveFirst': '먼저 채보를 저장하세요. 설치하면 EZ2BMS가 다시 시작됩니다.',
  'update.install': '설치 후 다시 시작',
  'update.skip': '이 버전 건너뛰기',
  'update.later': '나중에',
  'update.upToDate': 'EZ2BMS가 최신 버전입니다',
  // "버전이" rather than a particle on {version}, which can end in any digit.
  'update.out': 'EZ2BMS {version} 버전이 나왔습니다 (현재 {current}).',
  'update.whatsNew': '변경 사항',
  'update.checkFailed': '업데이트를 확인할 수 없습니다: {error}',
  'update.saveFirstToast': '먼저 채보를 저장하세요. 설치하면 EZ2BMS가 다시 시작됩니다',

  'cmd.help.about': 'EZ2BMS 정보',
  'cmd.help.updates': '업데이트 확인',
  'cmd.help.report': '문제 보고서 복사 (버전, 오류, 로그 끝부분)',
  'cmd.help.logs': '로그 폴더 열기',
  'cmd.app.preferences': '환경 설정 (언어, 업데이트)',

  'prefs.label': '환경 설정',
  'prefs.language': '언어',
  'prefs.languageAuto': '시스템 설정 따름 ({name})',
  'prefs.languageHint': '한국어 번역은 AI가 작성한 초안입니다. 고칠 곳을 알려 주세요.',
  'prefs.updates': '시작할 때 새 버전 확인 (하루 한 번)',
  'prefs.close': '닫기',
};
