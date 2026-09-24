// Korean: see en/edit.ts. Terms follow docs/i18n-glossary.md.
//
// A reason is said after the editor's own sentence and a colon ("여기에 노트를
// 놓을 수 없습니다: {reason}"), so each is a whole 합니다체 clause with no full
// stop. As in the editor's catalog: "key" (Classic) is 키음으로 만들다, "heal"
// is 잇다, Classic's "split" is 나누기, chop is 자르기, a cut is 컷.

import type { edit as en } from '../en/edit';

export const edit: Record<keyof typeof en, string> = {
  'edit.place.before-start': '채보 시작 전입니다',
  'edit.place.taken': '이미 노트가 있습니다',
  'edit.place.in-hold': '롱노트 안입니다',
  'edit.place.covers': '롱노트가 다른 노트를 덮게 됩니다',
  'edit.note-gone': '그 노트는 이미 없습니다',

  'classic.changes-sound': '{src}의 소리가 바뀌게 됩니다',
  'classic.no-lane': '키음을 놓을 레인을 고르세요',
  'classic.lane-taken': '그곳에서 레인 하나가 이미 차 있습니다',
  'classic.sound-starts': '사운드가 시작되는 자리입니다 - 클래식 모드는 사운드를 지우지 않습니다',
  'classic.nothing-to-split': '그곳에는 나눌 것이 없습니다',
  'classic.heal-background': '배경음에서 나눈 곳만 이을 수 있습니다',

  'slice.nothing-to-cut': '그곳에는 컷할 소리가 없습니다',
  'slice.already-cut': '이미 그곳에 컷이 있습니다',
  'slice.not-playing': '그곳에서는 {src} 사운드가 재생되고 있지 않습니다',
  'slice.sound-starts': '사운드가 시작되는 자리입니다 - 컷만 옮길 수 있습니다',
  'slice.between-cuts': '컷은 양옆 컷 사이에서만 움직일 수 있습니다',
  'slice.lane-taken': '그곳에서는 레인이 이미 차 있습니다',
  'slice.midi.no-hit':
    '{src} 사운드가 이 채보에서 한 번도 울리지 않아 MIDI의 시작점을 정할 수 없습니다',
  'slice.midi.no-notes': '고른 트랙에 노트가 없습니다',
  'slice.midi.not-playing': 'MIDI 노트가 있는 곳에서 {src} 사운드가 재생되고 있지 않습니다',

  'sound.rename.missing': '곡 폴더에 {file} 파일이 없습니다',
  'sound.rename.empty': '이름이 비어 있습니다',
  'sound.rename.windows': 'Windows에서 쓸 수 없는 파일 이름입니다: "{name}"',
  'sound.rename.extension': '{ext} 확장자는 그대로 두세요 (파일 형식은 바뀌지 않습니다)',
  'sound.rename.same': '이미 그 이름입니다',
  'sound.rename.taken': '폴더에 이미 {file} 파일이 있습니다',
  'sound.rename.same-stem': '확장자 앞 이름이 같은 {file} 파일이 있습니다',

  'undo.place-note': '노트 배치',
  'undo.erase-notes': '{n, plural, =1 {노트 삭제} other {노트 {n}개 삭제}}',
  'undo.move-notes': '노트 이동',
  'undo.shift-lanes': '레인 이동',
  'undo.to-background': '배경음으로 이동',
  'undo.to-lane': '레인으로 이동',
  'undo.set-length': '길이 설정',
  'undo.make-holds': '롱노트로 만들기',
  // 단노트: the players' word for a note that is not a long note.
  'undo.make-taps': '단노트로 만들기',
  'undo.hold-kind': '롱노트 종류 설정',
  'undo.vel-pan': '벨로시티/팬 설정',
  'undo.mirror': '미러',
  'undo.swap-sides': '1P / 2P 교체',
  'undo.bpm.set': 'BPM 설정',
  'undo.bpm.remove': 'BPM 변경 삭제',
  'undo.stop.set': 'STOP 설정',
  'undo.stop.remove': 'STOP 삭제',
  'undo.scroll.set': '스크롤 변속 설정',
  'undo.scroll.remove': '스크롤 변속 삭제',
  'undo.add-sound': '사운드 추가',
  'undo.add-sounds': '사운드 {n}개 추가',
  'undo.remove-sound': '사운드 삭제',
  'undo.rename-sound': '사운드 이름 바꾸기',
  'undo.replace-sound': '사운드 교체',
  'undo.remove-unused': '쓰지 않는 사운드 {n}개 삭제',
  'undo.change-sound': '사운드 변경',
  'undo.paste': '붙여넣기',
  'undo.record-take': '테이크 레코딩',
  'undo.key-sound': '키음으로 만들기',
  'undo.move-keyed': '키음 노트 이동',
  // The English says no count; n stays for the plural.
  'undo.unkey': '{n, plural, other {키음 해제}}',
  'undo.split-sound': '사운드 나누기',
  'undo.heal-split': '나눈 곳 잇기',
  'undo.reset-background': '모두 배경음으로 되돌리기',
  'undo.cut-stem': '스템 컷',
  'undo.move-cut': '컷 이동',
  'undo.slice-to-background': '{n, plural, other {슬라이스를 배경음으로}}',
  'undo.key-slice': '{n, plural, other {슬라이스를 키음으로 만들기}}',
  'undo.chop': '그리드 자르기',
  'undo.midi-tempo': 'MIDI에서 템포 가져오기',
  'undo.midi-cuts': 'MIDI 노트 위치에 스템 컷',

  // Said after the kind's number ("4: 끝난 뒤 한 번…").
  'hold.kind.0': '1/4박마다 (기본)',
  'hold.kind.1': '1/2박마다',
  'hold.kind.2': '1/8박마다',
  'hold.kind.3': '1/16박마다',
  'hold.kind.4': '끝난 뒤 한 번 (1/32박 단위로 셈: 100% 불가)',
  'hold.kind.5': '끝난 뒤 한 번 (1/4박 단위로 셈: 100% 불가)',
  'hold.kind.6': '끝에서 한 번, 계속 KOOL이면',
  'hold.kind.7': '누르는 동안 없음',
  'hold.kind.9': '없음, 시작 노트도 세지 않음',

  // "Shipped": what most of the game's own charts run.
  'edit.judge.shipped': '공식 채보 (9/27/53/73)',
  'edit.judge.missing': '엔진 기본값 (6/24/36/72)',
  'edit.judge.override': '자주 쓰는 값 (6/24/50/70)',
  'edit.judge.lenient': '넉넉한 판정 (7/30/50/80)',
  'edit.life.default': '기본',
  'edit.life.forgiving': '완화',
  'edit.life.recovery': '빠른 회복',
};
