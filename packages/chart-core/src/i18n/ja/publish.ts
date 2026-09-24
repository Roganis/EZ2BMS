// Japanese: see en/publish.ts. Terms follow docs/i18n-glossary.md.
//
// "The original game" (the cabinet's own executable, as against EZ2PORT) is
// 元のゲーム. "Background sound" is BGMのサウンド; a "keyed sound" (a note's
// on a lane) is キー音. The halo is the plate panel's 光彩.

import type { publish as en } from '../en/publish';

export const publish: Record<keyof typeof en, string> = {
  'cabinet.size':
    '{file}は{bytes}バイトです。元のゲームはファイルを{max}バイトの領域に読み込むため、読み込めません（128 KB中{kb} KB）',
  'cabinet.slots':
    'キー音{n}個（スライスも1つずつ数えます）：元のゲームが読み込めるのは最大{max}個です',
  'cabinet.level': 'レベル{level}：ゲームのテーブルは1-20しか受け付けません',
  'cabinet.voice-cut':
    'BGMのサウンド{n}個が、筐体では同じトラックの次のサウンドで途切れます（元のゲームはトラックごとに1音だけ、EZ2PORTは両方を鳴らします）{unknown, plural, =0 {} other {（長さ不明のサウンド{unknown}個は未確認）}}',
  'cabinet.voice-cut.measure':
    'BGMのサウンド{n}個（最初は{measure}小節目）が、筐体では同じトラックの次のサウンドで途切れます（元のゲームはトラックごとに1音だけ、EZ2PORTは両方を鳴らします）{unknown, plural, =0 {} other {（長さ不明のサウンド{unknown}個は未確認）}}',
  'cabinet.voice-game':
    'BGMのサウンド{n}個がトラックの次のサウンドで途切れます（ゲーム本来の譜面どおり）',
  'cabinet.voice-game.measure':
    'BGMのサウンド{n}個（最初は{measure}小節目）がトラックの次のサウンドで途切れます（ゲーム本来の譜面どおり）',
  'cabinet.voice-lane':
    'キー音{n}個がレーンの次のノーツで途切れます（筐体ではプレイ時だけでなくオートプレイでも）',
  'cabinet.voice-lane.measure':
    'キー音{n}個（最初は{measure}小節目）がレーンの次のノーツで途切れます（筐体ではプレイ時だけでなくオートプレイでも）',
  'cabinet.repinned':
    'BGMノーツ{n}個はゲームのトラック（{mode}のレーン）に置けないため、別のトラックに置かれます',
  'cabinet.grown': 'BGMのサウンドが途切れないよう、譜面にトラックが{n}個追加されます',
  'cabinet.kept':
    'bmsonに置き場所のないレコード{n}個（スクロール、音量、拍子…）を、ゲームにあった位置へ書き戻します',
  'cabinet.name':
    '譜面ヘッダーの名前に、韓国語版Windows（CP949）で書けない文字があります：{chars}（?として書き込みます）',
  'cabinet.records-res':
    'ゲーム譜面自身のレコード（音量、マーク…）のうち{n}個がEZ2ティックの間にあります。分解能を手で変更しましたか？それぞれ最も近いティックに書き込みます',
  'cabinet.tier-new':
    '{mode} {tier}はこの楽曲に新しく追加されます。ゲームではレベル{level}として表示されます',
  'cabinet.2p': 'ゲームには{mode} {tier}の2人プレイ用ファイル（{file}）もあり、そのまま残します',
  'cabinet.gds':
    'ゲームフォルダに{file}がありません。{mode}のレーンはEZ2BMS独自のトラックに置きます',
  'cabinet.song-hidden':
    '{mode}：ゲームはNMにレベルがある楽曲だけを一覧に表示しますが、{song}にはこのモードのNMのレベルがありません',
  'cabinet.missing-sound':
    'キー音{n}個にファイルがありません（{names}）。ゲーム自身の欠けたサウンドと同じく、一覧には載せて無音にします',
  'cabinet.convert': 'キー音{n}個を16bit 44.1 kHzステレオに変換します（残りはそのまま）',

  'export.not-listed':
    'ゲームの{table}テーブルに{song}がありません（筐体エクスポートはゲームにあるものしか置き換えられません）',
  'export.second-chart': '2つ目の{mode} {tier}譜面',

  'publish.song-key': '楽曲キー「{key}」は英小文字か数字の1-15文字でなければなりません',
  'publish.no-charts': '楽曲には譜面が1つ以上必要です',
  'publish.duplicate-chart': '{mode} {tier}の譜面が2つあります',
  'publish.mode-unsupported': '{mode}はまだEZ2PORTへパブリッシュできません',
  'publish.tint.white': '白',
  'publish.tint.green': '緑（12th）',
  'publish.tint.cyan': '水色',
  'publish.tint.orange-halo': 'オレンジの光彩（11th）',
  'publish.tint.cyan-halo': '水色の光彩（15th）',

  'song.file.json': 'ez2bms.song.jsonは正しいJSONではありません（{error}）',
  'song.file.not-object': 'ez2bms.song.jsonにオブジェクトが含まれていません',
  'song.file.key': 'keyがテキストではないため、無視しました',
  'song.file.preview': 'previewはEZ2BMSが読めるプレビュー設定ではありません。そのまま残しました',
  'song.file.bga': 'bgaはEZ2BMSが読めるBGA設定ではありません。そのまま残しました',
  'song.file.plate': 'plateはEZ2BMSが読めるプレート設定ではありません。そのまま残しました',
  'song.file.art': '{field}はEZ2BMSが読める画像設定ではありません。そのまま残しました',
  'song.file.source': 'sourceはEZ2BMSが読めるインポート記録ではありません。そのまま残しました',
  'song.undo.info': '楽曲情報',

  'media.container.unknown': '不明',

  'data.exe.no-mz': '実行ファイルではありません（MZなし）',
  'data.exe.pe-range': 'PEヘッダーが範囲外です',
  'data.exe.not-pe': 'PEイメージではありません',
  'data.exe.not-32': '32ビットのPEイメージではありません',
  'data.exe.sections': 'セクションテーブルが範囲外です',
  'data.exe.packed':
    'キーテーブルのアドレスがどのセクションにもありません（PACKEDの実行ファイルではありませんか？）',
  'data.exe.truncated': '実行ファイルが途中で切れています',
  'data.exe.not-table':
    '抽出したデータが想定したキーテーブルではありません（別の、または改変された実行ファイルです）',
  'data.songdb.short': 'song.binが短すぎます',
  'data.songdb.magic':
    'song.binがEZSLで始まっていません。別の実行ファイルのテーブルか、song.binではありません',
  'data.songdb.header': 'song.binのヘッダーがファイルの末尾より先を指しています',
  'data.songdb.encrypted':
    'song.binは暗号化されています。アンパック済みのEZ2AC実行ファイルを指定してください',
  'data.songdb.unlisted': 'song.binに{key}がありません',
  'data.gds.no-slot': '[SlotN]セクションがありません',
  'data.pvi.no-general': '.pviではありません（[General]セクションなし）',
  'data.abm.short': 'ヘッダーを含むには短すぎます',
  'data.abm.magic': '.abmではありません（AWマジックなし）',
  'data.abm.version': 'このヘッダーを復号できる既知のXORテーブルがありません',
  'data.abm.bpp': '未対応のピクセルあたりビット数です（{bpp}）',
  'data.abm.size': 'ありえないサイズです（{w}x{h}）',
  'data.abm.data': 'ピクセルデータの開始位置がファイルの末尾より後にあります',
};
