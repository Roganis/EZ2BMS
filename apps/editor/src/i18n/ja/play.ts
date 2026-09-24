// Japanese: see en/play.ts. Terms follow docs/i18n-glossary.md.
//
// What the cabinet itself shows stays in its capitals (FAST, SLOW, MAX
// COMBO, NOTES, GAUGE, CLEAR, FAILED); the editor's own words (AUTO PLAY,
// TEST PLAY, STOPPED) are Japanese.

import type { play as en } from '../en/play';

export const play: Record<keyof typeof en, string> = {
  'play.kindAuto': 'オートプレイ',
  'play.kindTest': 'テストプレイ',
  'play.bgmMuted': 'BGMミュート',
  'play.bgmOn': 'BGMオン',
  'play.soloOff': 'ソロ解除',
  'play.solo': 'ソロ：レーン{lane}',

  'hud.gauge': 'ゲージ{value}',
  'hud.fast': 'FAST',
  'hud.slow': 'SLOW',

  'result.label': 'リザルト',
  'result.untitled': '無題',
  'result.chart': '{chart} · レベル{level}',
  'result.rate': '{rate}% · {state, select, failed {FAILED} stopped {中断} other {CLEAR}}',
  'result.partial': 'プレイしたノーツ{n}個で評価',
  // Rows of the table under KOOL … FAIL: the cabinet's capitals.
  'result.maxCombo': 'MAX COMBO',
  'result.notes': 'NOTES',
  'result.gauge': 'GAUGE',
  'result.retry': 'リトライ',
  'result.close': '閉じる',

  'record.starting': 'カーソル位置からレコーディング…',
  'record.live': 'REC · 入力{n}回',
  'record.stopHint': 'RまたはEscで停止',
  'record.take': 'テイク',
  'record.notes': 'ノーツ{n}個',
  'record.classic': 'クラシック：鳴っている音をキー音化',
  'record.ok': '配置{n}個',
  'record.clash': '既存ノーツと重複{n}個',
  'record.silent': '音のない位置{n}個',
  'record.statsTitle': '入力とグリッドのずれ（入力オフセット適用後）',
  'record.stats': '平均{mean} ms · 中央値{median} ms · 早め{early} · 遅め{late}',
  'record.holdsFrom': '{field} ms以上はロングノート',
  'record.grid': 'グリッド',
  'record.exact': 'EZ2精密',
  'record.exactTitle': 'EZ2本来のグリッド：1/48拍',
  'record.countIn': 'カウントイン{field}拍',
  'record.metronome': 'メトロノーム',
  'record.muteLanes': 'レコーディング中はレーンをミュート',
  'record.keep': '採用',
  'record.retake': 'リテイク',
  'record.discard': '破棄',
  'record.noBrush':
    '先にレコーディングに使うサウンドを選んでください（またはクラシックモードをオンに）',
  'record.nothing': '何もレコーディングされませんでした',
  // Each `{x, plural, =0 {} …}` adds its part only when there is one.
  'record.kept':
    'テイクを採用：ノーツ{placed}個{clash, plural, =0 {} other {、既存ノーツと重複{clash}個}}{silent, plural, =0 {} other {、音のない位置{silent}個}}{refused, plural, =0 {} other {、音が変わるため除外{refused}個}}{shortened, plural, =0 {} other {、通常ノーツにしたロングノート{shortened}個}}',
  'record.discarded': 'テイクを破棄しました',
  'record.undoStep': 'テイクのレコーディング',

  'controls.title': '操作設定とタイミング',
  'controls.bindings': '割り当て',
  'controls.controllers': 'コントローラー',
  'controls.timing': 'タイミング',
  'controls.hint':
    'チャンネルごとに、キーまたはコントローラーのボタン・ハットを4つまで割り当てられます。{plus}を押してから入力してください。EZ2BMS独自の設定で、EZ2PORTの{file}は読み込むだけです。',
  'controls.laneTitle': 'この譜面のモードでのレーン',
  'controls.strum': 'ストラム',
  'controls.axis': '軸',
  'controls.remove': '削除',
  'controls.bindTitle': '押して割り当て',
  'controls.pressKey': 'キーかボタンを押してください…',
  'controls.bindAxisTitle': '回して軸を割り当て',
  'controls.turnIt': '回してください…',
  'controls.reversed': '反転',
  'controls.velocity': '位置ではなく速度',
  'controls.padError': 'コントローラーを使用できません：{error}',
  'controls.noPads':
    'コントローラーが見つかりません。接続すると、認識されしだいここに表示されます。',
  'controls.padShape': 'ボタン{buttons}個 · 軸{axes}個 · ハット{hats}個',
  'controls.readout': 'ボタン：{list}',
  'controls.debounce': 'チャタリング防止{field} ms',
  'controls.defaults': 'EZ2PORTの既定値',
  'controls.import': 'EZ2PORTからインポート',
  'controls.copy': 'keys.ini形式でコピー',
  'controls.done': '完了',
  'controls.already': '{token}は既にそこに割り当てられています',
  'controls.full': '1チャンネルの割り当ては{n}個までです。先に1つ削除してください',
  'controls.defaultsSet': 'EZ2PORTの既定の割り当てにしました',
  'controls.noPortKeys':
    'EZ2PORTのkeys.iniが見つかりません（データフォルダ、設定フォルダを確認しました）',
  'controls.imported': '{path}から割り当てをインポートしました',
  'controls.copied': 'keys.ini形式でコピーしました。EZ2PORTのkeys.iniに貼り付けてください',
  'controls.noClipboard': 'ここではクリップボードを使用できません',

  'calib.hint':
    'このPCでEZ2BMSの音・画面・入力がどれだけ遅れるかの補正です。EZ2PORTにはオフセットがなく、これらはエディター内でのプレイとレコーディング専用です。',
  'calib.sound': 'サウンドテスト',
  'calib.soundHint':
    'クリック音ごとに、キーかボタンのどれかをタップしてください（20回、最初の4回は拍をつかむため）。入力オフセットを設定します。',
  'calib.picture': '映像テスト',
  'calib.pictureHint':
    'フラッシュごとにタップしてください（無音）。映像オフセットを設定します。先にサウンドテストを行ってください。',
  'calib.start': '開始',
  'calib.taps': 'タップ{n}回',
  'calib.stop': '停止',
  'calib.land': 'タップのずれ：{offset}',
  'calib.offset': '{ms} ms{dir, select, early {早い} other {遅い}}',
  'calib.detail': '（タップ{used}回、ばらつき{spread} ms）',
  'calib.detailDropped': '（タップ{used}回、ばらつき{spread} ms、{dropped}回除外）',
  'calib.use': '{kind, select, sound {入力} other {映像}}オフセットに設定',
  'calib.failed':
    '拍に合ったタップが少なすぎて判定できません。{kind, select, sound {クリック音} other {フラッシュ}}ごとにタップして、もう一度試してください。',
  'calib.audioOffset': 'オーディオオフセット（ms）',
  'calib.pictureOffset': '映像オフセット（ms）',
  'calib.inputOffset': '入力オフセット（ms）',

  'cmd.play.toggle': 'カーソル位置から再生/停止',
  'cmd.play.test': 'カーソル位置からテストプレイ（自分のキーで、EZ2PORTと同じ判定）',
  'cmd.play.record':
    'レコーディング：カーソル位置から演奏し、テイクを採用（もう一度Rで停止、またはリテイク）',
  'cmd.input.controls': '操作設定とタイミング…（キー、コントローラー、オフセット）',
  'cmd.play.again': '最後に再生を始めた位置から再生し直す',
  'cmd.audio.muteBgm': 'BGMのミュート/解除',
  'cmd.audio.solo': 'ポインター下のレーンをソロ（もう一度で解除）',
};
