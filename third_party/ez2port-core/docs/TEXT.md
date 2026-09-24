# Native text (2026-09-04)

The game's UI text is mostly baked into small bitmaps: the select's
category strip, the version badge under a title, the stage plates, the two
Korean lines under the countdown. The port can render such a bitmap
itself, from a TrueType face, at the window's scale - so it is sharp at any
window, a strings file in another language translates it, and a modder
edits a text file instead of repainting art. This is UPSCALING.md's route D
grown into a general mechanism.

Nothing is required. The loader asks the manifest first, then the HD pack,
then the game's own file; a texture the manifest does not name is untouched.
Coverage grows one texture at a time.

## 1. What belongs here, and what does not

**Plain text only.** A plate whose look is a colour, a face and a size is a
candidate. A plate whose look is an effect - a glow, a gradient, an outline,
a techno display face, the score digits, READY / START, the judgement
words - stays art, because rendering it from a font would restyle the game.
Those get the HD pack (UPSCALING.md) instead.

Three tiers, for reference:

| tier | examples | handled by |
|---|---|---|
| plain UI text | category labels, version badges, stage plates, instruction lines | this manifest |
| styled display type | READY, KOOL, digit fonts, mode logos | the HD pack, model or Lanczos |
| art with letters in it | disc art, eyecatches | the HD pack |
| song title plates | `system/songname/*.abm` | section 7: generated native text, like the imported songs |

## 2. The files

Beside the executable, in `text/` (the build copies them from the repo's
`text/`; `--text DIR` names another folder, `--text none` turns it off):

- `manifest.ini` - which textures, and the geometry of each.
- `manifest.songs.ini` - the same syntax, GENERATED: the 492 song title
  plates (section 7). Read after `manifest.ini`; optional.
- `strings.ini` - the words, by key, as the game has them.
- `strings.<lang>.ini` - a language's overrides, only the keys it changes.
  Chosen by `Language = <lang>` in `settings.ini`, `--lang <lang>`, or
  `EZ2_LANG=<lang>`, or the TEXT LANGUAGE row on the test menu's PORT
  SETTINGS page, which lists ORIGINAL and every `strings.<lang>.ini` the
  folder holds and takes effect on the next screen built (a plate a running
  screen already holds keeps its words). `strings.en.ini` ships with
  English for the Korean lines; French, Spanish, Portuguese, German,
  Simplified and Traditional Chinese and Japanese (`fr`, `es`, `pt`, `de`,
  `zh-cn`, `zh-tw`, `ja`) are full passes - the category abbreviations,
  the stage plates and the countdown, the screen headers (SELECT A MODE,
  SELECT A MUSIC, STAGE RESULT), the lifted plates' words (`lift.*`) and
  the attract loop's two plates; the version badges are product names and
  stay, and so do the abbreviations (HOT, NM MIX, EF 1). The attract
  plates' English header (PRESS START BUTTON, INSERT COIN(S)) stays in
  every language and only the hint under it is translated: the Korean
  line says the same thing again, and the plates pair English with the
  local language the way the original does (the owner, 2026-09-06). The
  original's own LANGUAGE row on the test menu's top page is a different
  thing: the cabinet's Korean / English switch.

A CJK translation needs no manifest change: a run the manifest set in a
Latin face is rendered with the CJK face whenever its words hold CJK
characters. A strings file may say `@cjk = jp | kr | sc | tc | hk`, which
forms of the shared ideographs it wants - Noto Sans CJK keeps them as
faces 0..4 of one collection and the renderer picks that face (a font path
may end in `#N` for the same purpose); other CJK fonts have one set and
ignore it. The originals say `kr`.

A translation has the tile's room and no more: a line wider than the tile
is scaled down to fit (both axes, or only the width where the entry has a
`max width`), so a long sentence comes out smaller rather than clipped.
"Le jeu va bientôt commencer." filled the countdown tile edge to edge and
was shortened to "Le jeu commence bientôt."; write short.

