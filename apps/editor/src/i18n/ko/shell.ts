// Korean: see en/shell.ts. Terms follow docs/i18n-glossary.md.

import type { shell as en } from '../en/shell';

export const shell: Record<keyof typeof en, string> = {
  'start.tag': 'EZ2PORT를 위한 채보 제작 도구',
  'start.songs': '곡',
  'start.open': '곡 폴더 열기',
  'start.import': '가져오기…',
  'start.new': '새 곡',
  'start.keys': '명령',
  'start.keysOpen': '열기',
  'start.web': '브라우저 미리보기: 파일은 메모리에만 있습니다',

  // "Song manager" (song.label) is 곡 관리.
  'top.songTitle': '곡 관리: 정보, 카테고리, 모든 채보 (Ctrl+Shift+L)',
  'top.song': '곡',
  'top.charts': '채보',
  'top.unsaved': '저장 안 됨',
  // Worded around {file} so no particle has to follow a file name.
  'top.willSaveAs': '저장하면 {file} 파일이 됩니다',
  'top.bpm': 'BPM',
  'top.pos': '위치',
  'top.time': '시간',
  'top.snap': '스냅',
  // The player's scroll speed (glossary: 배속).
  'top.speed': '배속',
  'top.zoom': '줌',
  'top.classicTitle':
    '클래식 모드: 노트를 놓으면 그 위치에서 재생 중인 사운드가 키음이 됩니다 (Ctrl+Shift+K)',
  'top.classic': '클래식',
  'top.undo': '실행 취소 (Ctrl+Z)',
  'top.redo': '다시 실행 (Ctrl+Shift+Z)',
  'top.view': '보기',
  'top.edit': '편집',
  'top.play': '플레이',
  'top.commands': '명령 (Ctrl+K)',

  'status.notes': '노트 {n}개',
  'status.background': '배경음 {n}개',
  'status.sounds': '사운드 {n}개',
  'status.selected': '{n}개 선택',
  // {what} is the last undo step's name.
  'status.last': '최근: {what}',
  'status.classic': '클래식',
  'status.errors': '오류 {n}개',
  'status.warnings': '경고 {n}개',
  'status.ready': 'EZ2PORT 준비 완료',
  'status.running': 'EZ2PORT 실행 중',
  'status.khz': '{khz} kHz',
  'status.noAudio': '오디오 장치 없음',
  'status.browser': '브라우저 미리보기',

  'drawer.close': '닫기',
  'drawer.tab.inspector': '노트',
  'drawer.tab.chart': '채보',
  'drawer.tab.timing': '타이밍',
  'drawer.tab.issues': '문제',
  'drawer.tab.port': 'EZ2PORT',

  'palette.label': '명령 팔레트',
  'palette.placeholder': '명령 입력 - 또는 goto 32, bpm 174, snap 1/12, speed 300',
  'palette.none': '“{query}”에 해당하는 명령이 없습니다',

  'group.File': '파일',
  'group.Edit': '편집',
  'group.View': '보기',
  'group.Play': '플레이',
  'group.Notes': '노트',
  'group.Timing': '타이밍',
  'group.Chart': '채보',
  'group.EZ2PORT': 'EZ2PORT',
  'group.Help': '도움말',
};
