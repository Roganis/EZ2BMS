// Japanese: see en/host.ts. Terms follow docs/i18n-glossary.md.

import type { host as en } from '../en/host';

export const host: Record<keyof typeof en, string> = {
  'host.not-ez2play':
    '{path}はEZ2PORTのez2playではありません（ez2playのオプションが一つも含まれていません）',
  'host.changed': '{path}は確認後に変更されています。もう一度確認してください',
  'host.stale': '{path}はエクスポートを計画した時点から変わっています。計画し直してください',
  'host.not-empty': '{path}は空ではありません',
  'host.not-a-folder': '{path}はフォルダではありません',
  'host.no-backup': '{name}という名前のバックアップはありません',
  'host.backup-exists': '{name}という名前のバックアップはすでにあります',
  'host.exists': '{path}はすでに存在します',
  'host.not-a-file': '{path}はファイルではありません',
  'host.cannot-decode': 'デコードできません：{detail}',
  'host.audio-device': 'オーディオデバイス：{detail}',
  'host.not-an-image': 'EZ2BMSで読める画像（PNG、JPEG、BMP）ではありません：{detail}',
  'host.not-an-image-file': '{path}はEZ2BMSで読める画像（PNG、JPEG、BMP）ではありません：{detail}',
  'host.image-too-large': '{w}x{h}は大きすぎます（1辺最大{max}ピクセル）',
  'host.font-unreadable': 'フォント{path}を読み込めません：{error}',
  'host.not-a-font': '{path}はEZ2BMSで使えるフォントではありません',
  'host.no-cjk-font':
    'このテキストにはCJKフォントが必要ですが、インストールされていません（scripts/fetch-fonts.mjsを実行してください）',
  'host.no-update': 'インストールするアップデートがありません。先にアップデートを確認してください',
};