## 3. The manifest

    [fonts]                          ; optional - faces are found on their own
    cjk     = /usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc
    cjkbold = /usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc

    [system/SongSelect/Sortimage/category_01.abm]
    size = 128,16
    line = cat.hot | 62,13,11 | light | ffffff | center | 35

    [system/BattleMode/count.abm]
    size = 256,256
    mask = system/BattleMode/count_mask.abm
    line = play.speed_hint | 128,119,13 | cjkbold | ffffff | center
    line = play.start_soon | 128,151,15 | cjk | ffffff | center

- The section name is the texture's path under the game root. Either
  slash, any case, `.bmp` or `.abm` - the game asks for `.bmp` names and
  the tree holds `.abm`.
- `size` is the tile as the game's file has it, in 640-space pixels. It is
  the logical size the texture is drawn at whatever the render scale.
- `mask` names the plate's `_mask` twin when the game draws one; it is
  rendered from the same lines, black text on white, as the game's masks
  read. It needs no section of its own.
- `line` is one run of text: `key | x,baseline,cap | face | rrggbb | align
  | max width`. The colour may be `rrggbb/gggggg`: the ink and a halo of
  the second colour round it, three pixels wide at the tile's scale, solid
  at the letters' edge and fading out - the song title plates' version
  tint (white letters in an orange glow). A mask twin ignores the halo. The first field is a key into the strings files, or the
  words themselves `"in quotes"` for text no translation touches (the song
  titles); the quotes are the outermost pair, so a title may hold its own.
  `x` is the anchor column (`left`: the ink starts there,
  `center`: centred on it, `right`: the ink ends there), `baseline` the row
  the capitals sit on, `cap` their height. A line wider than `max width` is
  condensed horizontally to it, capitals keeping their height - the strip's
  "1.5-2.0" is fitted that way; 0 means no cap. Up to eight lines per plate.
- Faces: `bold` (Roboto Bold, vendored), `light` (Fira Sans Light,
  vendored), `cjk` and `cjkbold` (Noto Sans CJK / Noto Sans KR / Nanum
  Gothic from the machine, `fonts/cjk.ttf` and `fonts/cjk-bold.ttf` beside
  the executable, or `EZ2_CJK_FONT` / `EZ2_CJK_FONT_BOLD`). A CJK face is
  not vendored: it is 5 to 20 MB. Without one the Korean lines fall back to
  the Latin faces and draw boxes - drop a face in `fonts/` or set
  `Language = en`.

Coverage goes into the colour and alpha is hard, the way the game's own
colour-keyed plates carry it: the strip is drawn additively, where alpha is
ignored, and an antialiased edge carried in alpha alone would come out
bold.

## 4. Measuring a plate

The numbers come from the original bitmap. `ez2asset png --key-black` decodes
it; the ink's bounding box gives the anchor column and the baseline (the
bottom row of the capitals), its height the `cap`, its brightest pixel the
colour. Render, measure the same box on the result, adjust. The first batch
lands within a pixel or two on every axis:

| plate | original ink box | native |
|---|---|---|
| category HOT | 49,2 - 76,13 | 49,2 - 77,13 |
| category LV1 | 54,2 - 71,13 | 52,2 - 72,13 |
| stage "1st Stage" | 45,4 - 93,16 | 46,4 - 96,16 |
| version 1ST TRAX | 85,4 - 124,12 | 73,4 - 124,12 |
| countdown, both lines | 43,104 - 214,152 | 37,104 - 219,153 |

The version badge is the one visible difference: the original's face is a
condensed bold, Roboto Bold is not, so the same capitals run a quarter wider
before the 100 px cap condenses the long names. A per-line horizontal scale
would close it; not done.

`EZ2_TRACE_TEXTURES=1` prints every texture the loader opens and, for a
manifest entry, `text: rendered` or `entry but no face`.

## 5. The first batch

- Song select: the 47 category labels (Sortimage), the 19 version badges
  (Version), the four stage plates.
- Result: the four stage plates.
- Play: the two lines under the countdown, and their mask.

