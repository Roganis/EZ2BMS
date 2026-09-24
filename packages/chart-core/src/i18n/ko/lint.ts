// Korean: see en/lint.ts. Terms follow docs/i18n-glossary.md.
//
// A particle after a placeholder (이/가, 을/를, 은/는, (으)로) would depend on
// how the value is read, so a noun ("파일", "채보", "카테고리") or a colon sits
// between them. "Chart info" is the drawer's name: 채보 정보.

import type { lint as en } from '../en/lint';

export const lint: Record<keyof typeof en, string> = {
  'lint.level': '레벨 {level}: EZ2PORT 곡 목록이 쓰는 1-20 범위를 벗어납니다',
  'lint.bpm.start': '시작 BPM {bpm}: 0에서 1000 사이여야 합니다',
  'lint.bpm': 'BPM {bpm}: 0에서 1000 사이여야 합니다',
  'lint.init-bpm': '시작 지점의 BPM 변경({bpm})이 시작 BPM({start})과 다릅니다',
  'lint.bpm-same-tick': 'BPM 변경 두 개({a}, {b})가 같은 EZ2 틱에 있습니다',
  'lint.stops':
    'STOP {n}개: EZ2에는 STOP이 없어 EZ2PORT에서는 그만큼 시간만 비고 스크롤은 멈추지 않습니다',
  'lint.scroll-rate':
    '스크롤 변속 {rate}: 필드가 멈추거나 거꾸로 흐르게 됩니다 (0보다 커야 합니다)',
  'lint.scroll-same-tick':
    '스크롤 변속 두 개(×{a}, ×{b})가 같은 EZ2 틱에 있어, EZ2PORT의 정렬로는 어느 쪽이 남을지 알 수 없습니다',
  'lint.scroll-count':
    '스크롤 변속 {n}개: EZ2PORT는 (트랙 순서로) 처음 {max}개만 남기고 나머지는 버립니다',
  'lint.scroll-legacy':
    '예전 가져오기에서 남은 게임 채보의 스크롤 변속 {n}개: 재생과 배포는 되지만, 이 채보의 스크롤 변속으로 바꾸기 전에는 편집할 수 없습니다',
  'lint.off-mode': '노트 {n}개가 {mode}에 없는 레인에 있어 EZ2PORT가 배경음으로 재생합니다',
  'lint.empty': '이 채보에는 아직 칠 노트가 없습니다',
  'lint.notes-limit': '노트 {n}개: EZ2PORT는 최대 {max}개까지 담을 수 있습니다',
  'lint.off-grid': 'EZ2 틱(1/48박) 사이에 있는 노트 {n}개가 최대 {worst}틱만큼 반올림됩니다',
  'lint.hold-kind-max':
    '롱노트 {n}개가 엔진이 세는 방식과 판정을 주는 방식이 다른 종류(4, 5, 9-12)를 씁니다: 완벽하게 쳐도 정확히 100%가 되지 않습니다',
  'lint.same-pulse-sound':
    '노트 {n}개가 같은 사운드의 다른 노트와 위치가 겹칩니다: 어느 슬라이스가 재생될지 모호합니다',
  'lint.lane-duplicates':
    '노트 {n}개가 다른 노트와 같은 레인, 같은 EZ2 틱에 있습니다: 한 번 눌러서 둘 다 칠 수는 없습니다',
  'lint.note-in-hold': '롱노트 {n}개가 같은 레인의 뒤 노트를 덮습니다',
  // "up": the bmson field's name.
  'lint.up-notes': '릴리스(up) 노트 {n}개: EZ2에는 뗄 때 나는 소리가 없어 일반 노트로 재생됩니다',
  'lint.lines':
    '채보의 마디선이 4박마다가 아닙니다: EZ2PORT는 채보와 상관없이 4박마다 선을 긋습니다',
  'lint.bms-judge':
    'judge_rank {rank}, total {total}: EZ2PORT가 쓰지 않는 BMS 설정입니다. 판정과 게이지는 채보 정보에서 정합니다',
  'lint.slots': '사운드 {n}개: EZ2PORT의 키음 슬롯 {max}개보다 많습니다',
  'lint.slots.original':
    '사운드 {n}개: 원작 게임은 최대 {max}개까지 불러옵니다 (EZ2PORT는 문제없음)',
  'lint.unused-sounds': '사운드 {n}개가 이 채보의 어느 노트에도 쓰이지 않습니다',
  'lint.missing-sounds': '노트가 쓰는 사운드 {n}개를 읽을 수 없습니다: {names}',
  'lint.mode-keyword':
    'EZ2PORT의 bmson 가져오기는 이 채보를 {mode} 채보로 읽습니다. 배포는 패키지를 직접 쓰므로, songs 폴더에 bmson을 그대로 넣었을 때만 해당됩니다',
  'lint.mode-keyword.because':
    'EZ2PORT의 bmson 가져오기는 "{keyword}" 때문에 이 채보를 {mode} 채보로 읽습니다. 배포는 패키지를 직접 쓰므로, songs 폴더에 bmson을 그대로 넣었을 때만 해당됩니다',
  'lint.title': '제목이 {max}바이트를 넘습니다: EZ2PORT 곡 목록에는 앞의 {max}바이트만 표시됩니다',
  'lint.title-semicolon':
    '제목에 ";" 문자가 있어 song.ini가 주석으로 읽습니다. 배포할 때는 "," 문자로 씁니다',

  'lint.song-key.none':
    '곡 키가 필요합니다: EZ2PORT에서 쓰는 폴더 이름입니다 (영문 소문자 또는 숫자 1-15자)',
  'lint.song-key': '곡 키 "{key}": 영문 소문자 또는 숫자 1-15자여야 합니다',
  'lint.inside-songs-root':
    '곡 폴더가 EZ2PORT의 songs 폴더 안에 있습니다: 배포한 패키지와 별도로 EZ2PORT가 그 bmson 파일들을 직접 가져오게 됩니다',
  'lint.no-charts': '곡에 채보가 없습니다',
  'lint.chart-count': '채보 {n}개: 한 곡에는 최대 {max}개까지 넣을 수 있습니다',
  'lint.song-invisible': 'EZ2PORT는 레벨 1 이상의 NM 채보가 있는 곡만 목록에 표시합니다',
  'lint.mode-invisible':
    '{mode} 채보는 표시되지 않습니다: EZ2PORT는 그 모드에 레벨 1 이상의 NM 채보가 있을 때만 그 모드의 목록에 곡을 표시합니다',
  'lint.category':
    '카테고리 {category}: EZ2PORT가 아는 카테고리(1-48)가 아닙니다. 곡은 CUSTOM에 들어갑니다',
  // "pages past": the mode's page keys jump over that category.
  'lint.category-unreachable':
    '{mode}의 페이지 넘김은 {category} 카테고리를 건너뜁니다: 그 모드에서는 이 곡의 채보를 고를 수 없습니다',
  'lint.art-missing.disc': '디스크 이미지 {src} 파일이 곡 폴더에 없습니다',
  'lint.art-missing.eyecatch': '아이캐치 이미지 {src} 파일이 곡 폴더에 없습니다',
  'lint.no-disc': '곡에 디스크 이미지가 없습니다: 선곡 화면의 디스크가 비어 보입니다',
  'lint.art-missing.plate': '타이틀 플레이트 이미지 {src} 파일이 곡 폴더에 없습니다',
  'lint.plate-failed': '타이틀 플레이트를 만들 수 없습니다: {error}',
  'lint.plate-glyphs': '타이틀 플레이트 글꼴에 {chars} 글자가 없어 네모로 표시됩니다',
  'lint.plate-text': '타이틀 플레이트 문구는 "{text}"인데 곡 제목은 "{title}"입니다',
  'lint.art-missing.preview': '미리듣기 오디오 {src} 파일이 곡 폴더에 없습니다',
  'lint.preview-late':
    '미리듣기가 마지막 노트 뒤에 시작합니다: 선곡 화면에서 무음이 반복될 수 있습니다',
  'lint.song-meta': `{field, select,
    title {채보마다 제목이 다릅니다. 배포에는 NM 채보의 제목을 씁니다: "{value}"}
    subtitle {채보마다 부제가 다릅니다. 배포에는 NM 채보의 부제를 씁니다: "{value}"}
    artist {채보마다 아티스트가 다릅니다. 배포에는 NM 채보의 아티스트를 씁니다: "{value}"}
    genre {채보마다 장르가 다릅니다. 배포에는 NM 채보의 장르를 씁니다: "{value}"}
    other {채보마다 {field} 값이 다릅니다. 배포에는 NM 채보의 값을 씁니다: "{value}"}
  }`,
  'lint.chart-file-name':
    '{file} 파일은 {want} 이름으로 저장됩니다 (모드, 곡 키, 난이도에 따른 이름)',
  'lint.duplicate-chart': '{mode} {tier} 채보가 두 개 있습니다',
  'lint.mode-unsupported': '{mode} 채보는 아직 EZ2PORT로 배포할 수 없습니다 (기체 내보내기만 가능)',

  'lint.bga-not-movie':
    'BGA {src} 파일은 동영상이 아닙니다: EZ2PORT에서는 아무것도 표시되지 않습니다',
  'lint.art-missing.bga': 'BGA 동영상 {src} 파일이 곡 폴더에 없습니다',
  'lint.bga-unreadable': 'BGA {src} 파일을 읽을 수 없습니다: {error}',
  'lint.bga-codec': 'BGA {src} 파일은 재생되지 않습니다: {why}',
  'lint.bga-large':
    'BGA가 {w}x{h}입니다: EZ2PORT를 쓰는 기체에서 1280x960 동영상은 아무것도 그려지지 않았고, 640x480까지만 표시됩니다',
  'lint.bga-aspect': 'BGA가 {w}x{h}입니다: EZ2PORT는 640x480(4:3)으로 늘려 표시합니다',
  'lint.bga-short': 'BGA가 곡보다 {s} s 먼저 끝납니다: 반복 재생되지 않아 화면이 검게 됩니다',

  // Said after "BGA … 파일은 재생되지 않습니다:" and in the BGA panel.
  'movie.unknown': 'EZ2PORT가 열 수 있는 동영상이 아닙니다',
  'movie.avi.rewrap':
    'EZ2PORT Windows 빌드에는 AVI 리더가 없습니다. MP4나 MKV로 컨테이너만 바꾸세요 (영상은 다시 인코딩하지 않아도 됩니다)',
  'movie.avi.convert':
    'EZ2PORT Windows 빌드에는 AVI 리더가 없습니다. MP4(H.264)나 WebM(VP9)으로 변환하세요',
  'movie.container':
    'EZ2PORT Windows 빌드는 {container} 파일을 읽을 수 없습니다. MP4(H.264)나 WebM(VP9)으로 변환하세요',
  'movie.no-video': '영상 트랙을 찾을 수 없습니다',
  'movie.codec':
    'EZ2PORT Windows 빌드에는 {codec} 디코더가 없습니다 (H.264, MPEG-4 part 2, VP8, VP9, WMV만 있음). 변환하세요',

  'fix.snap-off-grid': '가장 가까운 EZ2 틱에 맞추기',
  'fix.lane-duplicates-to-bgm': '남는 노트를 배경음으로 이동',
  'fix.drop-bgm-copies': '배경음 쪽 사본 삭제',
  'fix.shorten-holds': '롱노트가 노트 앞에서 끝나도록 줄이기',
  'fix.align-start-bpm': '시작 BPM 맞추기',
  'fix.clamp-level': '레벨을 1-20 안으로',
  'fix.title-semicolon': '";" 대신 "," 쓰기',
  'fix.off-mode-to-bgm': '배경음으로 이동',
  'fix.clear-up': '일반 노트로 바꾸기',
  'fix.remove-unused-sounds': '쓰지 않는 사운드 삭제',
  'fix.lines-4-4': 'EZ2의 4/4 마디선 사용',
  'fix.scroll-legacy': '이 채보의 스크롤 변속으로 바꾸기',
  'fix.derive-key': '제목으로 만들기',
  'fix.category-custom': 'CUSTOM(48)에 넣기',
};
