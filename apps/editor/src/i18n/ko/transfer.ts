// Korean: see en/transfer.ts. Terms follow docs/i18n-glossary.md.
// A chart's tier (NM/HD/SHD/EX) is its 난이도, as in the glossary's "difficulty".

import type { transfer as en } from '../en/transfer';

export const transfer: Record<keyof typeof en, string> = {
  'import.game.noRoot': '먼저 EZ2PORT 패널에서 EZ2AC 데이터 폴더를 설정하세요',
  'import.game.noSongs': '곡을 찾지 못했습니다. sound/와 system/이 들어 있는 폴더인지 확인하세요.',

  'import.label': '곡 가져오기',
  'import.title': '가져오기',
  'import.close': '닫기',
  'import.tab.game': 'EZ2AC 곡',
  'import.search': '제목 검색',
  'import.reading': '곡 테이블을 읽는 중…',
  'import.readAgain': '다시 읽기',
  'import.game.bpm': '{bpm} BPM',
  'import.game.summary': '곡 키 {key} · 카테고리 {category} · 키음 {n}개',
  'import.game.chart': '레벨 {level} · 노트 {notes}개',
  'import.game.hint':
    '곡을 고르세요. 채보는 새 곡 폴더의 bmson 파일이 되고, 키음은 WAV(같은 샘플)가 되며, 새 곡 키를 받습니다. 게임의 원래 키로 배포하면 선곡 화면에서 그 곡을 대체하게 됩니다.',

  'import.bms.pick': 'BMS 파일이 있는 폴더',
  'import.bms.folder': '폴더',
  'import.bms.read': '읽기',
  'import.bms.none': '그 폴더에 .bms, .bme, .bml, .pms 파일이 없습니다',
  'import.bms.file': '파일',
  'import.bms.songTitle': '제목',
  // The file's text encoding.
  'import.bms.text': '인코딩',
  'import.bms.random': '랜덤',
  'import.bms.lanes': '레인',
  'import.bms.mode': '모드',
  'import.bms.tier': '난이도',
  'import.bms.notes': '노트 {n}개',
  'import.bms.guess': '바이트로 추측한 값',
  'import.bms.randomLine': '{line}행의 #RANDOM',
  'import.bms.keysInOrder': '키 순서대로',
  'import.bms.skip': '이 파일 제외',
  'import.bms.clash': '{file} 파일이 이미 같은 모드와 난이도를 쓰고 있습니다',
  'import.bms.taken': '중복',
  'import.bms.summary': '곡 키 {key} · 채보 {charts}개 · 파일 {files}개 사용',
  'import.bms.inPlace': 'BMS 파일 옆에 곡 쓰기 (복사 없음)',

  'import.bmson.hint':
    'bmson은 그대로 열립니다: 그 폴더를 여세요. 이전 bmson(0.21, BmsONE)은 1.0으로 읽고, BMS 방식으로 번호를 매긴 레인({beat7k}, {beat10k}, 두 번호 체계 모두)은 EZ2 레인으로 옮깁니다. 바뀐 내용은 문제 탭에 나옵니다. circus2bmson의 출력도 같은 방법으로 열립니다.',
  'import.bmson.open': '폴더 열기…',

  'import.findings': '알아둘 점 {n}개 (문제 탭에 기록됨)',
  'import.dest': '새 폴더',
  'import.choose': '선택…',
  'import.dest.pick': '새 곡 폴더를 둘 곳',
  'import.go': '가져오기',
  'import.going': '가져오는 중…',
  'import.progress': '{done} / {total} 파일',

  'import.nothing': '가져올 것이 없습니다',
  'import.clash': '{dir}에 이미 {file} 파일이 있습니다',
  'import.noDest': '새 곡을 둘 곳을 고르세요',
  'import.copyFailed': '키음 {n}개를 복사하지 못했습니다: {file}',
  'import.done': '채보 {n}개를 가져왔습니다 - 옮기지 못한 내용은 문제 탭에 있습니다',
  'import.failed': '가져오지 못했습니다: {error}',

  'export.label': '곡 내보내기',
  'export.title': '내보내기',
  'export.close': '닫기',
  'export.tab.cabinet': 'EZ2AC 기체',
  'export.tab.history': '내보내기 기록',

  'export.search': '게임 곡 검색',
  'export.reading': '곡 테이블을 읽는 중…',
  'export.readAgain': '다시 읽기',
  'export.hint':
    '교체할 게임 곡을 고르세요. 기체 내보내기는 게임에 이미 있는 곡을 고쳐 만듭니다. 내 채보가 그 곡의 채보 자리에 들어가고(없는 난이도는 추가), song.bin의 기록에는 그 레벨과 BPM이 들어가며, 새 키음은 원래 키음 옆에 놓입니다. 게임 파일 중 덮어쓰는 것은 채보뿐이고, 그 채보도 백업에 남습니다.',
  'export.otherSong':
    '이 곡은 {from}에서 가져온 곡입니다. {dir}에 내보내면 {dir}의 채보가 내 채보로 바뀝니다.',

  'export.col.chart': '채보',
  'export.col.becomes': '게임 파일',
  'export.col.level': '레벨',
  'export.col.bpm': 'BPM',
  'export.col.size': '크기',
  'export.chart.replaces': '교체',
  'export.chart.new': '신규',
  'export.chart.size': '{size} KB / 128 KB',
  'export.chart.skipped': '제외',

  'export.dest.game': '게임 폴더 {root}에 직접 - 교체하는 파일은 모두 백업에 남습니다',
  'export.dest.folder': '게임과 같은 구조의 새 폴더에 (기체에 복사할 용도)',
  'export.dest.new': '새 폴더',
  'export.choose': '선택…',
  'export.dest.pick': '내보낼 빈 폴더',
  'export.dest.unchanged': '게임에 이미 있는 키음도 복사',
  'export.dest.songdb':
    'song.bin은 이 게임의 해당 모드 전체 테이블입니다. 게임 버전이 같은 기체에만 복사하세요. 그렇지 않으면 다른 곡의 레벨도 함께 바뀝니다. 각 파일이 무엇을 교체하는지는 폴더 안의 EZ2BMS-EXPORT.txt에 적혀 있습니다.',

  'export.preparing': '내보낼 내용을 계산하는 중…',
  'export.sounds':
    '키음: 신규 {write}개, 폴더에 이미 있음 {reused}개{missing, plural, =0 {} other {, 누락 {missing}개}}{converted, plural, =0 {} other { (변환 {converted}개)}}',
  'export.songdb': '{mode} song.bin:',
  'export.songdb.bytes': '({n}바이트 변경)',
  'export.songdb.unchanged': '변경 없음',
  'export.findings': '알아둘 점 {n}개',
  'export.done': '게임에 내보냈습니다: {replaced}개 교체, {added}개 추가. 백업은 {stamp}입니다.',
  'export.undo': '이 내보내기 되돌리기',
  'export.wrote': '{dir}에 파일 {files}개를 썼습니다.',
  'export.go': '내보내기',
  'export.going': '내보내는 중…',

  'export.noSong': '열린 곡이 없습니다',
  'export.noChart': '내보낼 채보를 고르세요',
  'export.blocked.errors': '먼저 고칠 오류 {n}개',
  'export.blocked.noChart': '이 곡에 넣을 수 있는 채보가 없습니다',
  'export.blocked.noFolder': '새 폴더를 고르세요',
  'export.failed': '내보내지 못했습니다: {error}',
  // The executable's encryption keys: "암호 키", not the song key (곡 키).
  'export.cabinet.noTables':
    '게임 채보는 실행 파일에 든 암호 키로 암호화되어 있는데, 그 키가 없습니다: {why}',
  'export.cabinet.noExe':
    '게임 채보는 실행 파일에 든 암호 키로 암호화되어 있는데, 그 키가 없습니다: EZ2PORT 패널에서 실행 파일을 설정하세요',
  'export.cabinet.unreadable': '{file} 파일을 읽을 수 없습니다',
  'export.cabinet.soundsUnreadable': '키음 {n}개를 읽을 수 없습니다: {files}',

  // EZ2BMS-EXPORT.txt: the two spaces after {file} line the notes up, as in English.
  'export.note.title': 'EZ2BMS 기체 내보내기: {title} → sound/{dir}',
  'export.note.made': '{when}, 게임 폴더 {root} 기준으로 만들었습니다.',
  'export.note.copy': '여기 있는 폴더를 기체의 게임 폴더에 복사하세요. 파일별 내용:',
  'export.note.songdb':
    '{file}  (이 모드의 게임 전체 테이블을 교체합니다. 같은 게임 버전에만 복사하세요)',
  'export.note.replaces': '{file}  (게임 파일 교체)',
  'export.note.new': '{file}  (신규)',
  'export.note.sound': '{file}  (새 키음)',
  'export.note.own': '{file}  (게임 원본, 변경 없음)',
  'export.note.reused': '그리고 게임에 이미 있는 키음 {n}개를 그대로 사용',

  'export.bms.hint':
    '채보마다 BMS 하나(키 6-7을 쓰면 BME)와 그 옆에 모든 사운드를 씁니다. WAV와 OGG 파일은 그대로 복사하고, 나머지(EZ2의 .ssf, FLAC, MP3, 스템의 슬라이스)는 WAV로 씁니다.',
  'export.bms.writes': '출력 파일',
  'export.bms.notes': '노트',
  'export.bms.lanes': '레인',
  'export.bms.mapEz2': 'EZ2 BME (턴테이블 16, 페달 17, 이펙터 18/19)',
  'export.bms.mapKeys': '키 순서대로 (IIDX/beat 플레이어용)',
  'export.bms.text': '인코딩',
  'export.bms.encodingAuto': '자동 (Shift-JIS → 한국어 → UTF-8 순)',
  'export.bms.korean': '한국어 (CP949)',
  'export.bms.utf8': 'UTF-8 (beatoraja)',
  'export.bms.ids': '사운드 번호',
  'export.bms.idsAuto': '자동 (36진수, 1295개 초과 시 62진수)',
  'export.bms.base': '{n}진수',
  'export.bms.summary': '채보 {charts}개 · 사운드 {sounds}개 (복사 {copied}, 생성 {made})',
  'export.bms.pick': 'BMS 파일을 둘 빈 폴더',

  'export.history.hint':
    '{root}에 한 내보내기는 모두 교체한 파일을 보관해 두었습니다. 복원하면 그 파일을 되돌리고 추가한 파일을 지웁니다 - 내보내기가 쓴 그대로인 파일에 한해서입니다.',
  'export.history.hintNoRoot':
    '게임 폴더에 한 내보내기는 모두 교체한 파일을 보관해 두었습니다. 복원하면 그 파일을 되돌리고 추가한 파일을 지웁니다 - 내보내기가 쓴 그대로인 파일에 한해서입니다.',
  'export.history.none': '아직 내보내기 기록이 없습니다.',
  // applying: the export was cut off while writing, so 미완료 (unfinished) rather than "in progress".
  'export.backup.row':
    '{when} · 파일 {files}개 · {state, select, applying {미완료} applied {적용됨} restored {복원됨} other {{state}}}',
  'export.backup.restore': '복원',
  'export.backup.restored': '복원됨',
  'export.restore.conflicts':
    '내보내기 이후 파일 {n}개가 바뀌었습니다 ({files}). 복원하면 그 변경 내용을 잃습니다.',
  'export.restore.anyway': '그래도 복원',
  'export.restore.done': '복원했습니다: {restored}개 되돌림, {removed}개 삭제',
  'export.restore.nothing': '복원할 것이 없습니다: 게임에 이미 원래 파일이 있습니다',
  'export.restore.failed': '복원하지 못했습니다: {error}',
};
