# Translation glossary

EZ2BMS speaks English, Korean and Japanese. The English catalogs are the
source (`apps/editor/src/i18n/en/`, `packages/chart-core/src/i18n/en/`);
Korean and Japanese are typed against them. This page fixes the words both
translations use, so the same thing has one name on every screen, and says
why each was chosen. **The Korean and Japanese are drafted by an AI** (see
AI-DISCLOSURE.md): a native speaker who plays EZ2 should read them, and
corrections to this page come first, then the catalogs.

## Principles

- **The game's own words stay as the game writes them**: KOOL, COOL, GOOD,
  MISS, FAIL; the grades S4 … F; NM, HD, SHD, EX; the mode names
  (StreetMix, ClubMix …); the category labels (HOT, NEW … CUSTOM); BPM,
  STOP; EZ2PORT, EZ2AC, BMS, bmson. The cabinet shows them in Latin
  letters in every country.
- **File names, paths, `keys.ini` channel names, binding tokens and key
  caps** are never translated.
- **The words players already use**: the Korean BMS and EZ2 communities
  and the Japanese rhythm-game ones have settled names (채보, 키음, 롱노트;
  譜面, キー音, ロングノート). Those win over a dictionary translation.
- **Palette verbs stay ASCII** (`goto 32`, `bpm 174`, `scroll 1.5`): they
  are typed. The palette also finds every command by its English title.
- **Numbers keep their form**; units stay as symbols (ms, s, %, dBFS, px).

## Style

|                                     | Korean                                                                                                            | Japanese                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Sentences (toasts, hints, findings) | 합니다체: "저장했습니다", "열 수 없습니다"                                                                        | です・ます調: 「保存しました」「開けません」                                                                              |
| Buttons, menu items, commands       | a noun or the plain verb stem: "저장", "닫기", "다시 실행"                                                        | a noun or the dictionary form: 「保存」「閉じる」「やり直し」                                                             |
| Headings and labels                 | nouns                                                                                                             | nouns                                                                                                                     |
| Punctuation                         | Latin punctuation, a space between words                                                                          | full-width 、。（）「」 in Japanese text; no added spaces around Latin words                                              |
| A quoted name                       | “…”                                                                                                               | 「…」                                                                                                                     |
| A label, then its value             | `라벨: 값`                                                                                                        | full-width colon: 「ラベル：値」                                                                                          |
| Counting                            | 개 for most things (채보 {n}개)                                                                                   | 件 for problems, warnings, findings, rankings; 個 for sounds, files, options; charts as 「{n}譜面」; 枚 images; 本 movies |
| A particle after a value            | name the thing, then the particle: `{file} 파일을`, `{mode} 모드는` (을/를 would depend on how the value is read) |                                                                                                                           |
| Ellipsis for "opens a dialog"       | …                                                                                                                 | …                                                                                                                         |

Keep sentences as short as the English; the drawers are narrow.

## Terms

