// Japanese: see en/transfer.ts. Terms follow docs/i18n-glossary.md.
// A chart's tier (NM/HD/SHD/EX) is its 難易度, as in the glossary's "difficulty".

import type { transfer as en } from '../en/transfer';

export const transfer: Record<keyof typeof en, string> = {
  'import.game.noRoot': '先にEZ2PORTパネルでEZ2ACのデータフォルダを設定してください',
  'import.game.noSongs': '楽曲が見つかりません。sound/とsystem/が入っているフォルダですか？',

  'import.label': '楽曲をインポート',
  'import.title': 'インポート',
  'import.close': '閉じる',
  'import.tab.game': 'EZ2ACの曲',
  'import.search': 'タイトル検索',
  'import.reading': '楽曲テーブルを読み込み中…',
  'import.readAgain': '再読み込み',
  'import.game.bpm': '{bpm} BPM',
  'import.game.summary': '楽曲キー：{key} · カテゴリ：{category} · キー音{n}個',
  'import.game.chart': 'レベル{level} · ノーツ{notes}個',
  'import.game.hint':
    '楽曲を選んでください。譜面は新しい楽曲フォルダのbmsonファイルに、キー音はWAV（同じサンプル）になり、新しい楽曲キーが付きます。ゲーム本来のキーでパブリッシュすると、選曲画面でその楽曲が置き換わってしまいます。',

  'import.bms.pick': 'BMSファイルのフォルダ',
  'import.bms.folder': 'フォルダ',
  'import.bms.read': '読み込む',
  'import.bms.none': 'そのフォルダに.bms、.bme、.bml、.pmsファイルがありません',
  'import.bms.file': 'ファイル',
  'import.bms.songTitle': 'タイトル',
  // The file's text encoding.
  'import.bms.text': '文字コード',
  'import.bms.random': 'ランダム',
  'import.bms.lanes': 'レーン',
  'import.bms.mode': 'モード',
  'import.bms.tier': '難易度',
  'import.bms.notes': 'ノーツ{n}個',
  'import.bms.guess': 'バイト列からの推測',
  'import.bms.randomLine': '{line}行目の#RANDOM',
  'import.bms.keysInOrder': 'キー順に並べる',
  'import.bms.skip': 'このファイルを除外',
  'import.bms.clash': '{file}がすでに同じモードと難易度を使っています',
  'import.bms.taken': '重複',
  'import.bms.summary': '楽曲キー：{key} · {charts}譜面 · 使用ファイル{files}個',
  'import.bms.inPlace': 'BMSファイルと同じ場所に楽曲を書き出す（コピーなし）',

  'import.bmson.hint':
    'bmsonはそのまま開けます。そのフォルダを開いてください。古いbmson（0.21、BmsONE製）は1.0として読み込み、BMS式に番号付けされたレーン（{beat7k}、{beat10k}、どちらの番号付けも）はEZ2のレーンに移します。変更点は問題タブに表示されます。circus2bmsonの出力も同じように開けます。',
  'import.bmson.open': 'フォルダを開く…',

  'import.findings': '確認事項{n}件（問題タブに送られます）',
  'import.dest': '新規フォルダ',
  'import.choose': '選択…',
  'import.dest.pick': '新しい楽曲フォルダの保存先',
  'import.go': 'インポート',
  'import.going': 'インポート中…',
  'import.progress': '{done} / {total}ファイル',

  'import.nothing': 'インポートするものがありません',
  'import.clash': '{dir}にすでに{file}があります',
  'import.noDest': '新しい楽曲の保存先を選んでください',
  'import.copyFailed': 'キー音{n}個をコピーできませんでした：{file}',
  'import.done': '{n}譜面をインポートしました - 移せなかった内容は問題タブにあります',
  'import.failed': 'インポートに失敗しました：{error}',

  'export.label': '楽曲をエクスポート',
  'export.title': 'エクスポート',
  'export.close': '閉じる',
  'export.tab.cabinet': 'EZ2AC筐体',
  'export.tab.history': 'エクスポート履歴',

  'export.search': 'ゲームの楽曲を検索',
  'export.reading': '楽曲テーブルを読み込み中…',
  'export.readAgain': '再読み込み',
  'export.hint':
    '置き換えるゲームの楽曲を選んでください。筐体へのエクスポートは、ゲームに既にある楽曲を作り替えます。あなたの譜面がその楽曲の譜面と入れ替わり（ない難易度は追加）、song.binのレコードにはそのレベルとBPMが入り、新しいキー音は元のキー音の横に置かれます。ゲームのファイルで上書きされるのは譜面だけで、それもバックアップに残ります。',
  'export.otherSong':
    'この楽曲は{from}からインポートしたものです。{dir}にエクスポートすると、{dir}の譜面があなたの譜面に置き換わります。',

  'export.col.chart': '譜面',
  'export.col.becomes': 'ゲーム側ファイル',
  'export.col.level': 'レベル',
  'export.col.bpm': 'BPM',
  'export.col.size': 'サイズ',
  'export.chart.replaces': '置換',
  'export.chart.new': '新規',
  'export.chart.size': '{size} KB / 128 KB',
  'export.chart.skipped': '除外',

  'export.dest.game':
    'ゲームフォルダ{root}へ直接 - 置き換えるファイルはすべてバックアップに残ります',
  'export.dest.folder': 'ゲームと同じ構成の新しいフォルダへ（筐体にコピーする用）',
  'export.dest.new': '新規フォルダ',
  'export.choose': '選択…',
  'export.dest.pick': 'エクスポート用の空のフォルダ',
  'export.dest.unchanged': 'ゲームに既にあるキー音もコピー',
  'export.dest.songdb':
    'song.binはこのゲームのそのモードの楽曲テーブル全体です。同じゲームバージョンの筐体にだけコピーしてください。そうしないと、ほかの楽曲のレベルも一緒に変わります。各ファイルが何を置き換えるかは、フォルダ内のEZ2BMS-EXPORT.txtに書かれています。',

  'export.preparing': 'エクスポート内容を計算中…',
  'export.sounds':
    'キー音：新規{write}個、フォルダに既存{reused}個{missing, plural, =0 {} other {、欠落{missing}個}}{converted, plural, =0 {} other {（{converted}個を変換）}}',
  'export.songdb': '{mode} song.bin：',
  'export.songdb.bytes': '（{n}バイト変更）',
  'export.songdb.unchanged': '変更なし',
  'export.findings': '確認事項{n}件',
  'export.done':
    'ゲームにエクスポートしました：{replaced}個を置換、{added}個を追加。バックアップは{stamp}です。',
  'export.undo': 'このエクスポートを元に戻す',
  'export.wrote': '{dir}にファイル{files}個を書き込みました。',
  'export.go': 'エクスポート',
  'export.going': 'エクスポート中…',

  'export.noSong': '楽曲が開かれていません',
  'export.noChart': 'エクスポートする譜面を選んでください',
  'export.blocked.errors': '先に修正が必要なエラー{n}件',
  'export.blocked.noChart': 'この楽曲に入れられる譜面がありません',
  'export.blocked.noFolder': '新規フォルダを選んでください',
  'export.failed': 'エクスポートに失敗しました：{error}',
  // The executable's encryption keys: 鍵, not the song key (楽曲キー).
  'export.cabinet.noTables':
    'ゲームの譜面は実行ファイル内の鍵で暗号化されていますが、その鍵がありません：{why}',
  'export.cabinet.noExe':
    'ゲームの譜面は実行ファイル内の鍵で暗号化されていますが、その鍵がありません。EZ2PORTパネルで実行ファイルを設定してください',
  'export.cabinet.unreadable': '{file}を読み込めませんでした',
  'export.cabinet.soundsUnreadable': 'キー音{n}個を読み込めません：{files}',

  // EZ2BMS-EXPORT.txt: the two spaces after {file} line the notes up, as in English.
  'export.note.title': 'EZ2BMS 筐体エクスポート：{title} → sound/{dir}',
  'export.note.made': '{when}、ゲームフォルダ{root}を基準に作成しました。',
  'export.note.copy': 'ここにあるフォルダを筐体のゲームフォルダにコピーしてください。各ファイル：',
  'export.note.songdb':
    '{file}  （このモードのゲームの楽曲テーブル全体を置き換えます。同じゲームバージョンにだけコピーしてください）',
  'export.note.replaces': '{file}  （ゲームのファイルを置き換え）',
  'export.note.new': '{file}  （新規）',
  'export.note.sound': '{file}  （新しいキー音）',
  'export.note.own': '{file}  （ゲーム本来のもの、変更なし）',
  'export.note.reused': 'ほかに、ゲームに既にあるキー音{n}個をそのまま使用',

  'export.bms.hint':
    '譜面ごとにBMSを1つ（キー6-7を使う場合はBME）と、その横にすべてのサウンドを書き出します。WAVとOGGはそのままコピーし、それ以外（EZ2の.ssf、FLAC、MP3、ステムのスライス）はWAVにします。',
  'export.bms.writes': '出力ファイル',
  'export.bms.notes': 'ノーツ',
  'export.bms.lanes': 'レーン',
  'export.bms.mapEz2': 'EZ2 BME（ターンテーブル16、ペダル17、エフェクター18/19）',
  'export.bms.mapKeys': 'キー順に並べる（IIDX/beatプレイヤー向け）',
  'export.bms.text': '文字コード',
  'export.bms.encodingAuto': '自動（Shift-JIS → 韓国語 → UTF-8の順）',
  'export.bms.korean': '韓国語（CP949）',
  'export.bms.utf8': 'UTF-8（beatoraja）',
  'export.bms.ids': 'サウンド番号',
  'export.bms.idsAuto': '自動（36進数、1295個を超えたら62進数）',
  'export.bms.base': '{n}進数',
  'export.bms.summary': '{charts}譜面 · サウンド{sounds}個（コピー{copied}、作成{made}）',
  'export.bms.pick': 'BMSファイル用の空のフォルダ',

  'export.history.hint':
    '{root}へのエクスポートはすべて、置き換えたファイルを保存しています。復元するとそれらを元に戻し、追加したファイルを削除します - ただし、エクスポートが書き込んだままのファイルに限ります。',
  'export.history.hintNoRoot':
    'ゲームフォルダへのエクスポートはすべて、置き換えたファイルを保存しています。復元するとそれらを元に戻し、追加したファイルを削除します - ただし、エクスポートが書き込んだままのファイルに限ります。',
  'export.history.none': 'まだエクスポートはありません。',
  // applying: the export was cut off while writing, so 未完了 (unfinished) rather than "in progress".
  'export.backup.row':
    '{when} · ファイル{files}個 · {state, select, applying {未完了} applied {適用済み} restored {復元済み} other {{state}}}',
  'export.backup.restore': '復元',
  'export.backup.restored': '復元済み',
  'export.restore.conflicts':
    'エクスポート後にファイル{n}個が変更されています（{files}）。復元するとその変更は失われます。',
  'export.restore.anyway': 'それでも復元',
  'export.restore.done': '復元しました：{restored}個を戻し、{removed}個を削除',
  'export.restore.nothing': '復元するものはありません：ゲームには既に元のファイルがあります',
  'export.restore.failed': '復元に失敗しました：{error}',
};
