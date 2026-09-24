// Korean: see en/play.ts. Terms follow docs/i18n-glossary.md.
//
// What the cabinet itself shows stays in its capitals (FAST, SLOW, MAX
// COMBO, NOTES, GAUGE, CLEAR, FAILED); the editor's own words (AUTO PLAY,
// TEST PLAY, STOPPED) are Korean.

import type { play as en } from '../en/play';

export const play: Record<keyof typeof en, string> = {
  'play.kindAuto': '오토플레이',
  'play.kindTest': '테스트 플레이',
  'play.bgmMuted': '배경음 음소거',
  'play.bgmOn': '배경음 켬',
  'play.soloOff': '솔로 해제',
  'play.solo': '솔로: 레인 {lane}',

  'hud.gauge': '게이지 {value}',
  'hud.fast': 'FAST',
  'hud.slow': 'SLOW',

  'result.label': '결과',
  'result.untitled': '제목 없음',
  'result.chart': '{chart} · 레벨 {level}',
  'result.rate': '{rate}% · {state, select, failed {FAILED} stopped {중단} other {CLEAR}}',
  'result.partial': '플레이한 노트 {n}개로 평가',
  // Rows of the table under KOOL … FAIL: the cabinet's capitals.
  'result.maxCombo': 'MAX COMBO',
  'result.notes': 'NOTES',
  'result.gauge': 'GAUGE',
  'result.retry': '다시 하기',
  'result.close': '닫기',

  'record.starting': '커서 위치부터 레코딩…',
  'record.live': 'REC · 입력 {n}회',
  'record.stopHint': 'R 또는 Esc로 정지',
  'record.take': '테이크',
  'record.notes': '노트 {n}개',
  'record.classic': '클래식: 나는 소리를 키음으로',
  'record.ok': '배치 {n}개',
  'record.clash': '기존 노트와 겹침 {n}개',
  'record.silent': '소리 없는 곳 {n}개',
  'record.statsTitle': '입력이 그리드에서 얼마나 벗어났는지 (입력 오프셋 적용 후)',
  'record.stats': '평균 {mean} ms · 중앙값 {median} ms · 빠름 {early} · 늦음 {late}',
  'record.holdsFrom': '{field} ms 이상은 롱노트',
  'record.grid': '그리드',
  'record.exact': 'EZ2 정밀',
  'record.exactTitle': 'EZ2 고유 그리드: 1/48박',
  'record.countIn': '카운트인 {field}박',
  'record.metronome': '메트로놈',
  'record.muteLanes': '레코딩 중 레인 음소거',
  'record.keep': '채택',
  'record.retake': '리테이크',
  'record.discard': '버리기',
  'record.noBrush': '먼저 레코딩에 쓸 사운드를 고르세요 (또는 클래식 모드를 켜세요)',
  'record.nothing': '레코딩된 입력이 없습니다',
  // Each `{x, plural, =0 {} …}` adds its part only when there is one.
  'record.kept':
    '테이크 채택: 노트 {placed}개{clash, plural, =0 {} other {, 기존 노트와 겹침 {clash}개}}{silent, plural, =0 {} other {, 소리 없는 곳 {silent}개}}{refused, plural, =0 {} other {, 소리가 달라져 제외 {refused}개}}{shortened, plural, =0 {} other {, 일반 노트가 된 롱노트 {shortened}개}}',
  'record.discarded': '테이크를 버렸습니다',
  'record.undoStep': '테이크 레코딩',

  'controls.title': '조작 설정과 타이밍',
  'controls.bindings': '할당',
  'controls.controllers': '컨트롤러',
  'controls.timing': '타이밍',
  'controls.hint':
    '채널마다 키나 컨트롤러의 버튼·햇을 4개까지 할당합니다. {plus} 버튼을 누른 뒤 입력하세요. EZ2BMS 전용 설정이며, EZ2PORT의 {file} 파일은 읽기만 합니다.',
  'controls.laneTitle': '이 채보의 모드에서 쓰이는 레인',
  'controls.strum': '스트럼',
  'controls.axis': '축',
  'controls.remove': '제거',
  'controls.bindTitle': '눌러서 할당',
  'controls.pressKey': '키나 버튼을 누르세요…',
  'controls.bindAxisTitle': '돌려서 축 할당',
  'controls.turnIt': '돌리세요…',
  'controls.reversed': '반전',
  'controls.velocity': '위치 대신 속도',
  'controls.padError': '컨트롤러를 쓸 수 없습니다: {error}',
  'controls.noPads': '컨트롤러가 없습니다. 연결하면 인식되는 즉시 여기에 나타납니다.',
  'controls.padShape': '버튼 {buttons}개 · 축 {axes}개 · 햇 {hats}개',
  'controls.readout': '버튼: {list}',
  'controls.debounce': '디바운스 {field} ms',
  'controls.defaults': 'EZ2PORT 기본값',
  'controls.import': 'EZ2PORT에서 가져오기',
  'controls.copy': 'keys.ini로 복사',
  'controls.done': '완료',
  // A colon, not a particle: 은/는 would depend on how the token ends.
  'controls.already': '{token}: 이미 그곳에 할당되어 있습니다',
  'controls.full': '채널당 할당은 {n}개까지입니다. 먼저 하나를 제거하세요',
  'controls.defaultsSet': 'EZ2PORT 기본 할당으로 설정했습니다',
  'controls.noPortKeys': 'EZ2PORT의 keys.ini를 찾지 못했습니다 (데이터 폴더와 설정 폴더)',
  'controls.imported': '{path}에서 할당을 가져왔습니다',
  'controls.copied': 'keys.ini 형식으로 복사했습니다. EZ2PORT의 keys.ini에 붙여넣으세요',
  'controls.noClipboard': '여기서는 클립보드를 쓸 수 없습니다',

  'calib.hint':
    '이 컴퓨터에서 EZ2BMS의 소리, 화면, 입력이 얼마나 늦는지 보정합니다. EZ2PORT에는 오프셋이 없으며, 이 값은 에디터 안의 플레이와 레코딩에만 쓰입니다.',
  'calib.sound': '사운드 테스트',
  'calib.soundHint':
    '클릭 소리마다 아무 키나 버튼을 누르세요 (20번, 처음 4번은 박자를 잡는 용도). 입력 오프셋을 정합니다.',
  'calib.picture': '화면 테스트',
  'calib.pictureHint':
    '화면이 번쩍일 때마다 누르세요 (소리 없음). 화면 오프셋을 정합니다. 사운드 테스트를 먼저 하세요.',
  'calib.start': '시작',
  'calib.taps': '탭 {n}회',
  'calib.stop': '정지',
  'calib.land': '탭 타이밍: {offset}',
  'calib.offset': '{ms} ms {dir, select, early {빠름} other {늦음}}',
  'calib.detail': '(탭 {used}회, 편차 {spread} ms)',
  'calib.detailDropped': '(탭 {used}회, 편차 {spread} ms, {dropped}회 제외)',
  'calib.use': '{kind, select, sound {입력} other {화면}} 오프셋으로 사용',
  'calib.failed':
    '박자에 맞은 탭이 너무 적어 판단할 수 없습니다. {kind, select, sound {클릭 소리} other {번쩍임}}마다 눌러서 다시 해 보세요.',
  'calib.audioOffset': '오디오 오프셋 (ms)',
  'calib.pictureOffset': '화면 오프셋 (ms)',
  'calib.inputOffset': '입력 오프셋 (ms)',

  'cmd.play.toggle': '커서 위치부터 재생 / 정지',
  'cmd.play.test': '커서 위치부터 테스트 플레이 (내 키로, EZ2PORT와 같은 판정)',
  'cmd.play.record':
    '레코딩: 커서 위치부터 따라 연주하고 테이크를 채택 (R을 다시 누르면 정지 또는 리테이크)',
  'cmd.input.controls': '조작 설정과 타이밍… (키, 컨트롤러, 오프셋)',
  'cmd.play.again': '마지막으로 재생을 시작한 곳부터 다시 재생',
  'cmd.audio.muteBgm': '배경음 음소거 / 해제',
  'cmd.audio.solo': '포인터 아래 레인 솔로 (다시 하면 해제)',
};
