// Korean: see en/drawers.ts. Terms follow docs/i18n-glossary.md.
// File, song and sound names can end in any sound, so no particle follows
// them: the sentences put them before a colon, an arrow or a fixed noun.

import type { drawers as en } from '../en/drawers';

export const drawers: Record<keyof typeof en, string> = {
  'inspector.hintPlace':
    '레인을 클릭하면 왼쪽에서 고른 사운드로 노트를 놓습니다. 위로 드래그하면 롱노트가 됩니다.',
  'inspector.hintDrag':
    '노트를 드래그해 옮기고, 끝을 드래그해 길이를 바꿉니다. 오른쪽 드래그로 지우고, {shift}+드래그로 선택하고, {alt}+클릭으로 노트의 사운드를 가져옵니다.',
  'inspector.hintKeys':
    '{l} 롱노트 · {k} 롱노트 종류 · {m} 미러 · {lanes} 레인 · {snap} 스냅 · {b} BPM · {tab} 플레이 화면 · {palette} 그 밖의 모든 것',
  'inspector.selection': '선택',
  // {n} only keeps the count's counter: the bold number is {count}.
  'inspector.summary':
    '노트 {count}{n, plural, other {개}} · 레인 {lanes}개{bgm, plural, =0 {} other { · 배경음 {bgm}개}} · {pos}부터',
  'inspector.sound': '사운드',
  'inspector.several': '(여러 개)',
  'inspector.holdBeats': '롱노트 (박)',
  'inspector.lengthMixed': '여러 값',
  // A note that is not a long note: 단노트, as players say.
  'inspector.lengthTap': '단노트',
  'inspector.lengthCovers': '그 길이는 다른 노트와 겹칩니다',
  'inspector.holdKind': '롱노트 종류',
  'inspector.kindUnknown': '{kind} (0으로 처리)',
  // × is "times" here, not a multiplier: 회.
  'inspector.holdCounts': '판정 {judged}회 (시작과 분할 판정), 노트 {counts}개로 계산합니다.',
  'inspector.holdCountsShort':
    '판정 {judged}회 (시작과 분할 판정), 노트 {counts}개로 계산합니다. 완벽하게 플레이해도 정확히 100%가 되지 않습니다.',
  'inspector.velocity': '벨로시티',
  'inspector.velocityDb': '{vel} · {db} dB',
  'inspector.pan': '팬',
  'inspector.panCentre': '중앙',
  'inspector.panSide': '{side, select, left {L} other {R}} {db} dB',
  'inspector.hold': '롱노트',
  'inspector.mirror': '미러',
  'inspector.delete': '삭제',

  'chartInfo.mode': '모드',
  'chartInfo.title': '제목',
  'chartInfo.everyChart': '모든 채보',
  'chartInfo.titleBytes': 'EZ2PORT의 곡 목록에는 앞의 32바이트만 남습니다',
  'chartInfo.artist': '아티스트',
  'chartInfo.genre': '장르',
  'chartInfo.differs': '채보마다 {fields} 항목이 다릅니다. 여기에는 NM 채보의 값이 표시됩니다',
  'chartInfo.tier': '난이도',
  'chartInfo.makeTier': '이 채보를 {tier} 난이도로 변경 (저장하면 파일 이름도 바뀝니다)',
  'chartInfo.level': '레벨',
  'chartInfo.judgement': '판정',
  'chartInfo.custom': '사용자 지정',
  'chartInfo.windowsHint':
    '판정 범위는 각 노트의 BPM 기준 1/192박 틱 단위입니다. EZ2PORT는 불러올 때 3을 더합니다.',
  'chartInfo.gauge': '게이지',
  'chartInfo.song': '곡',
  'chartInfo.key': '곡 키 (EZ2PORT의 폴더 이름)',
  'chartInfo.keyRule': '영문 소문자 또는 숫자 1~15자',
  'chartInfo.category': '선곡 화면의 카테고리',
  'chartInfo.categoryHint': 'EZ2PORT는 이 곡을 이 카테고리에만 표시합니다 (ALL에는 없음)',

  'timing.startBpm': '시작 BPM',
  'timing.resolution': '해상도',
  'timing.perBeat': '{n} / 박',
  'timing.bpmChanges': 'BPM 변경',
  'timing.remove': '삭제',
  'timing.noBpm': '없음. {key} 키를 누르면 커서 위치에 추가합니다.',
  'timing.stops': 'STOP',
  // Pulses: bmson's time unit (resolution per beat).
  'timing.noStops': '없음. {key} 키를 누르면 커서 위치에 추가합니다 (길이는 펄스 단위).',
  'timing.stopWarn':
    'EZ2에는 STOP이 없습니다. EZ2PORT에는 대신 시간 간격이 들어가므로 스크롤이 멈추지 않습니다.',
  // The chart's own speed change (EZ2 type 6), not the player's 배속.
  'timing.scroll': '스크롤 변속',
  'timing.scrollMultiplier': '스크롤 배율',
  // {command} is always "scroll 1.5", which takes 를.
  'timing.noScroll':
    '없음. {palette}에서 {command}를 입력하면 커서 위치부터 필드가 1.5배 빠르게 스크롤됩니다.',
  'timing.legacy':
    '예전 가져오기가 남겨 둔 게임 채보의 변속이 {n}개 더 있습니다. 재생과 배포에는 반영되며, “문제” 탭에서 여기서 편집할 수 있는 변경으로 바꿀 수 있습니다.',
  'timing.scrollHint':
    '플레이어의 배속에 곱해지는 배율입니다. EZ2PORT는 몇 프레임에 걸쳐 부드럽게 바꾸며, 필드의 모든 노트가 함께 움직입니다. 타이밍은 바뀌지 않습니다.',
  'timing.kept': '게임 채보의 기록 ({n})',
  'timing.keptHint':
    'bmson에 넣을 곳이 없는 기록으로, 기체용 내보내기를 위해 보관합니다. 내보낼 때 원래 트랙에 다시 씁니다. 읽기 전용이며, 해상도를 바꾸면 함께 옮겨집니다. EZ2PORT는 사용하지 않습니다.',
  'timing.track': '트랙 {n}',
  'timing.andMore': '외 {n}개',

  'issues.show': '표시',
  'issues.all': '전체 {n}',
  'issues.errors': '오류 {n}',
  'issues.warnings': '경고 {n}',
  // Info-level findings.
  'issues.notes': '정보 {n}',
  'issues.none': '고칠 것이 없습니다. 이 곡은 EZ2PORT에서 쓸 준비가 되었습니다.',
  'issues.fixAllTitle': '채보마다 실행 취소 한 번으로 되돌릴 수 있습니다',
  'issues.fixAll': '모두 수정',
  'issues.fixed': '{fix}: 완료 (Ctrl+Z로 되돌리기)',
  'issues.fixFailed': '수정하지 못했습니다: {error}',

  'channels.title': '사운드',
  'channels.filter': '사운드 {n}개에서 찾기',
  'channels.importTitle': '곡에 사운드 파일 가져오기 (또는 창에 끌어다 놓기)',
  'channels.workbenchTitle': '곡의 모든 사운드와 파형 (Ctrl+Shift+B)',
  'channels.renameTitle': '{name} - 더블클릭해 이름 바꾸기',
  'channels.listen': '듣기',
  'channels.remove': '제거 (사용 안 함)',
  'channels.noMatch': '일치하는 사운드 없음',
  'channels.none': '아직 사운드가 없습니다',
  'channels.more': '…외 {n}개, 찾으려면 필터를 쓰세요',
  'channels.unused': '폴더에는 있지만 이 채보에는 없음',
  'channels.addAll': '모두 추가',
  'channels.add': '{name} 추가',
  'channels.added': '사운드 {n}개를 추가했습니다',

  'sounds.pickTitle': '곡에 사운드 가져오기',
  'sounds.importFailed': '가져오지 못했습니다: {error}',
  'sounds.imported': '사운드 {n}개를 가져왔습니다',
  'sounds.alreadyThere': '이미 폴더에 있습니다',
  'sounds.addedTo': '{chart}에 사운드 {n}개를 추가했습니다',
  'sounds.skipped': '{files} 건너뜀 ({error})',
  'sounds.nothing': '가져올 것이 없습니다',
  'sounds.reloaded': '사운드를 다시 불러왔습니다',
  'sounds.replaced': '{from} → {to} 교체 (채보 {n}개)',
  'sounds.replaceStep': '교체',
  'sounds.allUsed': '모든 사운드가 채보에서 사용되고 있습니다',
  'sounds.removed': '채보 {charts}개에서 사용하지 않는 사운드 {n}개를 제거했습니다',
  'sounds.removeStep': '제거',
  'sounds.cantRename': '{file}의 이름을 바꿀 수 없습니다: {reason}',
  'sounds.renamed':
    '{charts, plural, =0 {} other {채보 {charts}개에서 }}이름 변경: {from} → {to}{unsaved, plural, =0 {} other { (저장 안 됨 {unsaved}개)}}',
  // {names} are sound names the charts use that had no file and now find the
  // renamed one (chart-core's RenamePlan.adopts), not chart names.
  'sounds.adopted': '찾을 수 없던 사운드 {n}개({names})가 이제 이 파일로 재생됩니다',
  'sounds.undo': '실행 취소',

  'project.pickFolder': '곡 폴더 열기',
  'project.saved': '채보 {n}개를 저장했습니다',
  'project.nothingToSave': '저장할 것이 없습니다',
  'project.keptOldName': '이전 파일 이름을 유지했습니다 - {detail}',

  'autosave.kept':
    '{file}의 저장하지 않은 변경 사항({when})이 EZ2BMS가 종료된 뒤에도 남아 있습니다.',
  'autosave.recover': '복구',
  'autosave.recovered': '{file} 복구됨 - 유지하려면 저장하세요',

  'app.commandFailed': '{command}: {message}',
  'app.noAudio': '오디오 장치 없음 - 소리 없이 재생합니다 ({error})',
  'app.cannotOpen': 'EZ2BMS에서 열 수 없는 파일입니다: {file}',
  'app.notAChart': '곡을 열었지만, {file} 파일은 이 곡의 채보가 아닙니다',
  'app.leaveUnsaved':
    '{song}에 저장하지 않은 변경 사항이 있습니다. 그래도 {what} 파일을 열까요? 변경 사항은 자동 저장에 남습니다.',
  'app.open': '열기',
  'app.startBpm': '시작 BPM을 {bpm} BPM으로 설정했습니다',
  'app.openFailed': '{dir} 폴더를 열 수 없습니다: {error}',
  'app.newSongFolder': '새 곡의 폴더 (사운드가 미리 들어 있어도 됩니다)',
  'app.snapArg': '{verb}: {grids} 중 하나를 입력하세요',
  'app.speedArg': '{verb}: 50-999 % 범위입니다',
  'app.gotoArg': '{verb}: 마디 번호를 입력하세요',

  'cmd.file.open': '곡 폴더 열기…',
  'cmd.file.save': '저장',
  'cmd.file.newSong': '새 곡…',
  'cmd.file.import': '곡 가져오기… (EZ2AC, BMS, bmson)',
  'cmd.file.exportCabinet': 'EZ2AC로 내보내기… (게임에 있는 곡에 넣기)',
  'cmd.file.exportBms': 'BMS로 내보내기…',
  'cmd.file.exportRestore': '기체용 내보내기 되돌리기…',
  'cmd.song.clearImportNotes': '가져오기 메시지 지우기 (문제 목록에서 제거)',
  'cmd.file.close': '곡 닫기',

  'cmd.edit.undo': '실행 취소',
  'cmd.edit.redo': '다시 실행',
  'cmd.edit.selectAll': '모든 노트 선택',
  'cmd.edit.deselect': '선택 해제',
  'cmd.edit.delete': '선택한 노트 삭제',

  'cmd.view.palette': '명령 팔레트',
  'cmd.view.togglePlay': '편집 / 플레이 화면 전환',
  'cmd.view.snapFiner': '스냅 더 세밀하게',
  'cmd.view.snapCoarser': '스냅 더 거칠게',
  'cmd.view.snap': '스냅 지정…',
  'cmd.view.zoomIn': '확대',
  'cmd.view.zoomOut': '축소',
  'cmd.view.speed': '배속 설정…',
  'cmd.view.side': 'P1 / P2 화면 전환',
  'cmd.view.gameSkin': '게임 스킨 켜기 / 끄기',
  'cmd.view.left': '사운드 목록 표시 / 숨기기',
  'cmd.view.workbench': '키음 워크벤치',
  'cmd.view.songManager': '곡 관리 (정보, 카테고리, 모든 채보)',
  'cmd.view.inspector': '인스펙터',
  'cmd.view.chartInfo': '채보 정보',
  'cmd.view.timing': '타이밍',
  'cmd.view.goto': '마디로 이동…',
  'cmd.view.start': '처음으로 이동',
  'cmd.view.end': '마지막 노트로 이동',
  'cmd.view.stepUp': '커서를 스냅 한 칸 위로',
  'cmd.view.stepDown': '커서를 스냅 한 칸 아래로',
  'cmd.view.measureUp': '커서를 한 마디 위로',
  'cmd.view.measureDown': '커서를 한 마디 아래로',

  'cmd.chart.new': '새 채보…',
  'cmd.sounds.import': '사운드 가져오기…',
  'cmd.sounds.reload': '사운드 파일 다시 불러오기 (다른 프로그램에서 편집한 뒤)',
  'cmd.sounds.removeUnused': '모든 채보에서 사용하지 않는 사운드 제거',
  'app.switchChart': '{n}번 채보로 전환',
};