Seen in the tree but left as art, with the reason: `combo.abm` and the
labels baked into `panel_1p.abm` (outlined / mixed with art), the effector
panels and the `TT_UseKey` strips (icons beside the text), `freeplay.abm`
(a box), `cate_0.abm` (two styles in one), `t_selectmusic` and
`TT_Result_Top` (an italic display face), the `credits_N` / `ver_N` /
`bpm_N` / `timefont` digit atlases (one glyph per file - possible, but the
face is the look), `RSname/Song_name.abm` (per-song art).

## 6. Not done

- A per-line horizontal scale for condensed faces (section 4).
- The Japanese countdown lines are long for the tile and come out smaller
  than the Korean; a native speaker may find shorter phrasings.
- The mode-select texts (VF_ModeInout) and the how-to-play plates: not
  inventoried yet.
- Digit atlases as native text, if a translation ever needs them (it does
  not: digits are digits).
- The port's own generated text (the CUSTOM label, the custom-song plates
  and badges) still renders at 640-space; it should use the same
  scale-aware path. UPSCALING.md route D.

## 7. The song title plates (2026-09-05)

`system/songname/<key>.abm` is the title the select wheel and the result
screen show: a 256x32 bitmap, bold sans, white, right-aligned, with a grey
subtitle under it on 55 of them. The imported songs already had a native
plate (ez2/ttf.h renders one at import); the originals now get the same
treatment through the manifest, so a title is as sharp as the window and
`Language` has nothing to do with it - a title is a name.

`text/manifest.songs.ini` is GENERATED by `tools/songtext.py` from the
sibling EZ2REWRITE project's song list, which transcribed the titles from
these very banners (the chart stores no title and `song.bin`'s name field
is empty in the shipped table). 492 of the 493 plates are covered; the odd
one, `0-backpanel.abm`, is not a song. To regenerate:

    tools/songtext.py ../../EZ2REWRITE/reference-impl/chartbase-ez2/songdb.lua \
        --root "/path/to/Final EX" --asset build/ez2asset > text/manifest.songs.ini

The geometry is measured the way section 4 measures everything: a single
title sits on row 22, capitals nine tall, ink ending at column 246; a title
over a subtitle sits on row 15 (cap 7) with the subtitle on row 27 (cap 6)
in `c5c5c5`. A long title is condensed to the plate's 236 px of room, as
the shipped long ones are.

