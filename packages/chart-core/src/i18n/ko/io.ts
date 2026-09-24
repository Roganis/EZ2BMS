// Korean: see en/io.ts. Terms follow docs/i18n-glossary.md.
// A value after a placeholder takes "(으)로" or a colon, since the particle
// depends on how the value is read. An EZFF record is 레코드 (not 기록, which
// reads as a score); a bmson pulse is 펄스; a BMS tap is 일반 노트, a hidden
// note 투명 노트 and a mine 지뢰 노트, as the Korean BMS community says.

import type { io as en } from '../en/io';

export const io: Record<keyof typeof en, string> = {
  // ---- Opening a bmson (io/bmson) ----
  'open.upgraded':
    '{file}의 형식은 bmson {version}입니다: bmson 1.0으로 읽었으며, 저장하면 1.0으로 씁니다',
  'open.read': '{path}: {problem}',
  'open.read.again': '{path}: {problem} (같은 문제 {more}건 더)',
  'open.read.more': '{file}에서 다른 종류의 문제가 {n}가지 더 있습니다',
  'open.legacy':
    '{file}의 레인 번호는 옛 방식({hint}{numbering, select, spec {, 2P 키가 x 9-13인 bmson 사양 번호} ez2 {, 2P 키가 x 11-15인 EZ2 번호} other {}})입니다: 노트 {moved}개를 {mode} 레인으로 옮겼습니다',
  'open.legacy.bgm':
    '{file}의 레인 번호는 옛 방식({hint}{numbering, select, spec {, 2P 키가 x 9-13인 bmson 사양 번호} ez2 {, 2P 키가 x 11-15인 EZ2 번호} other {}})입니다: 노트 {moved}개를 {mode} 레인으로 옮기고, {mode}에 없는 레인의 노트 {bgm}개는 배경음으로 보냈습니다',
  'open.legacy.ambiguous':
    '{file}의 2P 노트가 모두 x 11-13에 있습니다. EZ2 번호로는 2P 키 1-3, bmson 사양 번호로는 3-5입니다. EZ2PORT처럼 키 1-3으로 읽었습니다. 두 레인 어긋났다면 선택한 뒤 Alt+→로 옮기세요',

  'open.not-json': 'JSON이 아닙니다: {error}',
  'open.not-object': 'JSON 객체가 아닙니다',
  'open.not-bmson':
    '"version"이 없고 bmson 0.21도 아닙니다: EZ2BMS가 읽을 수 있는 bmson이 아닙니다',

  // Said after a path: "it was not X, so ..." in one clause.
  'open.bad.string': '문자열이 아니어서 쓰인 그대로 두었습니다',
  'open.bad.number': '숫자가 아니어서 쓰인 그대로 두었습니다',
  'open.bad.strings': '문자열 배열이 아니어서 쓰인 그대로 두었습니다',
  'open.bad.judgement': 'KOOL/COOL/GOOD/MISS 숫자 네 개가 아니어서 쓰인 그대로 두었습니다',
  'open.bad.life': 'COOL/GOOD/MISS/FAIL 숫자 네 개가 아니어서 쓰인 그대로 두었습니다',
  'open.bad.tier': 'NM, HD, SHD, EX 중 하나가 아니어서 쓰인 그대로 두었습니다',
  'open.bad.boolean': '불리언 값이 아니어서 쓰인 그대로 두었습니다',
  'open.bad.byte': '0-255 정수가 아니어서 쓰인 그대로 두었습니다',
  'open.bad.info': '없거나 객체가 아닙니다',
  'open.bad.list': '배열이 아니어서 무시했습니다',
  'open.bad.object': '객체가 아니어서 무시했습니다',
  'open.bad.channel': '객체가 아니어서 제외했습니다',
  'open.bad.event': '숫자 y가 있는 이벤트가 아니어서 제외했습니다',
  'open.bad.bpm': '숫자 bpm이 없는 BPM 이벤트여서 제외했습니다',
  'open.bad.stop': '숫자 duration이 없는 STOP이어서 제외했습니다',
  'open.bad.scroll': '숫자 rate가 없는 스크롤 변속이어서 제외했습니다',
  'open.bad.scrolls': '스크롤 변속 목록이 아니어서 그대로 두었습니다',
  'open.bad.note': '숫자 x, y가 없는 노트여서 제외했습니다',
  'open.bad.l': '숫자가 아니어서 0으로 바꿨습니다',
  'open.bad.c': '불리언 값이 아니어서 false로 바꿨습니다',
  'open.bad.bga-header': '숫자 id와 문자열 name이 없는 BGA 헤더여서 제외했습니다',
  'open.bad.bga-event': '숫자 id가 없는 BGA 이벤트여서 제외했습니다',

  'text.not-utf8': '올바른 UTF-8이 아닙니다',

  // ---- The game's own charts (io/ez) ----
  'ez.songdb': '{mode}의 song.bin: {error}',
  'ez.no-exe': '실행 파일을 지정하지 않았습니다',

  // radio/CV2: the game's modes EZ2BMS has no editor for.
  'ez.skip.mode':
    '{file}: EZ2BMS가 편집하는 모드의 채보가 아닙니다 (라디오 모드와 CV2 모드는 대상이 아닙니다)',
  'ez.skip.players': '{file}: 2인용 채보입니다. 게임이 플레이하는 것은 1인용 파일입니다',
  'ez.skip.tier': '{file}: 스테이지 채보나 변형 채보로, 네 난이도 중 하나가 아닙니다',
  'ez.skip.second': '{file}: 두 번째 {mode} {tier} 채보입니다',
  'ez.skip.error': '{file}: {error}',
  // "keys" here are decryption keys: 복호화 키, not a song key or a key cap.
  'ez.encrypted': '암호화되어 있습니다. 복호화 키는 언팩한 EZ2AC 실행 파일 안에 있습니다 ({why})',
  'ez.encrypted.no-exe':
    '암호화되어 있습니다. 복호화 키는 언팩한 EZ2AC 실행 파일 안에 있습니다 (지정된 실행 파일이 없습니다)',
  'ez.key':
    '곡 키는 {key}입니다: "{orig}", "{derived}" 모두 게임이 쓰는 키여서, 그중 하나로 배포하면 해당 곡을 대체하게 됩니다',

  // The .ezi's MIDI-like names (C#0) give a slot number; EZ2PORT reads each as 0.
  'ez.legacy-ezi':
    '키음 목록에 MIDI 음이름(C#0)으로 적힌 번호가 {n}개 있습니다: 음이름을 번호로 바꿔 읽었지만, EZ2PORT는 그렇게 하지 않습니다 (모두 0번으로 재생합니다)',
  'ez.no-ezi': '.ezi가 없습니다: 어떤 노트에도 사운드가 없습니다',
  'ez.no-ini': '.ini가 없습니다: 게임처럼 엔진 기본 판정(6/24/36/72)과 게이지를 씁니다',
  'ez.level': '레벨 {level}: EZ2PORT 곡 목록에는 1-20이 필요해 {set}(으)로 설정했습니다',
  'ez.level.none': '레벨이 없습니다: EZ2PORT 곡 목록에는 1-20이 필요해 {set}(으)로 설정했습니다',
  'ez.tempo': '템포 레코드가 두 개인 틱 {n}개: EZ2PORT가 쓰는 쪽(마지막 것)을 남겼습니다',
  'ez.scroll':
    '스크롤 속도 변경 {n}개: EZ2PORT는 그 지점부터 스크롤이 빨라지거나 느려집니다. 채보의 스크롤 변속으로 옮겼습니다',
  'ez.kept.scroll':
    '배율이 숫자가 아닌 스크롤 레코드 {n}개: 기체용 내보내기를 위해 보관하며, 재생하거나 배포하지 않습니다',
  'ez.kept.volume': '트랙 음량 레코드 {n}개: 채보에 보관하며 배포하지 않습니다',
  'ez.kept.beats': '마디당 박 수 레코드 {n}개: 채보에 보관하며 배포하지 않습니다',
  'ez.kept.mark': '마크 레코드 {n}개: 채보에 보관하며 배포하지 않습니다',
  // stop: the game's record type 7, named as its tag (not a BMS/bmson STOP).
  'ez.kept.stop': 'stop 레코드(엔진은 무시) {n}개: 채보에 보관하며 배포하지 않습니다',
  'ez.kept.tempo':
    '0-1000 BPM 밖의 템포 레코드(엔진은 무시) {n}개: 채보에 보관하며 배포하지 않습니다',
  'ez.kept.unknown': 'EZ2BMS가 모르는 종류의 레코드 {n}개: 보관하며 배포하지 않습니다',
  'ez.kept.length':
    '길이가 있는 배경음 노트 {n}개: x_len으로 보관합니다. 배포할 때는 게임처럼 일반 노트로 씁니다',
  'ez.missing-sound': '게임 폴더에 없는 키음 {n}개: {names}',
  'ez.unlisted':
    '.ezi에 없는 키음 슬롯 {n}개({slots})를 쓰는 노트가 있습니다: 게임에서는 아무 소리도 나지 않습니다',
  'ez.shared-voice':
    '여러 슬롯에 등록된 키음 {n}개: EZ2BMS와 다시 배포한 곡에서는 파일마다 한 번에 한 소리만 나므로, 두 슬롯이 동시에 울리면 서로 끊깁니다',

  'ez.read.short': 'EZFF 헤더를 담기에는 너무 짧습니다',
  'ez.read.not-ezff': 'EZFF가 아닙니다 (아직 암호화된 상태인가요?)',
  'ez.read.version': '지원하지 않는 EZFF 버전입니다 ({version})',
  'ez.read.tracks': '트랙 수가 비정상입니다 ({n})',
  'ez.read.track-header': '트랙 {track}의 헤더가 파일 끝을 넘어갑니다',
  'ez.read.not-eztr': '트랙 {track}의 헤더가 EZTR이 아닙니다',
  'ez.read.track-data': '트랙 {track}의 데이터가 파일 끝을 넘어갑니다',
  'ez.ezi.note': '노트 번호 {note}: 키음 테이블 범위(0-{max})를 벗어났습니다',
  'ez.ezi.empty': '등록된 키음이 없습니다',

  // Tags stay as short as the English; stop, bpm, ×, NaN and # as written.
  'ez.record.volume':
    '트랙 {track}의 음량 {value}: 기체는 이 음량으로 트랙을 믹스하지만, EZ2PORT는 모든 트랙을 최대 음량으로 재생합니다',
  'ez.record.volume.tag': '음량 {value}',
  'ez.record.beats':
    '트랙 {track}의 마디당 박 수 {value}: 기체를 위해 보관합니다. EZ2PORT는 읽지 않습니다',
  'ez.record.beats.tag': '{value}박',
  'ez.record.mark': '트랙 {track}의 마크: 기체를 위해 보관합니다. EZ2PORT는 읽지 않습니다',
  'ez.record.mark.tag': '마크',
  'ez.record.stop': '트랙 {track}의 stop 레코드: 기체를 위해 보관합니다. 게임은 로그만 남깁니다',
  'ez.record.stop.tag': 'stop',
  'ez.record.tempo':
    '트랙 {track}의 템포 {bpm}: 0-1000 범위 밖이라 엔진이 버립니다. 기체를 위해 보관합니다',
  'ez.record.tempo.tag': 'bpm {bpm}',
  'ez.record.scroll':
    '예전 버전의 가져오기가 보관한 트랙 {track}의 스크롤 변속(×{rate}): 재생과 배포에 반영됩니다. 문제 목록에서 채보의 스크롤 변속으로 바꿀 수 있습니다',
  'ez.record.scroll.tag': '×{rate}',
  'ez.record.nan':
    '트랙 {track}의 배율이 숫자가 아닌 스크롤 레코드: 기체를 위해 보관하며, 재생하거나 배포하지 않습니다',
  'ez.record.nan.tag': '× NaN',
  'ez.record.other':
    '트랙 {track}의 타입 {type} 레코드(EZ2BMS가 모르는 종류): 기체를 위해 보관합니다',
  'ez.record.other.tag': '#{type}',

  // ---- Reading BMS (io/bms) ----
  'bms.line': '{line}행: {problem}',
  'bms.random-number': '{header}에 숫자가 없습니다',
  'bms.if-no-random': '앞에 #RANDOM이 없는 #IF: 그 안의 줄은 건너뜁니다',
  'bms.if-open': '이전 #IF가 닫히기 전의 #IF: 이전 #IF를 닫았습니다',
  'bms.elseif': '#IF 없는 #ELSEIF',
  'bms.else': '#IF 없는 #ELSE',
  'bms.endif': '#IF 없는 #ENDIF',
  'bms.endrandom': '#RANDOM 없는 #ENDRANDOM',
  'bms.case': '#SWITCH 밖의 {header}',
  'bms.skip': '#SWITCH 밖의 #SKIP',
  'bms.endsw': '#SWITCH 없는 #ENDSW',
  'bms.odd': '{object}: 글자 수가 홀수입니다. 마지막 글자는 무시합니다',
  'bms.not-number': '{header} 값이 숫자가 아닙니다',

  'bms.measure-length': '{measure}번 마디의 길이 "{length}": 양수가 아니어서 1로 취급합니다',
  'bms.level': '#PLAYLEVEL {level}: EZ2PORT 곡 목록에는 1-20이 필요해 {set}(으)로 설정했습니다',
  'bms.level.none':
    '#PLAYLEVEL이 없습니다: EZ2PORT 곡 목록에는 1-20이 필요해 {set}(으)로 설정했습니다',
  'bms.no-bpm': '사용할 수 있는 #BPM이 없습니다: 시작 템포를 {bpm}(으)로 잡았습니다',
  'bms.bad-refs':
    '파일에 정의되지 않은 #BPMxx/#STOPxx를 가리키는 템포·STOP 변경 {n}개: 제외했습니다',
  'bms.stops':
    'STOP {n}개: EZ2에는 STOP이 없습니다. 배포하면 각각 빈 구간이 되어 스크롤이 멈추지 않습니다',
  'bms.ln-end': '채널 {channel}의 롱노트에 끝이 없습니다: 일반 노트로 읽었습니다',
  'bms.lntype': '#LNTYPE {lntype}: EZ2BMS가 읽는 값이 아니어서 1로 읽었습니다',
  'bms.bga-images':
    'BGA가 이미지입니다: EZ2PORT는 동영상은 재생하지만 이미지는 재생하지 않습니다. 채보에 보관합니다',
  'bms.rounding':
    '마디 길이와 노트 간격에 EZ2BMS가 쓰는 것보다 촘촘한 그리드가 필요합니다: 1박당 240펄스로 배치했으며, 파일상의 위치에서 최대 {worst}펄스 벗어났습니다',
  'bms.hidden': '투명 노트 {n}개(3x/4x, 쳤을 때만 소리가 남): 제외했습니다',
  'bms.hidden.background': '투명 노트 {n}개(3x/4x, 쳤을 때만 소리가 남): 배경음으로 바꿨습니다',
  'bms.mines': '지뢰 노트 {n}개(D/E): EZ2에는 없어 제외했습니다',
  // {map} is a lane layout's name (EZ2 BME, 키 순서대로): "… 배치".
  'bms.unmapped': '{map} 배치에 레인이 없는 채널 {n}개({channels}): 그 노트는 배경음이 됩니다',
  'bms.off-mode': '이 모드에 없는 레인의 노트 {n}개: 배경음으로 바꿨습니다',
  'bms.other-channels': '읽지 않은 채널 {n}개({channels}): EZ2에서는 쓰지 않습니다',
  'bms.scroll': '{header} 변경: EZ2에는 없어 제외했습니다',
  'bms.undefined-wav': '노트가 파일에 정의되지 않은 #WAV ID {n}개를 사용합니다: {ids}',
  'bms.missing-sound': '폴더에 없는 사운드 파일 {n}개: {names}',
  'bms.random': '랜덤 선택 {n}개(#RANDOM/#SWITCH): {choices}',
  'bms.random.choice': '{line}행: {max}개 중 {value}번',
  'bms.random.list': '{list}, {item}',
  'bms.clash': '{file}: {mode} {tier} 채보는 이미 {other}입니다. 다른 난이도를 고르세요',
  'bms.encoding-guess':
    '텍스트 인코딩을 추측했습니다({encoding}): 제목이나 사운드 이름이 깨져 보이면 다른 인코딩으로 다시 가져오세요',
  'bms.map.keys': '키 순서대로',

  // ---- Writing BMS (io/bms/write.ts, export.ts) ----
  'bmsw.too-many-sounds': '키음 {n}개: BMS는 최대 {max}개까지만 지정할 수 있습니다',
  'bmsw.too-many-sounds.36':
    '키음 {n}개: BMS는 최대 {max}개까지만 지정할 수 있습니다 (36진수 기준, 62진수는 3843개)',
  'bmsw.too-many-defs': '서로 다른 템포나 STOP이 {max}개를 넘습니다',
  'bmsw.measures': '{measure}번 마디: BMS의 마디는 000-999까지입니다 ({needed}개 필요)',
  'bmsw.file': '{file}: {note}',
  // {encoding} is Shift-JIS or EUC-KR (CP949); both read with a vowel, so 로.
  'bmsw.unmappable': '{encoding}로 쓸 수 없는 문자({chars})를 ?로 썼습니다',
  'bmsw.velpan':
    '벨로시티나 팬이 있는 노트 {n}개: BMS에는 둘 다 없어 최대 음량, 가운데 위치로 재생됩니다',
  'bmsw.unmapped': '{map} 배치에 채널이 없는 레인의 노트 {n}개: 배경음으로 썼습니다',
  'bmsw.dupes': '다른 노트와 같은 레인, 같은 위치에 있는 노트 {n}개: 배경음으로 썼습니다',
  'bmsw.holds':
    '같은 레인의 다음 노트가 시작하는 곳에서 끝나는 롱노트 {n}개: BMS는 두 노트를 한자리에 둘 수 없어 1펄스 짧게 썼습니다',
  'bmsw.stops':
    '1/192 마디의 정수배가 아닌 STOP {n}개: 소수로 썼습니다 (beatoraja는 읽고, LR2는 내림합니다)',
  'bmsw.scroll':
    '스크롤 변속 {n}개를 쓰지 않았습니다: LR2에는 없고, beatoraja의 #SCROLL은 EZ2PORT와 다르게 동작합니다 (EZ2PORT는 새 속도로 서서히 바뀝니다)',
  'bmsw.kept':
    '게임 채보 고유의 레코드(스크롤, 음량 등)는 쓰지 않았습니다: BMS에는 담을 곳이 없습니다',
  'bmsw.missing-sound':
    '곡 폴더에 없는 사운드 {n}개({names}): BMS에 이름은 적었지만 복사하지 않았습니다',

  // ---- MIDI files, to slice a sound by (io/midi) ----
  'midi.not-midi': 'MIDI 파일이 아닙니다 (MThd 없음)',
  'midi.format-2': '포맷 2 MIDI 파일(독립 시퀀스)에는 컷의 기준이 될 단일 템포가 없습니다',
  'midi.format': 'MIDI 포맷 {format}: EZ2BMS가 읽을 수 없습니다',
  'midi.smpte': 'SMPTE 시간(박 단위가 아님)에는 컷의 기준이 될 템포가 없습니다',
  'midi.division': '분해능이 4분음표당 0틱입니다',
};
