// Japanese: see en/port.ts. Terms follow docs/i18n-glossary.md.
// EZ2PORT's songs folder (ez2port/songs, where packages go) is 「songsフォルダ」: 「楽曲フォルダ」
// is the song's own project folder in the glossary.

import type { port as en } from '../en/port';

export const port: Record<keyof typeof en, string> = {
  'publish.label': 'パブリッシュ',
  'publish.heading': 'EZ2PORTにパブリッシュ',
  'publish.noSong': '楽曲が開かれていません',
  'publish.pickRoot': 'EZ2PORTが楽曲を置くフォルダ',
  'publish.noRoot': 'EZ2PORTが楽曲を置くフォルダ（{dir}）を選んでください。',
  'publish.chooseRoot': 'songsフォルダを選択…',
  'publish.errors': '先に修正が必要な問題{n}件',
  'publish.showIssues': '問題タブで表示',
  'publish.preparing':
    'タイトルプレートとアートを描画し、全譜面をコンパイルし、songsフォルダの中身を読み込み中…',
  'publish.cancel': 'キャンセル',
  'publish.close': '閉じる',
  'publish.done': '完了',
  'publish.go': 'パブリッシュ',
  'publish.goOver': '上書きしてパブリッシュ',

  'publish.owner.new': '新規',
  // Replacing this song's own earlier publish: 更新, not the glossary's アップデート (an app update).
  'publish.owner.ours': '更新',
  'publish.owner.legacy': '旧EZ2BMSのパッケージ',
  'publish.owner.foreign': '別の楽曲のパッケージ',
  // A key the game's own songs use (収録曲 = a song the game ships with).
  'publish.owner.shipped': '収録曲のキー',
  'publish.note.new': 'このキーのパッケージはまだありません。',
  'publish.note.ours': 'この楽曲の前回のパブリッシュを置き換えます（.ez2bms-backupに保存）。',
  'publish.note.legacy': '楽曲IDのない旧EZ2BMSのパッケージです。この楽曲かもしれません。',
  'publish.note.foreign':
    '別のツールまたは楽曲が作ったフォルダです。置き換えると.ez2bms-backupにコピーを残します。',
  'publish.shipped':
    '「{key}」はゲームの収録曲の楽曲キーです。EZ2PORTはあらゆる場面でその楽曲の代わりにこのパッケージを再生してしまいます。別のキーを選んでください。',
  'publish.confirmForeign':
    '{folder}は別の楽曲のパッケージです。置き換えるには{key}と入力してください：',
  'publish.confirmLegacy': 'この楽曲で置き換える',
  'publish.blockedForeign': '別の楽曲のパッケージを置き換えるには{key}と入力してください',
  'publish.blockedLegacy': '旧EZ2BMSのパッケージの置き換えを確認してください',
  'publish.warnings': '警告{n}件：パブリッシュはできますが、先に確認してください',

  'publish.charts': '譜面',
  'publish.col.chart': '譜面',
  'publish.col.level': 'レベル',
  'publish.col.file': 'ファイル',
  'publish.col.scores': 'スコア',
  'publish.scores.kept': '維持',
  'publish.scores.reset': 'リセット（変更あり）',
  'publish.keysounds': 'キー音{n}個、16ビット音声で約{size} MB',

  'publish.wheel': '選曲画面',
  'publish.noDisc': 'ディスクなし',
  'publish.noEyecatch': 'アイキャッチなし',
  'publish.preview': 'プレビュー{from} + {length} s',
  'publish.previewOf': '{file}のプレビュー{from} + {length} s',
  'publish.previewPlay': '再生',
  'publish.previewStop': '停止',
  'publish.noPreview': 'プレビューなし：選曲画面でこの楽曲は無音になります',
  'publish.bga': 'BGA {src} → {file}（{from}から）',
  'publish.noBga': 'BGAなし',

  'publish.writing': 'キー音{n}個を切り出してパッケージを書き込み中…',
  'publish.written': '{key}をパブリッシュしました：{dir}にファイル{files}個',
  'publish.writtenKept':
    '{key}をパブリッシュしました：{dir}にファイル{files}個（ランキング{kept}件を維持）',
  'publish.writtenReset':
    '{key}をパブリッシュしました：{dir}にファイル{files}個（変更された譜面のランキング{reset}件をリセット）',
  'publish.writtenKeptReset':
    '{key}をパブリッシュしました：{dir}にファイル{files}個（ランキング{kept}件を維持、変更された譜面のランキング{reset}件をリセット）',
  'publish.missing': 'キー音の元ファイル{n}個を読み込めませんでした：{files}',
  'publish.retire': 'この楽曲は「{key}」としてもsongsフォルダに残っています。',
  'publish.retireButton': 'そちらを削除',
  'publish.retired': '{key}を削除しました（.ez2bms-backupに保存）',
  'publish.failed': 'パブリッシュに失敗しました：{error}',

  'port.web':
    'ブラウザプレビューではEZ2PORTの実行やsongsフォルダへの書き込みはできません。デスクトップアプリを使ってください。',
  'port.gameRoot': 'ゲームフォルダ（soundとsystemを含む）',
  'port.ez2play': 'ez2play',
  'port.exe': 'アンパック済み実行ファイル（任意）',
  'port.songsRoot': 'パブリッシュ先',
  'port.notSet': '未設定',
  'port.notFound': '見つかりません',
  'port.exeAuto': 'EZ2PORTに任せる',
  'port.choose': '選択…',
  'port.pickGame': 'EZ2ACのデータフォルダ',
  'port.pickEz2play': 'EZ2PORTのez2play',
  'port.pickExe': 'アンパック済みのEZ2AC実行ファイル',
  'port.pickSongs': 'EZ2PORTのsongsフォルダ',

  'port.playfield': 'プレイフィールド',
  'port.gameSkin': 'ゲーム本来のパネルで描画',

  'port.cache.heading': '長いサウンド',
  'port.cache.hint':
    '20 s以上のサウンド（ステム）はデコード済みのままディスクに保存し、楽曲を開くときやパブリッシュするときに再デコードしません。',
  'port.cache.cap': '使用するディスク容量（MB、0 = オフ）',
  'port.cache.clear': 'クリア',
  'port.cache.web': 'ブラウザプレビューでは使えません。',
  'port.cache.info': 'サウンド{n}個、{used} MB / {cap} MB',

  'port.probe.heading': 'このez2play',
  'port.probe.options': 'オプション{n}個',
  'port.probe.optionsSource': 'オプション{n}個 · ソース{commit}',
  'port.cap.songsRoot': '専用のsongsフォルダ',
  'port.cap.logFile': 'ログファイル',
  'port.cap.start': 'カーソル位置からテスト（--start）',
  'port.cap.skipReady': 'READYをスキップ（--no-ready）',
  'port.cap.viewer': 'ウィンドウを1つだけ再利用（--viewer）',
  'port.cap.result': '結果をEZ2BMSに返す（--result）',
  'port.cap.requested': 'EZ2PORTに要望済み',

  'port.go': '実行',
  'port.test': 'テスト',
  'port.auto': 'オート',
  'port.publish': '曲をパブリッシュ',

  'skin.noRoot': 'ゲームフォルダ未設定',
  'skin.off': 'オフ - ネオンスキンで描画',
  'skin.loading': 'パネルを読み込み中…',
  'skin.noPanel': '{dir}に{file}がありません',
  'skin.failed': '{error} - ネオンスキンで描画',
  'skin.missing': 'テクスチャ{n}個が見つかりません',
  'skin.notFound': '見つからないテクスチャ',
  'skin.reload': 'パネルを再読み込み',

  'run.label': 'EZ2PORTログ',
  'run.running': '実行中',
  'run.stop': '停止',
  'run.clear': 'クリア',
  'run.hide': '隠す',
  // usage: EZ2PORT rejected the command line.
  'run.outcome':
    '{outcome, select, finished {正常終了} failed {失敗} usage {引数エラー} skipped {スキップ} killed {強制終了} other {{outcome}}}',
  'run.finished': 'EZ2PORTは正常に終了しました。',
  'run.usage':
    'EZ2PORTがコマンドラインを解釈できませんでした（exit 2）。このビルドはEZ2BMSが想定するものより古いか新しい可能性があります。',
  'run.skipped': 'EZ2PORTが必要なゲームデータを見つけられませんでした（exit 77）。',
  'run.ended': 'EZ2PORTが終了しました：{outcome}。',
  'run.endedCode': 'EZ2PORTが終了しました：{outcome}（exit {code}）。',
  'run.testing':
    '{auto, select, true {EZ2PORTで{chart}をテスト中（オートプレイ、ハイスピード{speed}%）} other {EZ2PORTで{chart}をテスト中（ハイスピード{speed}%）}}',
  'run.testingFromCursor':
    '{auto, select, true {EZ2PORTで{chart}をカーソル位置からテスト中（オートプレイ、ハイスピード{speed}%）} other {EZ2PORTで{chart}をカーソル位置からテスト中（ハイスピード{speed}%）}}',
  'run.testingFromStart':
    '{auto, select, true {EZ2PORTで{chart}を最初からテスト中（オートプレイ、ハイスピード{speed}%） - このez2playにはまだ--startがありません} other {EZ2PORTで{chart}を最初からテスト中（ハイスピード{speed}%） - このez2playにはまだ--startがありません}}',
  'run.errors': '{chart}に先に修正が必要な問題が{n}件あります（問題タブを参照）',
  'run.noGame': '先にEZ2PORTタブでゲームフォルダとez2playを設定してください',

  'fix.done': '{fix}：完了（Ctrl+Zで元に戻せます）',
  'fix.doneAll': '{fix}：{n}譜面で完了',
  'fix.key': '楽曲キーを「{key}」にしました',

  'cmd.port.publish': 'EZ2PORTにパブリッシュ',
  'cmd.port.test': 'EZ2PORTでテスト',
  'cmd.port.testAuto': 'EZ2PORTで見る（オートプレイ）',
  'cmd.port.stop': 'EZ2PORTのテストを停止',
  'cmd.view.port': 'EZ2PORT設定',
  'cmd.view.issues': '問題（事前チェック）',
  'cmd.view.log': 'EZ2PORTログ',
};