The colour is measured from each plate too (`--asset`; 2026-09-06, "add
back the colours of song names according to their versions" - the owner).
A hundred or so titles carry their version's tint: solid green (`00f283`,
the 12th's), solid cyan (`46e1ff`), or white letters in an orange or cyan
halo (`ffffff/eb4800`, `ffffff/42d3ef` - the 11th's, the 15th's), which
the line's colour field spells as `ink/halo` (section 3) and the renderer
draws as a three-pixel glow. A subtitle takes its own measured colour. What
is NOT carried is the one-pixel dark outline the shipped plates draw round
the white (the imported songs' plates never had it either); a title that
wants it back is one `[section]` to delete from the generated file, and
the game's bitmap comes through again.

## 8. The port's own plates (2026-09-05)

Two labels have no game file behind them: the CUSTOM bank on the category
strip (`category_48`, after the table's 47) and the CUSTOM SONG version
badge (`version_19`, after the nineteen versions). They were rendered once
as 640-space bitmaps and drawn blurry beside labels that were native. Now
they are manifest sections like any other, and the loader renders a
manifest entry whose file does not exist the same way it renders one whose
file does - the game's file only ever said the texture exists, and the
manifest can say that too. `cat.custom` and `ver.custom` are their keys, so
a strings file can translate them.

## 9. Lifted plates: art with words on it (2026-09-05)

A plate like `system/Common/freeplay.abm` is a box with FREE PLAY painted
on it. Upscaled whole, the model reinvents the letters; resampled plainly,
they stay pixels. `tools/textlift.py` lifts the words off:

1. decode the plate with the game's key;
2. read the words and their boxes with tesseract (`eng`, on an inverted
   4x copy);
3. mask the ink inside the boxes and fill it through ComfyUI's
   `Resynthesize` node (comfyui-resynthesizer: a content-aware fill, no
   diffusion model, a second per plate);
4. write the cleaned plate to `build/hdsrc/<rel>.png`, which `hdpack.py
   --src build/hdsrc` upscales in place of the game's file;
5. append a section to `text/manifest.lift.ini` with `base = pack` and one
   line per text line - baseline and cap off the boxes, centred when the
   box straddles the plate's centre, the ink's own colour - and the words
   as `lift.<stem>` keys in `strings.ini`, so a language file can override
   them.

`base = pack` is the new manifest key: the loader takes the HD pack's copy
of the plate (or the game's file, keyed, without a pack) and renders the
lines OVER it at the pack's scale (`ez2_textspec_render_over`), so the
art is the upscaler's and the words are the font's. Without a pack the
words render over the 640-space art, which is still sharper than the
bitmap's letters.

`base = pack+clean` is the same, for a plate lifted BY HAND, without the
tools' cleaned source: the pack's copy was upscaled from the game's file
with the words still in it (the whole tree is in the pack), so the loader
fills the section's `clean` boxes in that copy too, at its scale, before
the words go on. A horizontal lerp per row between the two edges - each
sampled as the darkest of the three pixels outside the box, and an edge
that abuts an icon outright takes the other's value - so it suits words on
a flat or vertically graded ground - the attract plates' black, the control strip's
panel - and not a textured one; those want the tools. The two name panels
use it as well, over the streaks the content-aware fill left of DJ NAME.

And a mask twin that is DARK where the words go carries no words. The
game's masks are mostly white sheets with the shadow in black, which a
darken reproduces; the V-ranking name panel's twin is a grey panel with
the letters LIGHTER in it, a glow, and cutting black words into it would
draw a shadow the game never had - while leaving it as the game made it
drew the old letters under the new ones (the doubled DJ NAME). Such a twin
is its cleaned base and the plate alone shows the words; the tell is the
base's mean brightness inside the clean boxes (below 128).

    export TESSDATA_PREFIX=~/.local/share/tessdata     # eng.traineddata there
    tools/textlift.py --root "<game root>" --src build/hdsrc \
        --manifest text/manifest.lift.ini --strings text/strings.ini \
        --asset build/ez2asset --review system/Common/freeplay.abm   # look first
    tools/textlift.py ... system/Common/freeplay.abm                  # then lift
    tools/hdpack.py --root "<game root>" --out build/hd --src build/hdsrc \
        --list <the lifted rels> --force ...                          # and upscale

`--plain` is the other mode, for PURE text plates - words on black whose
`_m` twin is the words' own shadow (PRESS START BUTTON, PLAYER 1, the mode
select's category headers): no fill, no source written, a section without
`base` and with the twin declared as `mask =`, one line per run of one
colour. Both modes take `--review` first, which prints what was read and
where and writes nothing. What stays art either way: a display face - the
italic COURSE RANKING and STAGE RESULT, the techno HARD MODE, SYNCRATE's
decorative face - because the face is the look.

ComfyUI: `~/ComfyUI`, its own `.venv`, `python main.py --bf16-vae`; the
node needed `scikit-image` and `resynthesizer` in that venv. The RX 7900
GRE is seen natively by the ROCm torch build, no override variables.

## 10. The mode select's plates

The fifteen `system/modeselect/ModeText/*.abm` plates are manifest text
(manifest.ini's ModeText section), words on black like the song titles:
the mode's name in two weights on row 31 of a 512x64 plate, 23 tall, and
its description on row 54 in the bold CJK face, 12 tall and centred with a
350-pixel bound; the 128x64 square plates carry the name 35 tall over a
7-pixel caption. Every word is a `mode.<stem>.a/.b/.desc` key in
strings.ini, so the Korean descriptions translate: strings.en.ini and
strings.fr.ini carry them, the other languages fall back to Korean until
someone writes theirs. The plates take the screen's tint like the bitmaps
did, since coverage lives in the colour.

The scene's header is the same treatment: `o_top_typo_one.abm` carries
SELECT A MODE 24 tall on row 35 and the hint under it on row 57, with the
game's `o_top_typo_mask.abm` shadow as a mask twin. The header is the one
place the manifest slants a face: `bold+oblique` shears the run 12
degrees about its baseline, for the italic display type the machine has
no font for. The hint is `mode.hint`, translated in every strings file;
the header word stays English everywhere, as the game had it.

## 11. Song select, the option panel and the result screen (2026-09-05)

The same two treatments cover the rest of the three screens:

- Words on black, with the shadow twin declared: SELECT A MUSIC and
  STAGE RESULT (the three top plates the clips pick), the result's place
  plates and its two mode captions, the eight CATEGORY plates and
  JUDGEMENT CHANGE.
- Art with words, `base = pack`: the category hint keeps its E2/E3
  icons, the difficulty strip its rule, the two result panels their box,
  rules and bracket, the three option panels their frame and the OPTION
  CONTROL diagram, and the 75 effect plates their icon and arrow. The
  words were cleaned out of the sources in build/hdsrc (a horizontal
  lerp across each label's box on the panels, the text column blacked on
  the effect plates) and the pack rebuilt from them.

Two things the engine learned for it. A mask twin of a lifted plate is
lifted too: its silhouette darkens the pack's cleaned copy of the mask,
so the hint's icons and the strip's rule keep their alpha. And a plate
may carry sixteen lines; the result panel needs twelve.

Every label is a key: `select.*`, `diff.*`, `result.*`, `judge.*`,
`opt.*` and the 61 `eff.*` descriptions, translated in all nine files.
Judgement names, mode names, EF 1-4, PEDAL and BLUE KEY stay as the
game had them.

**Without the pack.** A lifted plate's section also carries `clean =
x0,y0,x1,y1` boxes, the game's own words' positions in the source. When
no pack copy exists the loader bases on the game's file, fills those
boxes across from their edges (a lerp per row, which is black on a black
plate and the panel's gradient on a panel), scales it up nearest to the
window, and renders the words over that - so a cabinet without the 100 GB
pack still gets the native text, over its own art. A lifted plate never
falls back to its words alone. Verified on the result screen with `--hd`
pointed at an empty folder.

## 12. The attract loop and the name entry (2026-09-05)

Four plates the first passes missed, all art with words and all measured by
hand (`base = pack+clean`, section 9):

- `system/title/Common/pressstart_tex.abm` and `insertcoin_tex.abm`, the
  attract loop's PRESS START BUTTON / INSERT COIN(S): an italic cyan header
  (`bold+oblique`, 19-20 tall on row 28) over its own underline, which
  stays, and the Korean hint under it (CJK face, 13 tall on row 50). Their
  `_m_tex` twins are the game's soft shadows and take the words as a darken.
  Keys `title.press_start`, `title.press_start_hint`, `title.insert_coin`,
  `title.insert_coin_hint`; the language files override the two hints only.
- `system/Ranking/TT_rank_UseKey_Panel.abm` and
  `Vranking/TT_Vrank_Usekey.abm`, the name entry's control strip: an icon
  and a Korean word four times over - the turntable moves, the three keys
  enter, the two blue keys delete, the S key ends the entry - and TIME,
  which stays. Only the words are cleaned and re-set (`rank.move`,
  `rank.enter`, `rank.delete`, `rank.finish`, white, 9 tall on row 36 -
  row 35 on the V strip, whose TIME is on the left and everything else 63
  to the right). Each word has the room to the next icon and no more, 27
  to 50 px, so a long translation is condensed into it: write short.

The `lift.*` keys and the three screen headers had no translations at all
until this pass; every language file now carries them, except PRESS START
BUTTON (`lift.common_press_start`), which stays English everywhere like the
attract header it echoes.

## 13. The pass of 2026-09-06

What the screens still drew in the game's own letters after section 12,
found by tracing every texture the title, mode select and song select load
(`EZ2_TRACE_TEXTURES=1`) and every texture the screens' `.str` clips name
(`ez2bga` under the same variable), decoding what no entry covered, and
reading the sheets. All measured by hand; art with words is
`base = pack+clean`.

- **The mode select's second copies.** `system/modeselect/CategoryGlow/`
  holds a copy of every tab, its twin, its cyan highlight and the header,
  and the layout and glow clips resolve THOSE - a copy is another texture
  to the loader. Entries mirror the originals ("LIGHT" in cyan over
  "LÉGER" was the highlight copy).
- **Level digits.** `Lvfont/alv_NN` (white, twin), `Lvfont/lvNN` (the
  list's small yellow), `LargeLvFont/Level_NN` (the big one); literals, so
  no keys. `lv21` is a skull and stays; `Level_00` is empty and stays. The
  BPM readout's `bpm/bpm_NN` and the credit counters' `credits_N`,
  `credits_sN`, `credits_sbN` likewise. `LargeLvFont/Level_top_font` is the
  difficulty strip: two Korean labels beside their key icons and NM / HD /
  SHD / EX (`sel.level_hint`, `sel.cancel`, the `diff.*` keys).
- **The song select's control strips** `TT_UseKey2_panel`,
  `TT_UseKey_catch_panel`, `TT_UseKey_ruby_panel` (`sel.category`,
  `sel.settings`, `sel.skin`, `sel.close`, `sel.change_settings`,
  `sel.change_skin`) and the course select's two notices
  (`course.show_options`, `course.show_ranking`, `course.move`,
  `course.select`) and header SELECT A COURSE (`course.header`). Each word
  has the room to the next icon; the translations are one word each.
- **The ranking.** COURSE RANKING and NAME ENTRY get the header treatment
  with their twins (`rank.header_course`, `rank.header_name`); the column
  heads ENTER YOUR NAME / RANK. / DJ NAME / TOTAL SCORE
  (`rank.enter_name`, `rank.col_rank`, `lift.ranking_tt_rank_name`,
  `rank.col_total`); the countdown's TIME (`rank.time`).
- **The result.** The 2P panel `TT_Result_Main_R` takes the 1P panel's
  lines; the battle result's three STAGE RESULT copies take the header's.
- **The credit box** `Common/credits` (`common.credits`), the slash kept.

Left as art, on purpose: `system/warning.abm` (the legal notice, text over
a photograph - a lerp cannot clean it, it wants the lift tools), the
battle result panel (labels on cyan outlines), the CV2 result (outlined
display boxes), HARD GAUGE (a red glow), the 1P WIN / DRAW plates, ALL
COMBO, the grade letters, the big score fonts, the `ver_N` digits (a
techno face), and the version plate THE 1ST TRACKS (a product name).

Second half of the pass, same day:

- **The in-game effector panel** (`system/InGameEffector/TT`), the box
  that opens while START is held: three variants by key count, their
  labels re-set behind the icons (`fx.*`), the ON / OFF cells, and the
  four speed digit fonts as literals - including the `SPEED VALUE =`
  strip. A manifest literal may now hold a `;` inside its quotes.
- **The song select's countdown digits** (`VF/TimeFont`).
- **The name entry's two glyph fonts** (`Ranking/Font/nrf_NN`,
  `Vranking/Font/r_fon_NN`): the picker's fifty characters one per glyph,
  in the game's order. The game's face is a wide rounded one the port does
  not carry, so they come out in the bold face, narrower; the space and the
  DEL arrow stay.
- **The version digits are not text but a number**, and the number is now
  the port's: the title and the result spell the build (the repository's
  commit count, `cmake/version.cmake` -> `gen/ez2_version.h`) through the
  game's own `ver.str`, 1510 reading "15.10". `ez2play build 1510 (hash)`
  is also printed at start-up.

