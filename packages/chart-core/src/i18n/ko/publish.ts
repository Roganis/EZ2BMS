// Korean: see en/publish.ts. Terms follow docs/i18n-glossary.md.
//
// "The original game" (the cabinet's own executable, as against EZ2PORT) is
// 원작 게임, as players say of the arcade release. "Background sound" is
// 배경음; a "keyed sound" (a note's on a lane) is 키음.

import type { publish as en } from '../en/publish';

export const publish: Record<keyof typeof en, string> = {
  'cabinet.size':
    '{file} 파일이 {bytes}바이트입니다: 원작 게임은 파일을 {max}바이트 공간에 읽으므로 불러올 수 없습니다 (128 KB 중 {kb} KB)',
  'cabinet.slots': '키음 {n}개 (슬라이스도 하나씩 셈): 원작 게임은 최대 {max}개까지 불러옵니다',
  'cabinet.level': '레벨 {level}: 게임의 테이블은 1-20만 받습니다',
  'cabinet.voice-cut':
    '배경음 {n}개가 기체에서 같은 트랙의 다음 사운드에 끊깁니다 (원작은 트랙마다 한 사운드만, EZ2PORT는 둘 다 재생){unknown, plural, =0 {} other { (길이를 알 수 없는 사운드 {unknown}개는 확인하지 않음)}}',
  'cabinet.voice-cut.measure':
    '배경음 {n}개(처음은 {measure}마디)가 기체에서 같은 트랙의 다음 사운드에 끊깁니다 (원작은 트랙마다 한 사운드만, EZ2PORT는 둘 다 재생){unknown, plural, =0 {} other { (길이를 알 수 없는 사운드 {unknown}개는 확인하지 않음)}}',
  'cabinet.voice-game': '배경음 {n}개가 트랙의 다음 사운드에 끊깁니다 (게임의 원래 채보와 같음)',
  'cabinet.voice-game.measure':
    '배경음 {n}개(처음은 {measure}마디)가 트랙의 다음 사운드에 끊깁니다 (게임의 원래 채보와 같음)',
  'cabinet.voice-lane':
    '키음 {n}개가 레인의 다음 노트에 끊깁니다 - 기체에서는 직접 칠 때뿐 아니라 오토플레이에서도',
  'cabinet.voice-lane.measure':
    '키음 {n}개(처음은 {measure}마디)가 레인의 다음 노트에 끊깁니다 - 기체에서는 직접 칠 때뿐 아니라 오토플레이에서도',
  'cabinet.repinned':
    '배경음 노트 {n}개가 게임의 트랙({mode}의 레인)에 있을 수 없어 다른 트랙에 놓입니다',
  'cabinet.grown': '배경음이 끊기지 않도록 채보에 트랙 {n}개가 추가됩니다',
  'cabinet.kept':
    'bmson에 자리가 없는 레코드 {n}개(스크롤, 볼륨, 박자...)를 게임에 있던 자리에 다시 씁니다',
  'cabinet.name':
    '채보 헤더의 이름에 한국어 Windows(CP949)로 쓸 수 없는 문자가 있습니다: {chars} (?로 기록)',
  'cabinet.records-res':
    '게임 채보 자체의 레코드(볼륨, 마크...) 중 {n}개가 EZ2 틱 사이에 있습니다. 해상도를 직접 바꾸셨나요? 각각 가장 가까운 틱에 씁니다',
  'cabinet.tier-new':
    '{mode} {tier} 채보가 이 곡에 새로 추가됩니다: 게임 목록의 레벨은 {level}입니다',
  'cabinet.2p': '게임에는 {mode} {tier}의 2인용 파일({file})도 있으며, 그대로 둡니다',
  'cabinet.gds': '게임 폴더에 {file} 파일이 없습니다: {mode}의 레인은 EZ2BMS 자체 트랙에 놓습니다',
  'cabinet.song-hidden':
    '{mode}: 게임은 NM에 레벨이 있는 곡만 목록에 표시하는데, {song} 곡에는 이 모드의 NM 레벨이 없습니다',
  'cabinet.missing-sound':
    '키음 {n}개에 파일이 없습니다({names}): 게임 자체의 빠진 사운드처럼 목록에는 넣고 소리는 나지 않습니다',
  'cabinet.convert': '키음 {n}개를 16비트 44.1 kHz 스테레오로 변환합니다 (나머지는 그대로)',

  'export.not-listed':
    '게임의 {table} 테이블에 {song} 곡이 없습니다 (기체 내보내기는 게임에 있는 것만 바꿀 수 있습니다)',
  'export.second-chart': '두 번째 {mode} {tier} 채보',

  'publish.song-key': '곡 키 "{key}": 영문 소문자 또는 숫자 1-15자여야 합니다',
  'publish.no-charts': '곡에는 채보가 하나 이상 있어야 합니다',
  'publish.duplicate-chart': '{mode} {tier} 채보가 두 개 있습니다',
  'publish.mode-unsupported': '{mode} 채보는 아직 EZ2PORT로 배포할 수 없습니다',
  // The halo is the plate panel's 글로우.
  'publish.tint.white': '흰색',
  'publish.tint.green': '초록 (12th)',
  'publish.tint.cyan': '하늘색',
  'publish.tint.orange-halo': '주황 글로우 (11th)',
  'publish.tint.cyan-halo': '하늘색 글로우 (15th)',

  'song.file.json': 'ez2bms.song.json 파일이 올바른 JSON이 아닙니다 ({error})',
  'song.file.not-object': 'ez2bms.song.json 파일에 객체가 없습니다',
  'song.file.key': 'key 값이 텍스트가 아니어서 무시했습니다',
  'song.file.preview': 'preview 값은 EZ2BMS가 읽는 미리듣기 설정이 아닙니다. 그대로 두었습니다',
  'song.file.bga': 'bga 값은 EZ2BMS가 읽는 BGA 설정이 아닙니다. 그대로 두었습니다',
  'song.file.plate': 'plate 값은 EZ2BMS가 읽는 플레이트 설정이 아닙니다. 그대로 두었습니다',
  'song.file.art': '{field} 값은 EZ2BMS가 읽는 이미지 설정이 아닙니다. 그대로 두었습니다',
  'song.file.source': 'source 값은 EZ2BMS가 읽는 가져오기 기록이 아닙니다. 그대로 두었습니다',
  'song.undo.info': '곡 정보',

  'media.container.unknown': '알 수 없음',

  'data.exe.no-mz': '실행 파일이 아닙니다 (MZ 없음)',
  'data.exe.pe-range': 'PE 헤더가 범위를 벗어납니다',
  'data.exe.not-pe': 'PE 이미지가 아닙니다',
  'data.exe.not-32': '32비트 PE 이미지가 아닙니다',
  'data.exe.sections': '섹션 테이블이 범위를 벗어납니다',
  'data.exe.packed': '키 테이블 주소가 어느 섹션에도 없습니다 (PACKED 실행 파일인가요?)',
  'data.exe.truncated': '실행 파일이 잘려 있습니다',
  'data.exe.not-table':
    '추출한 데이터가 예상한 키 테이블이 아닙니다 (다른 실행 파일이거나 수정된 실행 파일)',
  'data.songdb.short': 'song.bin 파일이 너무 짧습니다',
  'data.songdb.magic':
    'song.bin 파일이 EZSL로 시작하지 않습니다: 다른 실행 파일의 테이블이거나 song.bin 파일이 아닙니다',
  'data.songdb.header': 'song.bin 헤더가 파일 끝 너머를 가리킵니다',
  'data.songdb.encrypted':
    'song.bin 파일이 암호화되어 있습니다: 언팩한 EZ2AC 실행 파일을 지정하세요',
  'data.songdb.unlisted': 'song.bin에 {key} 항목이 없습니다',
  'data.gds.no-slot': '[SlotN] 섹션이 없습니다',
  'data.pvi.no-general': '.pvi 파일이 아닙니다 ([General] 섹션 없음)',
  'data.abm.short': '헤더가 들어가기에는 너무 짧습니다',
  'data.abm.magic': '.abm 파일이 아닙니다 (AW 매직 없음)',
  'data.abm.version': '이 헤더를 풀 수 있는 알려진 XOR 테이블이 없습니다',
  'data.abm.bpp': '지원하지 않는 픽셀당 비트 수입니다 ({bpp})',
  'data.abm.size': '있을 수 없는 크기입니다 ({w}x{h})',
  'data.abm.data': '픽셀 데이터가 파일 끝 너머에서 시작합니다',
};
