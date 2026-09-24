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

|                                     | Korean                                                     | Japanese                                                                     |
| ----------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Sentences (toasts, hints, findings) | 합니다체: "저장했습니다", "열 수 없습니다"                 | です・ます調: 「保存しました」「開けません」                                 |
| Buttons, menu items, commands       | a noun or the plain verb stem: "저장", "닫기", "다시 실행" | a noun or the dictionary form: 「保存」「閉じる」「やり直し」                |
| Headings and labels                 | nouns                                                      | nouns                                                                        |
| Punctuation                         | Latin punctuation, a space between words                   | full-width 、。（）「」 in Japanese text; no added spaces around Latin words |
| A quoted name                       | "…"                                                        | 「…」                                                                        |
| Ellipsis for "opens a dialog"       | …                                                          | …                                                                            |

Keep sentences as short as the English; the drawers are narrow.

## Terms

| English                      | Korean               | Japanese               | Note                                                      |
| ---------------------------- | -------------------- | ---------------------- | --------------------------------------------------------- |
| chart                        | 채보                 | 譜面                   |                                                           |
| song                         | 곡                   | 楽曲                   | 曲 in short labels                                        |
| song folder                  | 곡 폴더              | 楽曲フォルダ           |                                                           |
| song key (the folder's name) | 곡 키                | 楽曲キー               | not a keysound, not a keyboard key                        |
| note                         | 노트                 | ノーツ                 |                                                           |
| long note, hold              | 롱노트               | ロングノート           | "hold" in the English is the same thing                   |
| hold kind                    | 롱노트 종류          | ロングノートの種類     | how EZ2 pays a hold's instalments                         |
| instalment                   | 분할 판정            | 分割判定               | a hold's judged ticks                                     |
| lane                         | 레인                 | レーン                 |                                                           |
| background (notes, sounds)   | 배경음               | BGM                    | notes on no lane: they play by themselves                 |
| keysound                     | 키음                 | キー音                 |                                                           |
| sound (a file or channel)    | 사운드               | サウンド               |                                                           |
| slice                        | 슬라이스             | スライス               | the part of a sound one note plays                        |
| stem                         | 스템                 | ステム                 | a long track cut into slices                              |
| cut (a slice boundary)       | 컷                   | カット                 |                                                           |
| chop (to the grid)           | 자르기               | 分割                   |                                                           |
| onset                        | 온셋                 | オンセット             | where a sound's attack starts                             |
| strip (stem strip)           | 스트립               | ストリップ             | the waveform column beside the lanes                      |
| judgement                    | 판정                 | 判定                   |                                                           |
| gauge                        | 게이지               | ゲージ                 |                                                           |
| level                        | 레벨                 | レベル                 |                                                           |
| difficulty (NM/HD/SHD/EX)    | 난이도               | 難易度                 | the codes stay                                            |
| mode                         | 모드                 | モード                 |                                                           |
| turntable, scratch           | 턴테이블             | ターンテーブル         | "Scratch" as a channel name stays                         |
| pedal                        | 페달                 | ペダル                 |                                                           |
| effector                     | 이펙터               | エフェクター           |                                                           |
| measure                      | 마디                 | 小節                   |                                                           |
| beat                         | 박                   | 拍                     |                                                           |
| EZ2 tick                     | EZ2 틱               | EZ2ティック            | 1/48 of a beat                                            |
| snap, grid                   | 스냅, 그리드         | スナップ、グリッド     |                                                           |
| scroll speed (Play view, %)  | 배속                 | ハイスピード           | the player's setting                                      |
| scroll change (EZ2 type 6)   | 스크롤 변속          | スクロール変速         | a chart's own speed change                                |
| field (play field)           | 필드                 | フィールド             |                                                           |
| autoplay                     | 오토플레이           | オートプレイ           |                                                           |
| test play                    | 테스트 플레이        | テストプレイ           |                                                           |
| record (mode), take          | 레코딩, 테이크       | レコーディング、テイク | playing along to place notes                              |
| Classic mode                 | 클래식 모드          | クラシックモード       | BmsTWO's name                                             |
| brush (sound to place)       | 브러시               | ブラシ                 |                                                           |
| knife tool                   | 나이프 도구          | ナイフツール           |                                                           |
| workbench                    | 워크벤치             | ワークベンチ           | the keysound grid                                         |
| Inspector                    | 인스펙터             | インスペクター         |                                                           |
| Issues                       | 문제                 | 問題                   | the drawer                                                |
| quick fix                    | 빠른 수정            | クイック修正           |                                                           |
| check (pre-flight)           | 점검                 | チェック               |                                                           |
| publish (to EZ2PORT)         | 배포                 | パブリッシュ           | writes the song into EZ2PORT's songs folder; not "export" |
| export                       | 내보내기             | エクスポート           |                                                           |
| import                       | 가져오기             | インポート             |                                                           |
| package (EZ2PORT's)          | 패키지               | パッケージ             |                                                           |
| cabinet                      | 기체                 | 筐体                   | the arcade machine                                        |
| game folder                  | 게임 폴더            | ゲームフォルダ         | the EZ2AC data folder                                     |
| title plate                  | 타이틀 플레이트      | タイトルプレート       | the 256×32 title image                                    |
| disc (art)                   | 디스크               | ディスク               |                                                           |
| eyecatch                     | 아이캐치             | アイキャッチ           |                                                           |
| preview (audio)              | 미리듣기             | プレビュー             |                                                           |
| song select (wheel)          | 선곡 화면            | 選曲画面               |                                                           |
| category                     | 카테고리             | カテゴリ               |                                                           |
| rankings                     | 랭킹                 | ランキング             |                                                           |
| controls, binding            | 조작 설정, 할당      | 操作設定、割り当て     |                                                           |
| calibration, offset, latency | 보정, 오프셋, 지연   | 補正、オフセット、遅延 |                                                           |
| device, pad                  | 장치, 패드           | デバイス、パッド       |                                                           |
| undo, redo                   | 실행 취소, 다시 실행 | 元に戻す、やり直し     |                                                           |
| save, open, close            | 저장, 열기, 닫기     | 保存、開く、閉じる     |                                                           |
| Preferences                  | 환경 설정            | 環境設定               |                                                           |
| log, report                  | 로그, 보고서         | ログ、レポート         |                                                           |
| update                       | 업데이트             | アップデート           |                                                           |
| backup, restore              | 백업, 복원           | バックアップ、復元     |                                                           |
