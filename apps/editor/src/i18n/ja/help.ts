// Japanese: see en/help.ts. Terms follow docs/i18n-glossary.md.

import type { help as en } from '../en/help';

export const help: Record<keyof typeof en, string> = {
  // As cmd.help.about, with its space.
  'about.label': 'EZ2BMS について',
  'about.lead': 'EZ2PORTとEZ2AC筐体のための、アーケード準拠の譜面エディタです。',
  'about.version': 'バージョン',
  'about.system': 'システム',
  'about.settings': '設定',
  'about.cache': 'キャッシュ',
  'about.log': 'ログ',
  'about.crashed':
    '前回の実行（{version}、{when}開始）は正常に終了しませんでした。最後の記録はログにあり、未保存の譜面は自動保存に残っています。',
  'about.errors': '今回の実行でエラー{n}件。最後のエラー：{last}',
  'about.noKey':
    'このビルドは自分でアップデートできません（アップデートキーなしでビルドされています）。',
  'about.checkNow': '今すぐ確認',
  'about.logHint':
    'ログはこのコンピューターの中にだけ残ります。問題を報告するときは、レポート（バージョン、今回の実行のエラー、ログの末尾）をコピーしてメッセージに貼り付けてください。',
  'about.openLogs': 'ログフォルダを開く',
  'about.copyReport': 'レポートをコピー',
  'about.close': '閉じる',
  'about.legal':
    'GPL-3.0。EZ2PORTと同じく、ゲームコントローラーの読み取りにSDL 3（zlibライセンス）を使用しています。EZ2BMSにはゲームのデータは一切含まれていません。お手持ちのファイルを読み込みます。',
  'about.logsFailed': 'ログフォルダを開けません：{error}',

  'diag.crashed': '前回、EZ2BMSが予期せず終了しました。原因はログに残っているかもしれません。',
  'diag.details': '詳細',
  'diag.failed': '問題が発生しました：{message}。詳細はログにあります（EZ2BMS について）。',
  'diag.copied': 'レポートをコピーしました。バグ報告やメッセージに貼り付けてください',

  'update.label': 'アップデート',
  'update.title': 'EZ2BMS {version}',
  'update.youHave': '現在のバージョンは{current}です。',
  'update.published': '{date}に公開されました。',
  'update.package':
    'このEZ2BMSはLinuxパッケージとしてインストールされており、パッケージマネージャーが更新します。新しいバージョンはリリースページからダウンロードしてください。',
  'update.openReleases': 'リリースページを開く',
  'update.installed': 'インストールしました。再起動しています…',
  'update.downloadingOf': 'ダウンロード中：{done} / {total} MB…',
  'update.downloading': 'ダウンロード中…',
  'update.saveFirst': '先に譜面を保存してください。インストールするとEZ2BMSが再起動します。',
  'update.install': 'インストールして再起動',
  'update.skip': 'このバージョンをスキップ',
  'update.later': 'あとで',
  'update.upToDate': 'EZ2BMSは最新です',
  'update.out': 'EZ2BMS {version}が公開されました（現在は{current}）。',
  'update.whatsNew': '更新内容',
  'update.checkFailed': 'アップデートを確認できません：{error}',
  'update.saveFirstToast': '先に譜面を保存してください。インストールするとEZ2BMSが再起動します',

  'cmd.help.about': 'EZ2BMS について',
  'cmd.help.updates': 'アップデートを確認',
  'cmd.help.report': '問題レポートをコピー（バージョン、エラー、ログの末尾）',
  'cmd.help.logs': 'ログフォルダを開く',
  'cmd.app.preferences': '環境設定（言語、アップデート）',

  'prefs.label': '環境設定',
  'prefs.language': '言語',
  'prefs.languageAuto': 'システムに合わせる（{name}）',
  'prefs.languageHint': '日本語訳は AI による下訳です。誤りがあればお知らせください。',
  'prefs.updates': '起動時に新しいバージョンを確認する（1日1回）',
  'prefs.close': '閉じる',
};
