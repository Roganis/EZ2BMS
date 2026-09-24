// Korean: see en/port.ts. Terms follow docs/i18n-glossary.md.
// EZ2PORT's songs folder (ez2port/songs, where packages go) is "songs 폴더": "곡 폴더" is the
// song's own project folder in the glossary.

import type { port as en } from '../en/port';

export const port: Record<keyof typeof en, string> = {
  'publish.label': '배포',
  'publish.heading': 'EZ2PORT에 배포',
  'publish.noSong': '열린 곡이 없습니다',
  'publish.pickRoot': 'EZ2PORT가 곡을 두는 폴더',
  'publish.noRoot': 'EZ2PORT가 곡을 두는 폴더({dir})를 고르세요.',
  'publish.chooseRoot': 'songs 폴더 선택…',
  'publish.errors': '먼저 고칠 문제 {n}개',
  'publish.showIssues': '문제 탭에서 보기',
  'publish.preparing':
    '타이틀 플레이트와 아트를 렌더링하고, 모든 채보를 컴파일하고, songs 폴더의 내용을 읽는 중…',
  'publish.cancel': '취소',
  'publish.close': '닫기',
  'publish.done': '완료',
  'publish.go': '배포',
  'publish.goOver': '덮어쓰고 배포',

  'publish.owner.new': '신규',
  'publish.owner.ours': '업데이트',
  'publish.owner.legacy': '이전 EZ2BMS 패키지',
  'publish.owner.foreign': '다른 곡의 패키지',
  // A key the game's own songs use ("수록곡" = a song the game ships with).
  'publish.owner.shipped': '수록곡 키',
  'publish.note.new': '이 키로 된 패키지는 아직 없습니다.',
  'publish.note.ours': '이 곡을 이전에 배포한 패키지를 교체합니다 (.ez2bms-backup에 보관).',
  'publish.note.legacy': '곡 ID가 없는 이전 EZ2BMS의 패키지입니다. 이 곡일 수도 있습니다.',
  'publish.note.foreign':
    '다른 도구나 곡이 만든 폴더입니다. 교체하면 .ez2bms-backup에 사본을 남깁니다.',
  // Particles after a placeholder depend on how the value ends: "키" carries them instead.
  'publish.shipped':
    '"{key}" 키는 게임 수록곡이 쓰고 있습니다. EZ2PORT가 어디서나 그 곡 대신 이 패키지를 재생하게 됩니다. 다른 키를 고르세요.',
  'publish.confirmForeign':
    '{folder} 폴더는 다른 곡의 패키지입니다. 교체하려면 {key} 키를 입력하세요:',
  'publish.confirmLegacy': '이 곡으로 교체',
  'publish.blockedForeign': '다른 곡의 패키지를 교체하려면 {key} 키를 입력하세요',
  'publish.blockedLegacy': '이전 EZ2BMS 패키지를 교체할지 확인하세요',
  'publish.warnings': '경고 {n}개: 배포는 되지만 먼저 확인하세요',

  'publish.charts': '채보',
  'publish.col.chart': '채보',
  'publish.col.level': '레벨',
  'publish.col.file': '파일',
  'publish.col.scores': '스코어',
  'publish.scores.kept': '유지',
  'publish.scores.reset': '초기화 (변경됨)',
  'publish.keysounds': '키음 {n}개, 16비트 오디오 약 {size} MB',

  'publish.wheel': '선곡 화면',
  'publish.noDisc': '디스크 없음',
  'publish.noEyecatch': '아이캐치 없음',
  'publish.preview': '미리듣기 {from} + {length} s',
  'publish.previewOf': '{file} 미리듣기 {from} + {length} s',
  'publish.previewPlay': '재생',
  'publish.previewStop': '정지',
  'publish.noPreview': '미리듣기 없음: 선곡 화면에서 이 곡은 소리가 나지 않습니다',
  'publish.bga': 'BGA {src} → {file} ({from}부터)',
  'publish.noBga': 'BGA 없음',

  'publish.writing': '키음 {n}개를 자르고 패키지를 쓰는 중…',
  'publish.written': '{key} 배포 완료: {dir}에 파일 {files}개',
  'publish.writtenKept': '{key} 배포 완료: {dir}에 파일 {files}개 (랭킹 {kept}개 유지)',
  'publish.writtenReset':
    '{key} 배포 완료: {dir}에 파일 {files}개 (바뀐 채보의 랭킹 {reset}개 초기화)',
  'publish.writtenKeptReset':
    '{key} 배포 완료: {dir}에 파일 {files}개 (랭킹 {kept}개 유지, 바뀐 채보의 랭킹 {reset}개 초기화)',
  'publish.missing': '키음 원본 {n}개를 읽지 못했습니다: {files}',
  'publish.retire': '이 곡이 "{key}" 키로도 songs 폴더에 남아 있습니다.',
  'publish.retireButton': '그 사본 삭제',
  'publish.retired': '"{key}" 키의 패키지를 삭제했습니다 (.ez2bms-backup에 보관).',
  'publish.failed': '배포하지 못했습니다: {error}',

  'port.web':
    '브라우저 미리보기에서는 EZ2PORT를 실행하거나 songs 폴더에 쓸 수 없습니다. 데스크톱 앱을 사용하세요.',
  'port.gameRoot': '게임 폴더 (sound, system 포함)',
  'port.ez2play': 'ez2play',
  'port.exe': '언팩한 실행 파일 (선택)',
  'port.songsRoot': '배포 위치',
  'port.notSet': '설정 안 됨',
  'port.notFound': '찾을 수 없음',
  'port.exeAuto': 'EZ2PORT가 자동으로 찾음',
  'port.choose': '선택…',
  'port.pickGame': 'EZ2AC 데이터 폴더',
  'port.pickEz2play': 'EZ2PORT의 ez2play',
  'port.pickExe': '언팩한 EZ2AC 실행 파일',
  'port.pickSongs': 'EZ2PORT songs 폴더',

  'port.playfield': '플레이 필드',
  'port.gameSkin': '게임 자체의 패널로 그리기',

  'port.cache.heading': '긴 사운드',
  'port.cache.hint':
    '20 s 이상인 사운드(스템)는 디코딩한 상태로 디스크에 보관해, 곡을 열거나 배포할 때 다시 디코딩하지 않습니다.',
  'port.cache.cap': '사용할 디스크 (MB, 0 = 끔)',
  'port.cache.clear': '비우기',
  'port.cache.web': '브라우저 미리보기에서는 쓸 수 없습니다.',
  'port.cache.info': '사운드 {n}개, {used} MB / {cap} MB',

  'port.probe.heading': '이 ez2play',
  'port.probe.options': '옵션 {n}개',
  'port.probe.optionsSource': '옵션 {n}개 · 소스 {commit}',
  'port.cap.songsRoot': '전용 songs 폴더',
  'port.cap.logFile': '로그 파일',
  'port.cap.start': '커서 위치부터 테스트 (--start)',
  'port.cap.skipReady': 'READY 건너뛰기 (--no-ready)',
  'port.cap.viewer': '창 하나를 재사용 (--viewer)',
  'port.cap.result': '결과를 EZ2BMS로 전달 (--result)',
  'port.cap.requested': 'EZ2PORT에 요청함',

  'port.go': '실행',
  'port.test': '테스트',
  'port.auto': '오토',
  'port.publish': '곡 배포',

  'skin.noRoot': '게임 폴더가 설정되지 않음',
  'skin.off': '끔 - 네온 스킨으로 그림',
  'skin.loading': '패널을 읽는 중…',
  'skin.noPanel': '{dir}에 {file} 없음',
  'skin.failed': '{error} - 네온 스킨으로 그림',
  'skin.missing': '텍스처 {n}개 없음',
  'skin.notFound': '찾을 수 없음',
  'skin.reload': '패널 다시 읽기',

  'run.label': 'EZ2PORT 로그',
  'run.running': '실행 중',
  'run.stop': '정지',
  'run.clear': '지우기',
  'run.hide': '숨기기',
  // usage: EZ2PORT rejected the command line.
  'run.outcome':
    '{outcome, select, finished {정상 종료} failed {실패} usage {명령줄 오류} skipped {건너뜀} killed {강제 종료} other {{outcome}}}',
  'run.finished': 'EZ2PORT가 정상 종료되었습니다.',
  'run.usage':
    'EZ2PORT가 명령줄을 이해하지 못했습니다 (exit 2). 이 빌드가 EZ2BMS가 예상하는 것보다 오래되었거나 새로울 수 있습니다.',
  'run.skipped': 'EZ2PORT가 필요한 게임 데이터를 찾지 못했습니다 (exit 77).',
  'run.ended': 'EZ2PORT가 종료되었습니다: {outcome}.',
  'run.endedCode': 'EZ2PORT가 종료되었습니다: {outcome} (exit {code}).',
  'run.testing':
    '{auto, select, true {EZ2PORT에서 {chart} 테스트 중 (오토플레이), 배속 {speed}%} other {EZ2PORT에서 {chart} 테스트 중, 배속 {speed}%}}',
  'run.testingFromCursor':
    '{auto, select, true {EZ2PORT에서 {chart} 커서 위치부터 테스트 중 (오토플레이), 배속 {speed}%} other {EZ2PORT에서 {chart} 커서 위치부터 테스트 중, 배속 {speed}%}}',
  'run.testingFromStart':
    '{auto, select, true {EZ2PORT에서 {chart} 처음부터 테스트 중 (오토플레이), 배속 {speed}% - 이 ez2play에는 아직 --start가 없습니다} other {EZ2PORT에서 {chart} 처음부터 테스트 중, 배속 {speed}% - 이 ez2play에는 아직 --start가 없습니다}}',
  'run.errors': '{chart}에 먼저 고칠 문제가 {n}개 있습니다 (문제 탭 참고)',
  'run.noGame': '먼저 EZ2PORT 탭에서 게임 폴더와 ez2play를 설정하세요',

  'fix.done': '{fix}: 완료 (Ctrl+Z로 되돌리기)',
  'fix.doneAll': '{fix}: 채보 {n}개에서 완료',
  'fix.key': '곡 키가 이제 "{key}"입니다',

  'cmd.port.publish': 'EZ2PORT에 배포',
  'cmd.port.test': 'EZ2PORT에서 테스트',
  'cmd.port.testAuto': 'EZ2PORT에서 보기 (오토플레이)',
  'cmd.port.stop': 'EZ2PORT 테스트 정지',
  'cmd.view.port': 'EZ2PORT 설정',
  'cmd.view.issues': '문제 (사전 점검)',
  'cmd.view.log': 'EZ2PORT 로그',
};
