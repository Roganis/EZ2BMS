// Japanese: see en/drawers.ts. Terms follow docs/i18n-glossary.md.

import type { drawers as en } from '../en/drawers';

export const drawers: Record<keyof typeof en, string> = {
  'inspector.hintPlace':
    'レーンをクリックすると、左で選んだサウンドでノーツを置きます。上にドラッグするとロングノートになります。',
  'inspector.hintDrag':
    'ノーツをドラッグで移動、端のドラッグで長さを変更します。右ドラッグで消去、{shift}+ドラッグで選択、{alt}+クリックでノーツのサウンドを取得します。',
  'inspector.hintKeys':
    '{l} ロングノート · {k} ロングノートの種類 · {m} ミラー · {lanes} レーン · {snap} スナップ · {b} BPM · {tab} プレイ画面 · {palette} その他すべて',
  'inspector.selection': '選択',
  // {n} only keeps the count's counter: the bold number is {count}.
  'inspector.summary':
    'ノーツ{count}{n, plural, other {個}} · {lanes}レーン{bgm, plural, =0 {} other { · BGM{bgm}個}} · {pos}から',
  'inspector.sound': 'サウンド',
  'inspector.several': '（複数）',
  'inspector.holdBeats': 'ロングノート（拍）',
  'inspector.lengthMixed': '混在',
  // A note that is not a long note.
  'inspector.lengthTap': '通常ノーツ',
  'inspector.lengthCovers': 'その長さでは他のノーツと重なります',
  'inspector.holdKind': 'ロングノートの種類',
  'inspector.kindUnknown': '{kind}（0として扱う）',
  // × is "times" here, not a multiplier: 回.
  'inspector.holdCounts': '判定{judged}回（始点と分割判定）、ノーツ{counts}個分として数えます。',
  'inspector.holdCountsShort':
    '判定{judged}回（始点と分割判定）、ノーツ{counts}個分として数えます。完璧にプレイしてもちょうど100%にはなりません。',
  'inspector.velocity': 'ベロシティ',
  'inspector.velocityDb': '{vel} · {db} dB',
  'inspector.pan': 'パン',
  'inspector.panCentre': 'センター',
  'inspector.panSide': '{side, select, left {L} other {R}} {db} dB',
  'inspector.hold': 'ロングノート',
  'inspector.mirror': 'ミラー',
  'inspector.delete': '削除',

  'chartInfo.mode': 'モード',
  'chartInfo.title': 'タイトル',
  'chartInfo.everyChart': '全譜面',
  'chartInfo.titleBytes': 'EZ2PORTの楽曲リストには先頭32バイトだけが残ります',
  'chartInfo.artist': 'アーティスト',
  'chartInfo.genre': 'ジャンル',
  'chartInfo.differs': '譜面によって{fields}が異なります。ここにはNM譜面の値を表示しています',
  'chartInfo.tier': '難易度',
  'chartInfo.makeTier': 'この譜面を{tier}にする（保存するとファイル名も変わります）',
  'chartInfo.level': 'レベル',
  'chartInfo.judgement': '判定',
  'chartInfo.custom': 'カスタム',
  'chartInfo.windowsHint':
    '判定幅は各ノーツのBPMにおける1/192拍ティック単位です。EZ2PORTは読み込み時に3を加えます。',
  'chartInfo.gauge': 'ゲージ',
  'chartInfo.song': '楽曲',
  'chartInfo.key': '楽曲キー（EZ2PORTでのフォルダ名）',
  'chartInfo.keyRule': '半角英小文字または数字で1～15文字',
  'chartInfo.category': '選曲画面のカテゴリ',
  'chartInfo.categoryHint': 'EZ2PORTはこの楽曲をこのカテゴリにだけ表示します（ALLには出ません）',

  'timing.startBpm': '開始BPM',
  'timing.resolution': '分解能',
  'timing.perBeat': '{n} / 拍',
  'timing.bpmChanges': 'BPM変化',
  'timing.remove': '削除',
  'timing.noBpm': 'なし。{key}キーでカーソル位置に追加します。',
  'timing.stops': 'STOP',
  // Pulses: bmson's time unit (resolution per beat).
  'timing.noStops': 'なし。{key}キーでカーソル位置に追加します（長さはパルス単位）。',
  'timing.stopWarn':
    'EZ2にはSTOPがありません。EZ2PORTでは代わりに時間の空白が入るため、スクロールは止まりません。',
  // The chart's own speed change (EZ2 type 6), not the player's ハイスピード.
  'timing.scroll': 'スクロール変速',
  'timing.scrollMultiplier': 'スクロール倍率',
  'timing.noScroll':
    'なし。{palette}で{command}と入力すると、カーソル位置からフィールドが1.5倍速でスクロールします。',
  'timing.legacy':
    '古いインポートで残されたゲーム譜面の変速があと{n}個あります。再生とパブリッシュには反映されます。「問題」タブで、ここで編集できる変化に変換できます。',
  'timing.scrollHint':
    'プレイヤーのハイスピードに掛かる倍率です。EZ2PORTは数フレームかけて滑らかに切り替え、フィールド上のすべてのノーツが一緒に動きます。タイミングは変わりません。',
  'timing.kept': 'ゲーム譜面の記録（{n}）',
  'timing.keptHint':
    'bmsonに入れる場所のない記録で、筐体向けエクスポートのために保持しています。エクスポート時に元のトラックへ書き戻します。読み取り専用で、分解能を変えると一緒に移動します。EZ2PORTでは使われません。',
  'timing.track': 'トラック{n}',
  'timing.andMore': '他{n}個',

  'issues.show': '表示',
  'issues.all': 'すべて {n}',
  'issues.errors': 'エラー {n}',
  'issues.warnings': '警告 {n}',
  // Info-level findings.
  'issues.notes': '情報 {n}',
  'issues.none': '修正点はありません。この楽曲はEZ2PORTで使える状態です。',
  'issues.fixAllTitle': '譜面ごとに1回の「元に戻す」で戻せます',
  'issues.fixAll': 'すべて修正',
  'issues.fixed': '{fix}：完了（Ctrl+Zで元に戻せます）',
  'issues.fixFailed': '修正に失敗しました：{error}',

  'channels.title': 'サウンド',
  'channels.filter': 'サウンド{n}個を絞り込み',
  'channels.importTitle': '楽曲にサウンドファイルをインポート（ウィンドウへのドロップでも可）',
  'channels.workbenchTitle': '楽曲の全サウンドを波形付きで表示（Ctrl+Shift+B）',
  'channels.renameTitle': '{name} - ダブルクリックで名前を変更',
  'channels.listen': '試聴',
  'channels.remove': '削除（未使用）',
  'channels.noMatch': '一致するサウンドはありません',
  'channels.none': 'サウンドはまだありません',
  'channels.more': '…他{n}個。絞り込みで探せます',
  'channels.unused': 'フォルダにあり、この譜面では未使用',
  'channels.addAll': 'すべて追加',
  'channels.add': '{name}を追加',
  'channels.added': 'サウンドを{n}個追加しました',

  'sounds.pickTitle': '楽曲にサウンドをインポート',
  'sounds.importFailed': 'インポートに失敗しました：{error}',
  'sounds.imported': 'サウンドを{n}個インポートしました',
  'sounds.alreadyThere': 'すでにフォルダにあります',
  'sounds.addedTo': '{chart}にサウンドを{n}個追加しました',
  'sounds.skipped': '{files}をスキップ（{error}）',
  'sounds.nothing': 'インポートするものがありません',
  'sounds.reloaded': 'サウンドを再読み込みしました',
  'sounds.replaced': '{n}譜面で{from}を{to}に置き換えました',
  'sounds.replaceStep': '置換',
  'sounds.allUsed': 'すべてのサウンドが譜面で使われています',
  'sounds.removed': '{charts}譜面から未使用のサウンドを{n}個削除しました',
  'sounds.removeStep': '削除',
  'sounds.cantRename': '{file}の名前を変更できません：{reason}',
  'sounds.renamed':
    '{charts, plural, =0 {} other {{charts}譜面で}}{from}を{to}に名前変更しました{unsaved, plural, =0 {} other {（未保存{unsaved}件）}}',
  // {names} are sound names the charts use that had no file and now find the
  // renamed one (chart-core's RenamePlan.adopts), not chart names.
  'sounds.adopted':
    '見つからなかったサウンド{n}個（{names}）が、このファイルで鳴るようになりました',
  'sounds.undo': '元に戻す',

  'project.pickFolder': '楽曲フォルダを開く',
  'project.saved': '{n}譜面を保存しました',
  'project.nothingToSave': '保存するものはありません',
  'project.keptOldName': '元のファイル名のままにしました - {detail}',

  'autosave.kept': '{file}の未保存の変更（{when}）が、EZ2BMSの終了後も残っています。',
  'autosave.recover': '復元',
  'autosave.recovered': '{file}を復元しました - 残すには保存してください',

  'app.commandFailed': '{command}：{message}',
  'app.noAudio': 'オーディオデバイスがありません - 無音で再生します（{error}）',
  'app.cannotOpen': 'EZ2BMSでは{file}を開けません',
  'app.notAChart': '楽曲を開きましたが、{file}はその譜面ではありません',
  'app.leaveUnsaved':
    '{song}に未保存の変更があります。それでも{what}を開きますか？変更は自動保存に残ります。',
  'app.open': '開く',
  'app.startBpm': '開始BPMを{bpm}にしました',
  'app.openFailed': '{dir}を開けません：{error}',
  'app.newSongFolder': '新しい楽曲のフォルダ（サウンドが入っていても構いません）',
  'app.snapArg': '{verb}には{grids}のいずれかを指定します',
  'app.speedArg': '{verb}は50-999 %で指定します',
  'app.gotoArg': '{verb}には小節番号を指定します',

  'cmd.file.open': '楽曲フォルダを開く…',
  'cmd.file.save': '保存',
  'cmd.file.newSong': '新規楽曲…',
  'cmd.file.import': '楽曲をインポート…（EZ2AC、BMS、bmson）',
  'cmd.file.exportCabinet': 'EZ2ACへエクスポート…（ゲームにある楽曲へ）',
  'cmd.file.exportBms': 'BMSとしてエクスポート…',
  'cmd.file.exportRestore': '筐体向けエクスポートを元に戻す…',
  'cmd.song.clearImportNotes': 'インポート時のメッセージを消去（問題から削除）',
  'cmd.file.close': '楽曲を閉じる',

  'cmd.edit.undo': '元に戻す',
  'cmd.edit.redo': 'やり直し',
  'cmd.edit.selectAll': 'すべてのノーツを選択',
  'cmd.edit.deselect': '選択を解除',
  'cmd.edit.delete': '選択したノーツを削除',

  'cmd.view.palette': 'コマンドパレット',
  'cmd.view.togglePlay': '編集 / プレイ画面の切り替え',
  'cmd.view.snapFiner': 'スナップを細かく',
  'cmd.view.snapCoarser': 'スナップを粗く',
  'cmd.view.snap': 'スナップを指定…',
  'cmd.view.zoomIn': 'ズームイン',
  'cmd.view.zoomOut': 'ズームアウト',
  'cmd.view.speed': 'ハイスピード設定…',
  'cmd.view.side': 'P1 / P2の表示を入れ替え',
  'cmd.view.gameSkin': 'ゲームスキンのオン / オフ',
  'cmd.view.left': 'サウンド一覧の表示 / 非表示',
  'cmd.view.workbench': 'キー音ワークベンチ',
  'cmd.view.songManager': '楽曲管理（情報、カテゴリ、全譜面）',
  'cmd.view.inspector': 'インスペクター',
  'cmd.view.chartInfo': '譜面情報',
  'cmd.view.timing': 'タイミング',
  'cmd.view.goto': '小節へ移動…',
  'cmd.view.start': '先頭へ移動',
  'cmd.view.end': '最後のノーツへ移動',
  'cmd.view.stepUp': 'カーソルを1スナップ上へ',
  'cmd.view.stepDown': 'カーソルを1スナップ下へ',
  'cmd.view.measureUp': 'カーソルを1小節上へ',
  'cmd.view.measureDown': 'カーソルを1小節下へ',

  'cmd.chart.new': '新規譜面…',
  'cmd.sounds.import': 'サウンドをインポート…',
  'cmd.sounds.reload': 'サウンドファイルを再読み込み（他のプログラムで編集した後に）',
  'cmd.sounds.removeUnused': 'すべての譜面から未使用のサウンドを削除',
  'app.switchChart': '譜面{n}に切り替え',
};
