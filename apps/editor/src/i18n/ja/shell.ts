// Japanese: see en/shell.ts. Terms follow docs/i18n-glossary.md.

import type { shell as en } from '../en/shell';

export const shell: Record<keyof typeof en, string> = {
  'start.tag': 'EZ2PORTのための譜面制作ツール',
  'start.songs': '楽曲',
  'start.open': '楽曲フォルダを開く',
  'start.import': 'インポート…',
  'start.new': '新規楽曲',
  'start.keys': 'コマンド',
  'start.keysOpen': '開く',
  'start.web': 'ブラウザプレビュー：ファイルはメモリ上にのみあります',

  // "Song manager" (song.label) is 楽曲管理.
  'top.songTitle': '楽曲管理：情報、カテゴリ、全譜面（Ctrl+Shift+L）',
  'top.song': '楽曲',
  'top.charts': '譜面',
  'top.unsaved': '未保存',
  'top.willSaveAs': '保存すると{file}になります',
  'top.bpm': 'BPM',
  'top.pos': '位置',
  'top.time': '時間',
  'top.snap': 'スナップ',
  // The player's scroll speed (glossary: ハイスピード); the longest label on the bar.
  'top.speed': 'ハイスピード',
  'top.zoom': 'ズーム',
  'top.classicTitle':
    'クラシックモード：ノーツを置くと、その位置で鳴っているサウンドがキー音になります（Ctrl+Shift+K）',
  'top.classic': 'クラシック',
  'top.undo': '元に戻す（Ctrl+Z）',
  'top.redo': 'やり直し（Ctrl+Shift+Z）',
  'top.view': '表示',
  'top.edit': '編集',
  'top.play': 'プレイ',
  'top.commands': 'コマンド（Ctrl+K）',

  'status.notes': 'ノーツ{n}個',
  'status.background': 'BGM{n}個',
  'status.sounds': 'サウンド{n}個',
  'status.selected': '{n}個選択中',
  // {what} is the last undo step's name.
  'status.last': '直前：{what}',
  'status.classic': 'クラシック',
  'status.errors': 'エラー{n}件',
  'status.warnings': '警告{n}件',
  'status.ready': 'EZ2PORT準備完了',
  'status.running': 'EZ2PORT実行中',
  'status.khz': '{khz} kHz',
  'status.noAudio': 'オーディオデバイスなし',
  'status.browser': 'ブラウザプレビュー',

  'drawer.close': '閉じる',
  'drawer.tab.inspector': 'ノーツ',
  'drawer.tab.chart': '譜面',
  'drawer.tab.timing': 'タイミング',
  'drawer.tab.issues': '問題',
  'drawer.tab.port': 'EZ2PORT',

  'palette.label': 'コマンドパレット',
  'palette.placeholder': 'コマンドを入力。goto 32、bpm 174、snap 1/12、speed 300も使えます',
  'palette.none': '「{query}」に一致するコマンドはありません',

  'group.File': 'ファイル',
  'group.Edit': '編集',
  'group.View': '表示',
  'group.Play': 'プレイ',
  'group.Notes': 'ノーツ',
  'group.Timing': 'タイミング',
  'group.Chart': '譜面',
  'group.EZ2PORT': 'EZ2PORT',
  'group.Help': 'ヘルプ',
};
