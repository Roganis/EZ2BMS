// Japanese: see en/io.ts. Terms follow docs/i18n-glossary.md.
// An EZFF record is レコード; a bmson pulse is パルス; a BMS tap is 通常ノーツ,
// a hidden note 不可視ノーツ and a mine 地雷ノーツ, as Japanese BMS players say.
// The English colon is ：; like the English, no closing 。.

import type { io as en } from '../en/io';

export const io: Record<keyof typeof en, string> = {
  // ---- Opening a bmson (io/bmson) ----
  'open.upgraded':
    '{file}はbmson {version}です：bmson 1.0として読み込みました。保存すると1.0で書き出します',
  'open.read': '{path}：{problem}',
  'open.read.again': '{path}：{problem}（同様の問題がほかに{more}件）',
  'open.read.more': '{file}の読み込みで、ほかに{n}種類の問題があります',
  'open.legacy':
    '{file}のレーン番号は旧方式（{hint}{numbering, select, spec {、2Pキーがx 9-13のbmson仕様の番号} ez2 {、2Pキーがx 11-15のEZ2の番号} other {}}）です：{moved}個のノーツを{mode}のレーンへ移動しました',
  'open.legacy.bgm':
    '{file}のレーン番号は旧方式（{hint}{numbering, select, spec {、2Pキーがx 9-13のbmson仕様の番号} ez2 {、2Pキーがx 11-15のEZ2の番号} other {}}）です：{moved}個のノーツを{mode}のレーンへ移動し、{mode}にないレーンの{bgm}個はBGMにしました',
  'open.legacy.ambiguous':
    '{file}の2Pノーツはすべてx 11-13にあり、EZ2の番号では2Pキー1-3、bmson仕様の番号では3-5にあたります。EZ2PORTと同じくキー1-3として読み込みました。2レーンずれている場合は、選択してAlt+→で移動してください',

  'open.not-json': 'JSONではありません：{error}',
  'open.not-object': 'JSONオブジェクトではありません',
  'open.not-bmson':
    '"version"がなく、bmson 0.21でもありません：EZ2BMSが読み込めるbmsonではありません',

  // Said after a path: "it was not X, so ..." in one clause.
  'open.bad.string': '文字列ではないため、記述どおり残しました',
  'open.bad.number': '数値ではないため、記述どおり残しました',
  'open.bad.strings': '文字列の配列ではないため、記述どおり残しました',
  'open.bad.judgement': 'KOOL/COOL/GOOD/MISSの4つの数値ではないため、記述どおり残しました',
  'open.bad.life': 'COOL/GOOD/MISS/FAILの4つの数値ではないため、記述どおり残しました',
  'open.bad.tier': 'NM、HD、SHD、EXのいずれでもないため、記述どおり残しました',
  'open.bad.boolean': '真偽値ではないため、記述どおり残しました',
  'open.bad.byte': '0-255の整数ではないため、記述どおり残しました',
  'open.bad.info': 'ないか、オブジェクトではありません',
  'open.bad.list': '配列ではないため、無視しました',
  'open.bad.object': 'オブジェクトではないため、無視しました',
  'open.bad.channel': 'オブジェクトではないため、除外しました',
  'open.bad.event': '数値のyを持つイベントではないため、除外しました',
  'open.bad.bpm': '数値のbpmがないBPMイベントのため、除外しました',
  'open.bad.stop': '数値のdurationがないSTOPのため、除外しました',
  'open.bad.scroll': '数値のrateがないスクロール変速のため、除外しました',
  'open.bad.scrolls': 'スクロール変速のリストではないため、そのまま残しました',
  'open.bad.note': '数値のxとyがないノーツのため、除外しました',
  'open.bad.l': '数値ではないため、0に置き換えました',
  'open.bad.c': '真偽値ではないため、falseに置き換えました',
  'open.bad.bga-header': '数値のidと文字列のnameがないBGAヘッダーのため、除外しました',
  'open.bad.bga-event': '数値のidがないBGAイベントのため、除外しました',

  'text.not-utf8': '正しいUTF-8ではありません',

  // ---- The game's own charts (io/ez) ----
  'ez.songdb': '{mode}のsong.bin：{error}',
  'ez.no-exe': '実行ファイルが設定されていません',

  // radio/CV2: the game's modes EZ2BMS has no editor for.
  'ez.skip.mode':
    '{file}：EZ2BMSが編集するモードの譜面ではありません（ラジオモードとCV2モードは対象外です）',
  'ez.skip.players': '{file}：2人用の譜面です。ゲームがプレイするのは1人用のファイルです',
  'ez.skip.tier': '{file}：ステージ譜面か派生譜面で、4つの難易度のいずれでもありません',
  'ez.skip.second': '{file}：2つ目の{mode} {tier}譜面です',
  'ez.skip.error': '{file}：{error}',
  // "keys" here are decryption keys: 復号キー, not a song key or a key cap.
  'ez.encrypted':
    '暗号化されています。復号キーはアンパック済みのEZ2AC実行ファイル内にあります（{why}）',
  'ez.encrypted.no-exe':
    '暗号化されています。復号キーはアンパック済みのEZ2AC実行ファイル内にあります（実行ファイルが設定されていません）',
  'ez.key':
    '楽曲キーは{key}です：「{orig}」と「{derived}」はゲーム自身のキーで、どちらかでパブリッシュするとその楽曲を置き換えてしまいます',

  // The .ezi's MIDI-like names (C#0) give a slot number; EZ2PORT reads each as 0.
  'ez.legacy-ezi':
    'キー音リストで{n}個の番号がMIDIの音名（C#0）で書かれています：音名から番号に換算して読み込みましたが、EZ2PORTはそうしません（すべて0番として鳴らします）',
  'ez.no-ezi': '.eziがありません：どのノーツにもサウンドがありません',
  'ez.no-ini':
    '.iniがありません：ゲームと同じく、エンジン既定の判定（6/24/36/72）とゲージを使います',
  'ez.level': 'レベル{level}：EZ2PORTの楽曲リストには1-20が必要なため、{set}に設定しました',
  'ez.level.none':
    'レベルがありません：EZ2PORTの楽曲リストには1-20が必要なため、{set}に設定しました',
  'ez.tempo':
    '{n}個のティックにテンポレコードが2つあります：EZ2PORTが使う方（最後のもの）を残しました',
  'ez.scroll':
    'スクロール速度の変更{n}個：EZ2PORTではそこからスクロールが速く、または遅くなります。譜面のスクロール変速として取り込みました',
  'ez.kept.scroll':
    '倍率が数値でないスクロールレコード{n}個：筐体向けエクスポートのために保持し、再生もパブリッシュもしません',
  'ez.kept.volume': 'トラック音量レコード{n}個：譜面内に保持し、パブリッシュしません',
  'ez.kept.beats': '小節あたりの拍数レコード{n}個：譜面内に保持し、パブリッシュしません',
  'ez.kept.mark': 'マークレコード{n}個：譜面内に保持し、パブリッシュしません',
  // stop: the game's record type 7, named as its tag (not a BMS/bmson STOP).
  'ez.kept.stop': 'stopレコード（エンジンは無視）{n}個：譜面内に保持し、パブリッシュしません',
  'ez.kept.tempo':
    '0-1000 BPM外のテンポレコード（エンジンは無視）{n}個：譜面内に保持し、パブリッシュしません',
  'ez.kept.unknown': 'EZ2BMSが知らない種類のレコード{n}個：保持し、パブリッシュしません',
  'ez.kept.length':
    '長さのあるBGMノーツ{n}個：x_lenとして保持します。パブリッシュ時はゲームと同じく通常ノーツとして書き出します',
  'ez.missing-sound': 'ゲームフォルダにないキー音{n}個：{names}',
  'ez.unlisted':
    '.eziにないキー音スロット{n}個（{slots}）を使うノーツがあります：ゲームではそれらの音は鳴りません',
  'ez.shared-voice':
    '複数のスロットに登録されたキー音{n}個：EZ2BMSと再パブリッシュした楽曲では1ファイルが同時に1音しか鳴らないため、2つが同時に鳴ると互いに切れます',

  'ez.read.short': 'EZFFヘッダーには短すぎます',
  'ez.read.not-ezff': 'EZFFではありません（暗号化されたままではありませんか？）',
  'ez.read.version': '未対応のEZFFバージョンです（{version}）',
  'ez.read.tracks': 'トラック数が異常です（{n}）',
  'ez.read.track-header': 'トラック{track}のヘッダーがファイル末尾を超えています',
  'ez.read.not-eztr': 'トラック{track}のヘッダーがEZTRではありません',
  'ez.read.track-data': 'トラック{track}のデータがファイル末尾を超えています',
  'ez.ezi.note': 'ノーツ番号{note}がキー音テーブルの範囲（0-{max}）外です',
  'ez.ezi.empty': 'キー音が1つも登録されていません',

  // Tags stay as short as the English; stop, bpm, ×, NaN and # as written.
  'ez.record.volume':
    'トラック{track}の音量{value}：筐体はこの音量でトラックをミックスしますが、EZ2PORTはすべてのトラックを最大音量で再生します',
  'ez.record.volume.tag': '音量{value}',
  'ez.record.beats':
    'トラック{track}の小節あたりの拍数{value}：筐体向けに保持しています。EZ2PORTは読みません',
  'ez.record.beats.tag': '{value}拍',
  'ez.record.mark': 'トラック{track}のマーク：筐体向けに保持しています。EZ2PORTは読みません',
  'ez.record.mark.tag': 'マーク',
  'ez.record.stop':
    'トラック{track}のstopレコード：筐体向けに保持しています。ゲームはログに記録するだけです',
  'ez.record.stop.tag': 'stop',
  'ez.record.tempo':
    'トラック{track}のテンポ{bpm}：0-1000の範囲外のためエンジンは破棄します。筐体向けに保持しています',
  'ez.record.tempo.tag': 'bpm {bpm}',
  'ez.record.scroll':
    '旧バージョンのインポートで保持されたトラック{track}のスクロール変速（×{rate}）：再生・パブリッシュされます。問題リストから譜面自身のスクロール変速にできます',
  'ez.record.scroll.tag': '×{rate}',
  'ez.record.nan':
    'トラック{track}の、倍率が数値でないスクロールレコード：筐体向けに保持し、再生もパブリッシュもしません',
  'ez.record.nan.tag': '× NaN',
  'ez.record.other':
    'トラック{track}のタイプ{type}のレコード（EZ2BMSが知らない種類）：筐体向けに保持しています',
  'ez.record.other.tag': '#{type}',

  // ---- Reading BMS (io/bms) ----
  'bms.line': '{line}行目：{problem}',
  'bms.random-number': '{header}に数値がありません',
  'bms.if-no-random': '前に#RANDOMがない#IF：その中の行は読み飛ばします',
  'bms.if-open': '前の#IFが閉じる前の#IF：前の#IFを閉じました',
  'bms.elseif': '#IFのない#ELSEIF',
  'bms.else': '#IFのない#ELSE',
  'bms.endif': '#IFのない#ENDIF',
  'bms.endrandom': '#RANDOMのない#ENDRANDOM',
  'bms.case': '#SWITCHの外の{header}',
  'bms.skip': '#SWITCHの外の#SKIP',
  'bms.endsw': '#SWITCHのない#ENDSW',
  'bms.odd': '{object}：文字数が奇数です。最後の1文字は無視します',
  'bms.not-number': '{header}の値が数値ではありません',

  'bms.measure-length': '{measure}小節目の長さ「{length}」は正の数ではないため、1とみなしました',
  'bms.level': '#PLAYLEVEL {level}：EZ2PORTの楽曲リストには1-20が必要なため、{set}に設定しました',
  'bms.level.none':
    '#PLAYLEVELがありません：EZ2PORTの楽曲リストには1-20が必要なため、{set}に設定しました',
  'bms.no-bpm': '使える#BPMがありません：開始テンポを{bpm}としました',
  'bms.bad-refs':
    'ファイルで定義されていない#BPMxx/#STOPxxを参照するテンポ・STOP変更{n}個：除外しました',
  'bms.stops':
    '{n}個のSTOP：EZ2にはSTOPがありません。パブリッシュ時はそれぞれ空白の区間になり、スクロールは止まりません',
  'bms.ln-end': 'チャンネル{channel}のロングノートに終点がありません：通常ノーツにしました',
  'bms.lntype': '#LNTYPE {lntype}はEZ2BMSが読める値ではないため、1として読みました',
  'bms.bga-images':
    'BGAが画像です：EZ2PORTは動画は再生しますが、画像は再生しません。譜面内に保持します',
  'bms.rounding':
    '小節の長さとノーツの間隔に、EZ2BMSが扱うより細かいグリッドが必要です：1拍240パルスで配置しました。ファイル上の位置からのずれは最大{worst}パルスです',
  'bms.hidden': '不可視ノーツ{n}個（3x/4x、叩いたときだけ鳴る）：除外しました',
  'bms.hidden.background': '不可視ノーツ{n}個（3x/4x、叩いたときだけ鳴る）：BGMにしました',
  'bms.mines': '地雷ノーツ{n}個（D/E）：EZ2にはないため除外しました',
  // {map} is a lane layout's name (EZ2 BME, キー順): "…の配置".
  'bms.unmapped':
    '{map}の配置にレーンがないチャンネル{n}個（{channels}）：そのノーツはBGMになります',
  'bms.off-mode': 'このモードにないレーンのノーツ{n}個：BGMにしました',
  'bms.other-channels': '読み込まなかったチャンネル{n}個（{channels}）：EZ2では使いません',
  'bms.scroll': '{header}の変更：EZ2にはないため除外しました',
  'bms.undefined-wav': 'ノーツがファイルで定義されていない#WAVのID{n}個を使っています：{ids}',
  'bms.missing-sound': 'フォルダにないサウンドファイル{n}個：{names}',
  'bms.random': 'ランダム選択{n}個（#RANDOM/#SWITCH）：{choices}',
  'bms.random.choice': '{line}行目は{max}通りのうち{value}',
  'bms.random.list': '{list}、{item}',
  'bms.clash': '{file}：{mode} {tier}譜面はすでに{other}です。別の難易度を選んでください',
  'bms.encoding-guess':
    'テキストエンコーディングは推測です（{encoding}）：タイトルやサウンド名がおかしい場合は、別のエンコーディングでインポートし直してください',
  'bms.map.keys': 'キー順',

  // ---- Writing BMS (io/bms/write.ts, export.ts) ----
  'bmsw.too-many-sounds': 'キー音{n}個：BMSで指定できるのは最大{max}個です',
  'bmsw.too-many-sounds.36':
    'キー音{n}個：BMSで指定できるのは最大{max}個です（36進数の場合。62進数なら3843個）',
  'bmsw.too-many-defs': '異なるテンポやSTOPが{max}個を超えています',
  'bmsw.measures': '{measure}小節目：BMSの小節は000-999までです（{needed}小節必要）',
  'bmsw.file': '{file}：{note}',
  'bmsw.unmappable': '{chars}は{encoding}で書けないため、?として書き出しました',
  'bmsw.velpan':
    'ベロシティかパンのあるノーツ{n}個：BMSにはどちらもないため、最大音量・中央で再生されます',
  'bmsw.unmapped': '{map}の配置にチャンネルがないレーンのノーツ{n}個：BGMとして書き出しました',
  'bmsw.dupes': '別のノーツと同じレーン・同じ位置にあるノーツ{n}個：BGMとして書き出しました',
  'bmsw.holds':
    '同じレーンの次のノーツの開始位置で終わるロングノート{n}個：BMSでは同じ位置に両方を置けないため、1パルス短く書き出しました',
  'bmsw.stops':
    '1/192小節の整数倍でないSTOP{n}個：小数で書き出しました（beatorajaは読めますが、LR2は切り捨てます）',
  'bmsw.scroll':
    'スクロール変速{n}個は書き出していません：LR2にはなく、beatorajaの#SCROLLはEZ2PORTと動作が異なります（EZ2PORTは新しい速度へ徐々に変わります）',
  'bmsw.kept':
    'ゲーム譜面固有のレコード（スクロール、音量など）は書き出していません：BMSには入れる場所がありません',
  'bmsw.missing-sound':
    '楽曲フォルダにないサウンド{n}個（{names}）：BMSに名前は書きましたが、コピーしていません',

  // ---- MIDI files, to slice a sound by (io/midi) ----
  'midi.not-midi': 'MIDIファイルではありません（MThdがありません）',
  'midi.format-2':
    'フォーマット2のMIDIファイル（独立したシーケンス）には、カットの基準となる単一のテンポがありません',
  'midi.format': 'MIDIフォーマット{format}はEZ2BMSでは読めません',
  'midi.smpte': 'SMPTEタイム（拍単位ではない）には、カットの基準となるテンポがありません',
  'midi.division': '分解能が4分音符あたり0ティックです',
};