| English                                                      | Korean                                            | Japanese                                       | Note                                                      |
| ------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| chart                                                        | 채보                                              | 譜面                                           |                                                           |
| song                                                         | 곡                                                | 楽曲                                           | 曲 in short labels                                        |
| song folder                                                  | 곡 폴더                                           | 楽曲フォルダ                                   |                                                           |
| song key (the folder's name)                                 | 곡 키                                             | 楽曲キー                                       | not a keysound, not a keyboard key                        |
| note                                                         | 노트                                              | ノーツ                                         |                                                           |
| long note, hold                                              | 롱노트                                            | ロングノート                                   | "hold" in the English is the same thing                   |
| hold kind                                                    | 롱노트 종류                                       | ロングノートの種類                             | how EZ2 pays a hold's instalments                         |
| instalment                                                   | 분할 판정                                         | 分割判定                                       | a hold's judged ticks                                     |
| lane                                                         | 레인                                              | レーン                                         |                                                           |
| background (notes, sounds)                                   | 배경음                                            | BGM                                            | notes on no lane: they play by themselves                 |
| keysound                                                     | 키음                                              | キー音                                         |                                                           |
| sound (a file or channel)                                    | 사운드                                            | サウンド                                       |                                                           |
| slice                                                        | 슬라이스                                          | スライス                                       | the part of a sound one note plays                        |
| stem                                                         | 스템                                              | ステム                                         | a long track cut into slices                              |
| cut (a slice boundary)                                       | 컷                                                | カット                                         |                                                           |
| chop (to the grid)                                           | 자르기                                            | 分割                                           |                                                           |
| onset                                                        | 온셋                                              | オンセット                                     | where a sound's attack starts                             |
| strip (stem strip)                                           | 스트립                                            | ストリップ                                     | the waveform column beside the lanes                      |
| judgement                                                    | 판정                                              | 判定                                           |                                                           |
| gauge                                                        | 게이지                                            | ゲージ                                         |                                                           |
| level                                                        | 레벨                                              | レベル                                         |                                                           |
| difficulty (NM/HD/SHD/EX)                                    | 난이도                                            | 難易度                                         | the codes stay                                            |
| mode                                                         | 모드                                              | モード                                         |                                                           |
| turntable, scratch                                           | 턴테이블                                          | ターンテーブル                                 | "Scratch" as a channel name stays                         |
| pedal                                                        | 페달                                              | ペダル                                         |                                                           |
| effector                                                     | 이펙터                                            | エフェクター                                   |                                                           |
| measure                                                      | 마디                                              | 小節                                           |                                                           |
| beat                                                         | 박                                                | 拍                                             |                                                           |
| EZ2 tick                                                     | EZ2 틱                                            | EZ2ティック                                    | 1/48 of a beat                                            |
| snap, grid                                                   | 스냅, 그리드                                      | スナップ、グリッド                             |                                                           |
| scroll speed (Play view, %)                                  | 배속                                              | ハイスピード                                   | the player's setting                                      |
| scroll change (EZ2 type 6)                                   | 스크롤 변속                                       | スクロール変速                                 | a chart's own speed change                                |
| field (play field)                                           | 필드                                              | フィールド                                     |                                                           |
| autoplay                                                     | 오토플레이                                        | オートプレイ                                   |                                                           |
| test play                                                    | 테스트 플레이                                     | テストプレイ                                   |                                                           |
| record (mode), take                                          | 레코딩, 테이크                                    | レコーディング、テイク                         | playing along to place notes                              |
| Classic mode                                                 | 클래식 모드                                       | クラシックモード                               | BmsTWO's name                                             |
| brush (sound to place)                                       | 브러시                                            | ブラシ                                         |                                                           |
| knife tool                                                   | 나이프 도구                                       | ナイフツール                                   |                                                           |
| workbench                                                    | 워크벤치                                          | ワークベンチ                                   | the keysound grid                                         |
| Inspector                                                    | 인스펙터                                          | インスペクター                                 |                                                           |
| Issues                                                       | 문제                                              | 問題                                           | the drawer                                                |
| quick fix                                                    | 빠른 수정                                         | クイック修正                                   |                                                           |
| check (pre-flight)                                           | 점검                                              | チェック                                       |                                                           |
| publish (to EZ2PORT)                                         | 배포                                              | パブリッシュ                                   | writes the song into EZ2PORT's songs folder; not "export" |
| export                                                       | 내보내기                                          | エクスポート                                   |                                                           |
| import                                                       | 가져오기                                          | インポート                                     |                                                           |
| package (EZ2PORT's)                                          | 패키지                                            | パッケージ                                     |                                                           |
| cabinet                                                      | 기체                                              | 筐体                                           | the arcade machine                                        |
| game folder                                                  | 게임 폴더                                         | ゲームフォルダ                                 | the EZ2AC data folder                                     |
| title plate                                                  | 타이틀 플레이트                                   | タイトルプレート                               | the 256×32 title image                                    |
| disc (art)                                                   | 디스크                                            | ディスク                                       |                                                           |
| eyecatch                                                     | 아이캐치                                          | アイキャッチ                                   |                                                           |
| preview (audio)                                              | 미리듣기                                          | プレビュー                                     |                                                           |
| song select (wheel)                                          | 선곡 화면                                         | 選曲画面                                       |                                                           |
| category                                                     | 카테고리                                          | カテゴリ                                       |                                                           |
| rankings                                                     | 랭킹                                              | ランキング                                     |                                                           |
| controls, binding                                            | 조작 설정, 할당                                   | 操作設定、割り当て                             |                                                           |
| calibration, offset, latency                                 | 보정, 오프셋, 지연                                | 補正、オフセット、遅延                         |                                                           |
| device, pad                                                  | 장치, 패드                                        | デバイス、パッド                               |                                                           |
| undo, redo                                                   | 실행 취소, 다시 실행                              | 元に戻す、やり直し                             |                                                           |
| save, open, close                                            | 저장, 열기, 닫기                                  | 保存、開く、閉じる                             |                                                           |
| Preferences                                                  | 환경 설정                                         | 環境設定                                       |                                                           |
| log, report                                                  | 로그, 보고서                                      | ログ、レポート                                 |                                                           |
| update                                                       | 업데이트                                          | アップデート                                   |                                                           |
| backup, restore                                              | 백업, 복원                                        | バックアップ、復元                             |                                                           |
| song manager                                                 | 곡 관리                                           | 楽曲管理                                       |                                                           |
| title, subtitle, artist, genre                               | 제목, 부제, 아티스트, 장르                        | タイトル、サブタイトル、アーティスト、ジャンル |                                                           |
| tier (NM/HD/SHD/EX)                                          | 난이도                                            | 難易度                                         | as "difficulty"                                           |
| EZ2PORT's importer                                           | EZ2PORT 임포터                                    | EZ2PORTのインポーター                          | its own bmson reader                                      |
| wheel (as it turns)                                          | 휠                                                | ホイール                                       | the screen itself is 선곡 화면 / 選曲画面                 |
| crop                                                         | 크롭                                              | トリミング                                     | not 자르기 / 分割, which are "chop"                       |
| halo (plate glow)                                            | 글로우                                            | 光彩                                           |                                                           |
| CJK forms                                                    | 한자 자형                                         | 漢字の字形                                     |                                                           |
| songs folder (EZ2PORT's)                                     | songs 폴더                                        | songsフォルダ                                  | where packages go; not the song's own folder              |
| shipped song                                                 | 수록곡                                            | 収録曲                                         | a song the game has                                       |
| encryption keys (in the executable)                          | 암호 키                                           | 鍵                                             | not the song key                                          |
| text encoding                                                | 인코딩                                            | 文字コード                                     |                                                           |
| update (a song's earlier publish replaced)                   | 업데이트                                          | 更新                                           | not an app update (アップデート)                          |
| command palette, command                                     | 명령 팔레트, 명령                                 | コマンドパレット、コマンド                     |                                                           |
| font                                                         | 글꼴                                              | フォント                                       |                                                           |
| tap (a note that is not a long note)                         | 단노트                                            | 通常ノーツ                                     |                                                           |
| pulse (bmson's time unit)                                    | 펄스                                              | パルス                                         |                                                           |
| resolution (pulses a beat)                                   | 해상도                                            | 分解能                                         |                                                           |
| BPM change                                                   | BPM 변경                                          | BPM変化                                        |                                                           |
| mirror                                                       | 미러                                              | ミラー                                         |                                                           |
| velocity, pan, centre                                        | 벨로시티, 팬, 중앙                                | ベロシティ、パン、センター                     |                                                           |
| error, warning, info (a finding's level)                     | 오류, 경고, 정보                                  | エラー、警告、情報                             |                                                           |
| view (menu), Play view                                       | 보기, 플레이 화면                                 | 表示、プレイ画面                               |                                                           |
| zoom, zoom in, zoom out                                      | 줌, 확대, 축소                                    | ズーム、ズームイン、ズームアウト               |                                                           |
| listen (audition a sound)                                    | 듣기                                              | 試聴                                           |                                                           |
| recover (autosave)                                           | 복구                                              | 復元                                           |                                                           |
| record (an EZFF event record)                                | 레코드                                            | レコード                                       | 기록 would read as a score                                |
| track (EZFF), channel (BMS)                                  | 트랙, 채널                                        | トラック、チャンネル                           |                                                           |
| keysound slot                                                | 키음 슬롯                                         | キー音スロット                                 |                                                           |
| hidden note, mine (BMS)                                      | 투명 노트, 지뢰 노트                              | 不可視ノーツ、地雷ノーツ                       | the BMS communities' words                                |
| decryption keys                                              | 복호화 키                                         | 復号キー                                       | not the song key                                          |
| left out (dropped on import)                                 | 제외                                              | 除外                                           |                                                           |
| key (a sound, in Classic mode), un-key                       | 키음으로 만들기, 키음 해제                        | キー音化、キー音化の解除                       |                                                           |
| split, heal (a stem, in Classic mode)                        | 나누기, 잇다                                      | 切り分け、つなぐ                               |                                                           |
| a MIDI file's notes                                          | 노트                                              | ノート                                         | a chart's stay 노트 / ノーツ                              |
| swap sides                                                   | 1P / 2P 교체                                      | 1P/2P入れ替え                                  |                                                           |
| the original game (the cabinet's executable)                 | 원작 게임                                         | 元のゲーム                                     | as against EZ2PORT                                        |
| Chart info (drawer)                                          | 채보 정보                                         | 譜面情報                                       |                                                           |
| song list (EZ2PORT's)                                        | 곡 목록                                           | 楽曲リスト                                     |                                                           |
| unpacked executable                                          | 언팩한 실행 파일                                  | アンパック済みの実行ファイル                   |                                                           |
| Windows build                                                | Windows 빌드                                      | Windows版                                      |                                                           |
| judgement presets (shipped, engine default, common, lenient) | 공식 채보, 엔진 기본값, 자주 쓰는 값, 넉넉한 판정 | 公式譜面、エンジン既定値、よく使う値、甘め     |                                                           |
| gauge presets (default, forgiving, fast recovery)            | 기본, 완화, 빠른 회복                             | 標準、緩め、回復速め                           |                                                           |
