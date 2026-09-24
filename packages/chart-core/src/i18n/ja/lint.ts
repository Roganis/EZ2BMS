// Japanese: see en/lint.ts. Terms follow docs/i18n-glossary.md.
//
// Two sentences are joined with 。 and the last has none, as the English has
// no full stop. "Chart info" is the drawer's name: 譜面情報. "The original
// game" (the cabinet's own executable) is 元のゲーム.

import type { lint as en } from '../en/lint';

export const lint: Record<keyof typeof en, string> = {
  'lint.level': 'レベル{level}はEZ2PORTの楽曲リストが使う1-20の範囲外です',
  'lint.bpm.start': '開始BPM{bpm}：0から1000の間でなければなりません',
  'lint.bpm': 'BPM{bpm}：0から1000の間でなければなりません',
  'lint.init-bpm': '開始位置のBPM変更（{bpm}）が開始BPM（{start}）と一致しません',
  'lint.bpm-same-tick': '2つのBPM変更（{a}、{b}）が同じEZ2ティックにあります',
  'lint.stops':
    'STOP{n}個：EZ2にはSTOPがないため、EZ2PORTでは時間が空くだけでスクロールは止まりません',
  'lint.scroll-rate':
    'スクロール変速{rate}：フィールドが止まるか逆走してしまいます（0より大きい値が必要です）',
  'lint.scroll-same-tick':
    '2つのスクロール変速（×{a}、×{b}）が同じEZ2ティックにあります。EZ2PORTのソートではどちらが残るか決まりません',
  'lint.scroll-count':
    'スクロール変速{n}個：EZ2PORTは（トラック順で）最初の{max}個だけを残し、残りを捨てます',
  'lint.scroll-legacy':
    '以前のインポートで残ったゲーム譜面のスクロール変速{n}個：再生とパブリッシュはできますが、この譜面自身のスクロール変速に変換するまで編集できません',
  'lint.off-mode': 'ノーツ{n}個が{mode}にないレーンにあり、EZ2PORTはBGMとして再生します',
  'lint.empty': 'この譜面にはまだプレイするノーツがありません',
  'lint.notes-limit': 'ノーツ{n}個：EZ2PORTが扱えるのは最大{max}個です',
  'lint.off-grid': 'EZ2ティック（1/48拍）の間にあるノーツ{n}個は、最大{worst}ティック丸められます',
  'lint.hold-kind-max':
    'ロングノート{n}個が、エンジンの数え方と判定の出し方が異なる種類（4、5、9-12）を使っています。完璧にプレイしてもぴったり100%にはなりません',
  'lint.same-pulse-sound':
    'ノーツ{n}個が同じサウンドの別のノーツと位置が重なっています。どのスライスが鳴るか曖昧です',
  'lint.lane-duplicates':
    'ノーツ{n}個が別のノーツと同じレーン・同じEZ2ティックにあります。1回の押下で両方は叩けません',
  'lint.note-in-hold': 'ロングノート{n}個が同じレーンの後ろのノーツに重なっています',
  // "up": the bmson field's name.
  'lint.up-notes':
    'リリース（up）ノーツ{n}個：EZ2には離したときの音がないため、通常のノーツとして鳴ります',
  'lint.lines':
    '譜面の小節線が4拍ごとではありません。EZ2PORTは譜面の指定にかかわらず4拍ごとに線を引きます',
  'lint.bms-judge':
    'judge_rank {rank}とtotal {total}はEZ2PORTが使わないBMSの設定です。判定とゲージは譜面情報で設定します',
  'lint.slots': 'サウンド{n}個：EZ2PORTのキー音スロット{max}個を超えています',
  'lint.slots.original':
    'サウンド{n}個：元のゲームが読み込めるのは最大{max}個です（EZ2PORTは問題ありません）',
  'lint.unused-sounds': 'サウンド{n}個がこの譜面のどのノーツにも使われていません',
  'lint.missing-sounds': 'ノーツが使うサウンド{n}個を読み込めません：{names}',
  'lint.mode-keyword':
    'EZ2PORTのbmsonインポーターはこの譜面を{mode}として読み込みます。パブリッシュはパッケージを自前で書き出すため、影響するのはsongsフォルダにbmsonをそのまま置いた場合だけです',
  'lint.mode-keyword.because':
    'EZ2PORTのbmsonインポーターは「{keyword}」があるため、この譜面を{mode}として読み込みます。パブリッシュはパッケージを自前で書き出すため、影響するのはsongsフォルダにbmsonをそのまま置いた場合だけです',
  'lint.title':
    'タイトルが{max}バイトを超えています。EZ2PORTの楽曲リストには先頭の{max}バイトだけが表示されます',
  'lint.title-semicolon':
    'タイトルに「;」が含まれており、song.iniはこれをコメントとして読みます。パブリッシュでは代わりに「,」を書き出します',

  'lint.song-key.none': '楽曲キーが必要です。EZ2PORTでのフォルダ名です（英小文字か数字で1-15文字）',
  'lint.song-key': '楽曲キー「{key}」は英小文字か数字の1-15文字でなければなりません',
  'lint.inside-songs-root':
    '楽曲フォルダがEZ2PORTのsongsフォルダ内にあります。パブリッシュで書き出したものとは別に、EZ2PORTがそのbmsonファイルを自分で取り込んでしまいます',
  'lint.no-charts': '楽曲に譜面がありません',
  'lint.chart-count': '譜面{n}個：1曲に入れられるのは最大{max}個です',
  'lint.song-invisible': 'EZ2PORTはレベル1以上のNM譜面がある楽曲しか一覧に表示しません',
  'lint.mode-invisible':
    '{mode}の譜面は表示されません。EZ2PORTは、そのモードにレベル1以上のNM譜面がある場合にだけ、そのモードの一覧に楽曲を表示します',
  'lint.category':
    'カテゴリ{category}はEZ2PORTが認識する範囲（1-48）外です。楽曲はCUSTOMに入ります',
  // "pages past": the mode's page keys jump over that category.
  'lint.category-unreachable':
    '{mode}のページ送りは{category}を飛ばすため、そのモードではこの楽曲の譜面を選べません',
  'lint.art-missing.disc': 'ディスク画像{src}が楽曲フォルダにありません',
  'lint.art-missing.eyecatch': 'アイキャッチ画像{src}が楽曲フォルダにありません',
  'lint.no-disc': '楽曲にディスク画像がありません。選曲画面のディスクが空白になります',
  'lint.art-missing.plate': 'タイトルプレート画像{src}が楽曲フォルダにありません',
  'lint.plate-failed': 'タイトルプレートを作成できません：{error}',
  'lint.plate-glyphs': 'タイトルプレートのフォントに{chars}の文字がないため、四角で表示されます',
  'lint.plate-text': 'タイトルプレートは「{text}」ですが、楽曲のタイトルは「{title}」です',
  'lint.art-missing.preview': 'プレビューの音声ファイル{src}が楽曲フォルダにありません',
  'lint.preview-late':
    'プレビューが最後のノーツより後から始まります。選曲画面で無音がループするかもしれません',
  'lint.song-meta': `{field, select,
    title {譜面ごとにタイトルが異なります。パブリッシュではNM譜面の「{value}」を使います}
    subtitle {譜面ごとにサブタイトルが異なります。パブリッシュではNM譜面の「{value}」を使います}
    artist {譜面ごとにアーティストが異なります。パブリッシュではNM譜面の「{value}」を使います}
    genre {譜面ごとにジャンルが異なります。パブリッシュではNM譜面の「{value}」を使います}
    other {譜面ごとに{field}が異なります。パブリッシュではNM譜面の「{value}」を使います}
  }`,
  'lint.chart-file-name':
    '{file}は{want}として保存されます（モード、楽曲キー、難易度に基づく名前）',
  'lint.duplicate-chart': '{mode} {tier}の譜面が2つあります',
  'lint.mode-unsupported': '{mode}はまだEZ2PORTへパブリッシュできません（筐体エクスポートのみ）',

  'lint.bga-not-movie': 'BGAの{src}は動画ではありません。EZ2PORTでは何も表示されません',
  'lint.art-missing.bga': 'BGA動画{src}が楽曲フォルダにありません',
  'lint.bga-unreadable': 'BGAの{src}を読み込めません：{error}',
  'lint.bga-codec': 'BGAの{src}は再生されません：{why}',
  'lint.bga-large':
    'BGAが{w}x{h}です。EZ2PORTの筐体では1280x960の動画は何も描画されず、表示できるのは640x480までです',
  'lint.bga-aspect': 'BGAが{w}x{h}です。EZ2PORTは640x480（4:3）に引き伸ばします',
  'lint.bga-short': 'BGAが楽曲より{s} s早く終わります。ループしないため、画面が黒くなります',

  // Said after 「BGAの…は再生されません：」 and in the BGA panel.
  'movie.unknown': 'EZ2PORTが開ける動画ではありません',
  'movie.avi.rewrap':
    'EZ2PORTのWindows版にはAVIリーダーがありません。コンテナだけMP4かMKVに変えてください（映像の再エンコードは不要です）',
  'movie.avi.convert':
    'EZ2PORTのWindows版にはAVIリーダーがありません。MP4（H.264）かWebM（VP9）に変換してください',
  'movie.container':
    'EZ2PORTのWindows版は{container}ファイルを読み込めません。MP4（H.264）かWebM（VP9）に変換してください',
  'movie.no-video': '映像トラックが見つかりません',
  'movie.codec':
    'EZ2PORTのWindows版には{codec}デコーダーがありません（あるのはH.264、MPEG-4 part 2、VP8、VP9、WMV）。変換してください',

  'fix.snap-off-grid': '最も近いEZ2ティックに合わせる',
  'fix.lane-duplicates-to-bgm': '余分なノーツをBGMへ移動',
  'fix.drop-bgm-copies': 'BGM側の重複を削除',
  'fix.shorten-holds': 'ロングノートをノーツの手前で終わるよう短くする',
  'fix.align-start-bpm': '開始BPMを合わせる',
  'fix.clamp-level': 'レベルを1-20に収める',
  'fix.title-semicolon': '「;」を「,」に置き換える',
  'fix.off-mode-to-bgm': 'BGMへ移動',
  'fix.clear-up': '通常のノーツにする',
  'fix.remove-unused-sounds': '未使用のサウンドを削除',
  'fix.lines-4-4': 'EZ2の4/4小節線を使う',
  'fix.scroll-legacy': 'この譜面のスクロール変速にする',
  'fix.derive-key': 'タイトルから作る',
  'fix.category-custom': 'CUSTOM（48）にする',
};
