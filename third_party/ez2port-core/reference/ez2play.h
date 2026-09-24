/* ez2play - the player, split into one file per screen (2026-09-06).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../../LICENSE.
 *
 * This header is what the screens share: the includes, the constants,
 * the types, the globals and the helpers more than one file reaches for.
 * A symbol used by one file stays static in that file. main.c owns the
 * command line and the session loop; core.c owns the shared helpers. */
#ifndef EZ2PLAY_H
#define EZ2PLAY_H
/* ez2play - a playable chart: scrolling notes, keysounds, judgement, score.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 *   ez2play --exe UNPACKED.exe CHART.ez [--root ASSETS] [--auto]
 *           [--speed N] [--frames N] [--shot PATH]
 *
 * This is the first thing in the port that is a GAME rather than a tool. It
 * puts together everything the previous milestones built and adds only the
 * loop between them:
 *
 *   crypt + chart + songini   what to play, and by what rules
 *   ezi + ssf                 what it sounds like
 *   mode                      which tracks are lanes and which are backing
 *   score                     what a press is worth
 *   platform/gl               the window, the audio and the input
 *
 * Keys: S D F J K (+ L ; on 7-lane layouts), A/Q scratch, SPACE pedal, ESC
 * quits. --auto plays it perfectly, which is what makes the loop testable
 * without a person.
 *
 * TIME COMES FROM THE AUDIO DEVICE, not from the frame loop. A rhythm game's
 * "now" has to be what the player hears; see ezAudioTimeMs.
 *
 * NOTHING IT READS MAY BE COMMITTED - it is the user's game data.
 */
#include <math.h>

#include "../../ez2/chart.h"
#include "../../ez2/crypt.h"
#include "../../ez2/ezi.h"
#include "../../ez2/usersongs.h"
#include "../../ez2/textspec.h"
#include "../../ez2/bmson.h"
#include "../../ez2/ttf.h"
#include "../../ez2/abm.h"
#ifdef EZ2_HAVE_VIDEO
#include "../../media/audio.h"
#include "../../media/image.h"
#endif
#include "../../ez2/cfgdir.h"
#include "../../ez2/vfs.h"
#include "../../ez2/pluginmsg.h"
#include "../../ez2/playeropts.h"
#include "../../ez2/font.h"
#include "../../ez2/gds.h"
#include "../../ez2/bindspec.h"
#include "../../ez2/keyconf.h"
#include "../../ez2/credit.h"
#include "../../ez2/keytable.h"
#include "../../ez2/layout.h"
#include "../../ez2/portcfg.h"
#include "../../ez2/mixparam.h"
#include "../../ez2/mode.h"
#include "../../ez2/noteorder.h"
#include "../../ez2/opini.h"
#include "../../ez2/ranking.h"
#include "../../ez2/score.h"
#include "ez2_version.h"           /* generated: EZ2PORT_BUILD, the commit count */
#include "../../ez2/scroll.h"
#include "../../ez2/selectwheel.h"
#include "../../ez2/songdb.h"
#include "../../ez2/songini.h"
#include "../../ez2/testmenu.h"
#include "../../ez2/speed.h"
#include "../../ez2/file.h"
#include "../../ez2/session.h"
#include "../../ez2/stageini.h"
#include "../../ez2/rng.h"
#include "../../scene/bga.h"
#include "../../scene/skin.h"
#include "../../scene/lights.h"
#include "../../platform/platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <time.h>

/* THE TWO CHANNEL ENUMS HAVE TO AGREE, and this is the only file that sees
 * both - ez2core must not depend on the seam, so keyconf.h repeats the list
 * rather than including platform.h. Checked here so a channel added to one and
 * not the other is a compile error rather than a silently mis-routed key.
 * (A negative-size typedef, not _Static_assert: the port builds as C99.) */
typedef char ez2_channel_enums_agree[
    ((int)EZ2_KEY_CHANNELS == (int)EZ_IN_COUNT) ? 1 : -1];

/* From the platform layer; the audio five moved into the seam itself once
 * there were two implementations of the exclusive path to describe. */

/* WHAT `--audio-exclusive` WITH NO ARGUMENT MEANS, and what AUTO is on the
 * settings page. The two platforms name a device differently (platform.h says
 * how), so the bare default differs too:
 *
 *   Linux    `hw:0,0` - card zero, device zero. A real guess, and wrong on
 *            most machines with more than one card, which is why
 *            `--audio-devices` exists.
 *   Windows  "default" - the endpoint Windows itself is already using, which
 *            is not a guess at all: it is whatever the user chose in Sound
 *            settings, and on a cabinet that is the one thing that is right.
 *
 * It cannot be the EMPTY string on Windows: empty means "do not take a card"
 * to ezAudioExclusiveDevice, so a bare --audio-exclusive would silently do
 * nothing. ezwasapi.c's pick_device treats "default" as the default endpoint. */
#ifdef _WIN32
#define EZ_EXCL_DEFAULT  "default"
#define EZ_DEVICE_WORD   "playback endpoint"
#define EZ_AUDIO_ROWS    3          /* SHARED, EXCLUSIVE, ASIO */
#else
#define EZ_EXCL_DEFAULT  "hw:0,0"
#define EZ_DEVICE_WORD   "ALSA playback device"
#define EZ_AUDIO_ROWS    2          /* no ASIO outside Windows */
#endif

/* ---- shared types and constants (moved here from the screen that owns them) ---- */

/* DESIGN SPACE. Every coordinate below is in it and stays in it, whatever the
 * canvas is - see ../WIDESCREEN.md. The canvas is only how wide the presented
 * frame is; the platform layer's anchors hand out the difference. */
#define SCREEN_W      640
#define SCREEN_H      480
#define JUDGE_LINE    400.0f     /* where notes are hit */
/* NO LEAD-IN. start() @0x41fa10 stops the READY overlay, starts the player
 * and stamps the clock; the chart runs from its own zero and its first
 * record lands at its own tick (SCREEN-AUDIT.md 5.5). The port used to add
 * three seconds of empty field after the count. */
#define LEAD_IN_MS    0
/* HOW LONG A STRUM STAYS LIVE. m45d200 @0x45d200 counts the latch up while
 * the scratch is held and drops it past SIX - `if (bx[0] > 6) { pick = 0;
 * bx[0] = 0; }` - so the window is six frames of the cabinet's 60 Hz. In
 * milliseconds because the play loop is not paced (see the READY count). */
#define STRUM_WINDOW_MS (6.0 * 1000.0 / 60.0)
#define MAX_NOTES     32768

/* ---- the per-player settings panel --------------------------------------
 *
 * WHY EACH SIDE NEEDS ITS OWN. The options that matter mid-song - the note
 * speed, the note skin - are now per player (ez2/playeropts.h), so the way to
 * change them has to be per player too. The game's own in-play gesture is
 * START plus another button (update2 @0x41e620: START arms the speed section,
 * START + turntable is the 0.01 dial), and it is the natural place to hang
 * this: `START + KEY3` on your own bank opens your own panel.
 *
 * KEY3 because it is free and symmetric. START + keys 2 and 4 and START +
 * the turntable are already the game's own dial, and 1P and 2P have exactly
 * the same five keys - unlike the effector row, which only 1P's side of the
 * cabinet has.
 *
 * IT DOES NOT PAUSE. The song keeps playing and the other player keeps
 * playing, because on a cabinet there is nothing to pause TO - the audio is
 * the clock. Opening your panel mid-song costs you the notes you miss while
 * it is open, exactly as fiddling with the speed dial already does.
 *
 * IT SLIDES IN FROM ITS OWN PLAYER'S EDGE - 1P from the left, 2P from the
 * right - because that is the side that player is standing on, and it is the
 * side their field is already anchored to (two-player modes put 1P hard
 * against the left edge and 2P against the right; see ../WIDESCREEN.md). */


/* WHERE EffectPanel.str PUTS ITSELF, measured rather than assumed: two shots
 * of the same frame at slides 511 and 411 differ only where the panel is, and
 * the union of the two positions runs from logical x 277 to the right edge.
 * So the art is authored at x = 277 and is about 363 wide - three fifths of
 * a 640 screen.
 *
 * THAT IS WHY ONLY ONE PANEL IS UP AT A TIME. Two of them side by side would
 * be 726 px on a 640 px screen; whoever opens theirs closes the other's,
 * which is also how a person would expect a full-screen-ish option page to
 * behave. Each still enters from its own player's edge. */
#define OPTPANEL_X  277.0f

/* The style preview sits 322 px right of the option panel - the original's
 * own 833 against the panel's 511, both measured from the same slide. Kept as
 * the DIFFERENCE rather than as an absolute so the two move together whatever
 * offset the panel is given. */
#define STYLE_PREVIEW_LEAD  322.0f

/* ---- what one chart is told, and what it reports back -------------------- */

/* Everything a run of one chart is told, and everything it reports back. They
 * exist because a SESSION plays more than one chart: main used to be the whole
 * program, and a select screen cannot call a program. */
typedef struct {
    const char *exe, *root, *chart_path, *shot, *player;
    /* The name the ranking file is keyed by. The song TABLE's key is the
     * authority - it is what the game formats the path with, and it is
     * lower case where the chart filename is not - so select passes it. A
     * bare chart path has no table, and falls back to the filename's stem. */
    const char *rank_key;
    int    auto_play, fast, save, frame_limit, bga;
    /* In a session the per-chart file is written ONCE, by the ranking
     * director at its fade's end (m456b20 @0x456b20), under the entered
     * name - never at the result. Set by the arcade loop; a bare chart run
     * with --save still writes here, having no name entry to wait for. */
    int    defer_rank;
    /* The gauge the stage STARTS with. m42e000 @0x42e000 (src/stagesetup.
     * cpp:262-267) refills to 100 at every stage of the keys modes, but in
     * modes 6..9 only when the previous stage FAILED (`g_1b2ea28 != 0`) -
     * a radio course carries its gauge from stage to stage. -1 = full. */
    float  gauge_in;
    /* WHAT EACH PLAYER CHOSE. The dial, the arrangement and its seed, the
     * note skin, the black panel - one set per side (ez2/playeropts.h), which
     * is where the argument for that lives.
     *
     * `opts[0]` is a full, valid set: it is what the CLI and the song
     * select fill in, and on a one-player credit it is the whole story.
     * `opts[1]` arrives UNSET - every field the sentinel - and play_chart
     * resolves it against 1P's before reading either, so a side that chose
     * nothing is byte-identical to 1P and `ez2_player_opts_equal` says so.
     * That equality is what puts the run back on the single-skin,
     * single-scroll path that predates any of this. */
    ez2_player_opts opts[EZ2_PLAYERS];
    /* 2 = a two-player credit was asked for. Whether one is possible is the
     * mode's business (mode_is_one_player) and whether it is DRAWN is the
     * port's - see the block in play_chart. 0/1 = one player. */
    int      players;
    /* --mode on a BARE CHART PATH. Normally the mode comes out of the
     * filename, but two conventions in the library do not carry it that way
     * (see the lane-set error in play_chart), so the flag has to be able to
     * say. NULL means "infer from the filename", which is every other run. */
    const char *mode_name;
    /* The session's 0-based round (`g_elemCount`): the first stage of a
     * credit plays on through an empty gauge, later ones leave (play.c,
     * the gauge-over ramp). A chart played on its own is round 0. */
    int      round;
} PlayOpts;

typedef struct {
    ez2_score    sc;
    ez2_chart_id id;
    long         total_notes;
    int          quit;          /* the window closed or ESC was pressed */
    int          test;          /* TEST pressed: runMainGame's code 6 */
    /* The stage ended because the GAUGE ran out, not because the chart did -
     * update2 @0x4249e0's 120-tick ramp fired. `sc.failed` says the gauge
     * touched zero at some point; this says the stage was cut short for it. */
    int          stage_failed;
    int          played;        /* the loop ran at all */
    int          place;         /* ranking slot 0..4, or -1 for none */
    ez2_ranking  table;
    int          have_table;
    /* Which file the placement above went into, so the session's name-entry
     * screen can put the entered name on it afterwards - the game's own
     * order: the result places the score, the ranking screen names it. */
    char         rank_key[EZ2_STAGE_NAME];
    int          rank_tier;
    int          level;         /* the .ini's [General] Level - the LV plate */
    int          order;         /* the note-order option, for Result_Eff's cell 1 */
    int          auto_assist;   /* g_37dcee8 / g_1b5f178 - see playeropts.h */
    /* The duo's second book: valid only when `duo` is set. `t1`/`t2` split
     * total_notes into the two halves' own counts. */
    int          duo;
    ez2_score    sc2;
    long         t1, t2;
} PlayResult;
/* The window cache. Sized for the NAME RAIL, which is the widest reader:
 * m438d30 admits fifteen slots, and on a list under 30 songs those slots
 * repeat the same rows, so fifteen distinct entries is the ceiling. A few
 * spare slots mean a one-step scroll evicts one row instead of all of them.
 * It is ASSOCIATIVE - a slot is found by the entry it holds, not by
 * `idx % SELECT_CACHE`: the rail's window wraps the ring, so its indices
 * are two runs (`count-6..count-1` and `0..8`) and a modulo key collides
 * between them for most list sizes, silently losing a plate. */
#define SELECT_CACHE  48    /* rows kept: a category's worth either side, so a switch back is free */

/* ---- THE EFFECTOR PANEL - Effector6thStyle, the keys-mix path ------------
 *
 * The ctor @0x41dcc0 picks the panel .str by mode index, update @0x41d920
 * stamps bass/treble/speed cells into it, updateSpeedDigits @0x41d1d0 stamps
 * the three number readouts into the point chart, and update2 @0x41e620 is
 * the input: effector keys 6/7 toggle the boosts, START held + the turntable
 * steps the speed, and every action resets the charts so the panel replays
 * its pop-up; while START is held the charts park at frame 60.
 *
 * THE CV2 PATH IS THE SAME CLASS DOWN A DIFFERENT BRANCH. Everything above
 * sits behind `g_1b2eb6c == 0`; with the CV2 flag up the ctor takes its art
 * from System\CV2Mix\InGameEffector - `icon.str` on chart1 rather than one
 * of the three keys charts - loads bass/treble plates and twenty-one
 * `Effector_Speed_%02d` dials of its own, and has NO number readout at all
 * (no point chart, no speedfont). Its origin comes from the panel style
 * rather than the mode: (-235,0) for style 3, (0,0) for the rest. `mi` is
 * useless for telling this apart, because a CV2 stage runs under its SUB
 * mode's descriptor - "5keymix" and the rest - which is exactly how the port
 * came to draw the keys panel over a CV2 field. */
typedef struct {
    ez2_bga_clip *main;      /* chart0 / chart2 / chart3 by mode, chart1 on CV2 */
    ez2_bga_clip *point;     /* chart4 - the number readouts (never on CV2) */
    int mi;                  /* game_mode_index */
    int cv2;                 /* g_1b2eb6c - the CV2 branch of the ctor */
    int speed_index;         /* m_speedIndex = g_1b2e914, CV2's 0..20 dial */
    int frame;               /* the shared chart frame (f8) */
    float x, y;              /* the ctor's f214/f218 for the MAIN chart */
    /* AND THE READOUT'S OWN, which is not always the main chart's. The ctor
     * @0x41dcc0 gives RubyMix's pair BOTH charts (0,55) but hands modes 4 and
     * 8 their -239 on chart0 ALONE (../../src/panels.cpp:898-910); the port
     * moved both and put ClubMix's speed digits 239 pixels off the field. */
    float px, py;
    int bass_on, treble_on;  /* the two boosts - stamped, no DSP yet */
} FxPanel;

/* One wheel row's assets. `idx` is the db entry the slot currently holds
 * (-1 empty); a NULL texture with idx set means the load failed once and is
 * not retried every frame. */
typedef struct {
    int        idx;
    EzTexture *title;
    EzTexture *disc;
} SelectRowTex;

typedef struct {
    int             cursor;                  /* index into db->entries */
    int             tier;                    /* the tier the cursor sits on */
    /* The note-order option, cycled IN SELECT the way the game's first-page
     * option is (the per-mode rings absorbed from the thirteen input
     * handlers - ez2_order_option_next). Travels with the select state so a
     * session keeps the player's choice from stage to stage, exactly as the
     * game's global does. */
    int             order;                   /* ez2_order_option */
    /* THE CATEGORY STRIP (drawGenreStrip @0x432200 / the pager m4445c0).
     * `cat` is the game's f_bc57c, `strip_scroll` its eased f_bc584 - a
     * 4700-unit ring of 47 banks, art Sortimage\category_01..47. Stepping a
     * category reseeds the page from song.bin's own group lists
     * (ez2_songdb_category_view - m435070's rule). */
    int             cat;
    float           strip_scroll;
    /* 47 banks from the table, plus the port's own CUSTOM bank after them
     * when user songs are on (usersongs.h): a label rendered in the strip's
     * style, since there is no 48th Sortimage. `ncat` is the ring's size. */
    EzTexture      *catart[EZ2_SONGDB_GROUPS];
    int             ncat;
    int             cat_tried;
    /* THE VERSION BADGE under the focused song's name - ani_Version.str
     * (m_be8d8), its cell 1 the 128x16 Version\version_%02d plate the row's
     * version index picks (songselectpage.cpp:77, m439f00), re-armed per
     * wheel step and held from frame 0x78 once done. The index is the
     * song.bin record's kind byte (0..18 = 1ST TRAX .. FINAL EX). A user
     * song wears a "CUSTOM SONG" plate rendered in the same style. */
    ez2_bga_clip   *verbadge;
    int             verbadge_for;
    int             verbadge_frame;
    /* THE TEXT LIST IS A TOGGLE, OFF BY DEFAULT ON THE GAME'S PAGE. The
     * keys modes' own select page has no text list at all - the disc art
     * carries the song's name, and the only list overlay in the original
     * is the RADIO stage list (@0x433980, keys 4/5, f_dc). The port's list
     * is kept as a convenience behind KEY3 - a port convention, flagged as
     * such - and stays always-on when the native layout is absent. */

    /* The list panel's cursor bar, eased the way drawListPanel @0x432f00
     * eases f_e8: a third of the gap per frame, snapping inside half a
     * pixel. Negative = not placed yet (snap on the first draw). */
    float           bar_y;
    ez2_song_chart  charts[EZ2_SONGDB_STEPS];
    int             chart_count;
    int             charts_for;              /* which cursor `charts` describes */

    /* THE TITLE IS A PICTURE, NOT A STRING. Twelve of the thirteen song.bin
     * tables leave the name field empty, and the reason is that song select
     * never reads it: its preload loop @0x4361a0 formats the table KEY into
     * `system\songname\%s.bmp` (@0x48cfb8) and loads that. The same key also
     * feeds the disc art (`system\discsmall\%s.bmp`, @0x48cfd0) and the
     * ranking reader (@0x430cf0), which is what proves all three are keyed
     * alike.
     *
     * The original loads all of them up front - it has a cabinet's worth of
     * memory and one screen to fill. This caches the visible WINDOW keyed by
     * entry index, so the wheel shows every row's picture while a scroll
     * step costs one load, not ten. */
    SelectRowTex    rowtex[SELECT_CACHE];

    /* THE BIG DISC. The layout's ring at (454,230) - TT_DiscCur.str's own
     * position - frames the cursor song's `system\disc\<key>[-tier]`
     * artwork, 256x256, with the cursor clip animating over it. */
    EzTexture      *bigdisc;
    int             bigdisc_for;             /* which cursor / tier it shows */
    int             bigdisc_tier;
    /* The suffixless (NM) disc art - the face the swing shows below 180
     * degrees (m431ae0's f_104[0]); NULL when the tier IS NM and bigdisc
     * already is that face. */
    EzTexture      *bigdisc_nm;
    /* THE FOCUSED DISC'S SWING (m431ae0 @0x431ae0): reaching full scale on a
     * new entry latches it with angle 0 and step -30; changing the
     * difficulty retargets a spring that rests at 0 / 360 / 720 / 1080 full
     * turns for NM / HD / SHD / EX (step = rest gap / 6 per frame, art
     * flipping to the tier's own past 180). sw_diff is the game's f_f4 art
     * index: NM 0, HD 1, SHD 3, EX 4. */
    int             sw_for;                  /* f_f0 - the latched entry */
    int             sw_diff;                 /* f_f4 */
    float           sw_angle;                /* f_fc, degrees */
    float           sw_step;                 /* f_100 */
    /* The carousel's shared art (m431ae0 @0x431ae0): the disc base under
     * every entry, and the ring drawn 3px larger over it. Loaded lazily. */
    EzTexture      *discmask;                /* system\disc\disc-mask.bmp */
    EzTexture      *shapemask;               /* system\disc\shape_mask.bmp */
    /* The scroll cursor pair (m4394e0's tail): o_scrollcusor + _m shadow,
     * riding the wheel fraction at x=12, y = frac*3 + 110. */
    EzTexture      *scrollcur, *scrollcur_m;
    /* THE SONG-NAME RAIL (m438d30 @0x438d30): the backing strip it draws at
     * (0,64) stretched to 490 tall, and the Selectcursor.str highlight it
     * ticks over it. The plates themselves are the rowtex cache's titles. */
    /* CV2MIX'S OWN PAGE (m4391b0 @0x4391b0 through m4324b0 @0x4324b0): the
     * BackPanel pair every entry sits on, and the ten level digits. */
    EzTexture      *cv2_panel, *cv2_panel_m;
    EzTexture      *cv2_lv[10];
    int             cv2_tried;
    /* AND THE REST OF ITS SCREEN. m4391b0's tail draws a list bar and its
     * thumb; m439dc0 @0x439dc0 ticks three charts of its own - the disc
     * (CV2Mix\Disc\tglevelicon.str, whose cell 4 carries the cursor
     * song's cv2disc plate) and the four-dial effector readout
     * (CV2Mix\modeselect\effector\effector.str) are two of them - and
     * then paints a 64x64 countdown out of CV2Mix\ModeSelect\Time
     * instead of the keys screen's 32x32 one. */
    ez2_bga_clip   *cv2_disc;
    ez2_bga_clip   *cv2_fx;
    EzTexture      *cv2_bar, *cv2_cursor;
    EzTexture      *cv2_time[10], *cv2_time_m[10];
    int             cv2_disc_for;            /* the cursor its cell shows */
    int             cv2_disc_frame;          /* reset by a cursor step */
    /* THE FOUR DIALS THE EFFECTOR ROW STEPS - inputCV2Mix @0x441fa0's tail.
     * CV2's select has no option layer and no genre pager: the four buttons
     * ARE the options, each stepping one counter that the readout's cells
     * 5..8 show. `cv2_speed` is seeded to 1 because the ctor @0x435390 forces
     * the low byte of g_37dcef8 to 1 (songselectctor.cpp:214), which is the
     * efSpeed_02 the original shows on entry. */
    int             cv2_r;                   /* g_37dcecc - reverse, 0..1 */
    int             cv2_speed;               /* g_37dcef8 - the 0..20 dial */
    int             cv2_note;                /* g_37dcea4 - note skin, 0..1 */
    int             cv2_bp;                  /* g_1b2eb7c - the BP readout */
    /* The "uses keys" panel's mask and its three per-mode plates. */
    EzTexture      *ukey_mask, *ukey[3];
    int             ukey_tried, ukey_fade;
    EzTexture      *railstrip;               /* SongSelect\VF\b_mask_2.bmp */
    ez2_bga_clip   *railcursor;              /* SongSelect\VF\Selectcursor.str */
    /* THE DIFFICULTY PANEL - drawLevels @0x4343b0 (src/songselect.cpp).
     * It is drawn on EVERY tick and parked 512px above the screen until a
     * song is taken; `lv_slide` is its f_c0470, eased toward 512 in state 5
     * and 0 on the wheel, and `lv_curx` its f_c0474, the cursor's column at
     * (g_4abd14 - 1) * 80. */
    EzTexture      *lvgrad;                  /* largeLvFont\level_sel_Grad */
    EzTexture      *lvtop;                   /* largeLvFont\Level_top_font */
    EzTexture      *lvbig[24];               /* LargeLvFont\Level_%02d.bmp */
    ez2_bga_clip   *lvcursor;                /* LargeLvFont\levelcursor.str */
    /* And m4394e0's own small cursor over the four 64x32 plates, whose
     * column is (g_4abd14 - 1) * 46 - the f_c047c ease. */
    ez2_bga_clip   *lvcursor2;               /* Lvfont\levelcursor2.str */
    float           lv_slide;
    float           lv_curx;
    float           lv_curx2;
    int             carousel_tried;
    /* The BPM readout's glyphs (m434080 @0x434080): digits 0..9, the point
     * at [10], the range dash at [11] - bpm_00..bpm_11. */
    EzTexture      *bpmglyph[12];
    int             bpm_tried;
    /* The difficulty plates (drawDifficulty @0x432930): the 64x32 level bar
     * ALV_00..ALV_20 with its _m shadow pair, and the single alv_23 pair
     * for any level at or past 0x15. */
    EzTexture      *lv_bar[21], *lv_shadow[21];
    EzTexture      *lv23_bar, *lv23_shadow;
    int             lv_tried;
    /* The in-select RANKING TABLE (drawRankTable @0x432bb0): the Rank panel
     * pair, the 48 srf glyph sheets - the order is the sheet set's own,
     * A..Z, 0..9, then the punctuation row (verifiable against the table at
     * 0x4abd18) - so letters sit at [0..25] and a score digit d at [26+d],
     * which is exactly why the original's score loop indexes its second
     * carved window with the bare digit.
     *
     * TWO TABLES, ONE PER PAGE KIND. The radio wheel's drawRankTable(120,
     * 89) shows `ranktab`: loadRankingFile @0x431420 reads
     * `system\ranking\ranking_<mode>_<channel>.bin` (1188 bytes, eight rows
     * shown), which the ranking screen writes at a course's end (m4570a0
     * @0x4570a0, only when g_1b2f024 == 0). The keys pages'
     * drawCourseRankTable(577, 152) shows `songrank`: the chart's own
     * five-row `sound\rank_<mode>_<song><tier>.bin`, read per row and tier
     * by the ctor (songselectctor.cpp:843 -> m430cf0 @0x430cf0) and WRITTEN
     * BY THE NAME ENTRY (m456b20 @0x456b20). The port used to show the
     * first table on both page kinds, and nothing ever writes it for a keys
     * song - so a score you had just entered never appeared (the owner,
     * 2026-09-03). */
    EzTexture      *rankpanel, *rankpanel_m;
    EzTexture      *rankglyph[48];
    signed char     rankmap[128];
    int             rank_tried;
    ez2_mode_ranking ranktab;
    int             rank_for;                /* which cursor it holds; -1 */
    ez2_ranking     songrank;                /* the keys pages' five rows */
    int             songrank_for;            /* cursor it holds; -1 */
    int             songrank_tier;           /* and the tier */
    /* THE OPTION LAYER - f_20c6bc @0x20c6bc, toggled by FX1. While it is up
     * FX2/FX3/FX4 are the three player options instead of the category
     * pager; the counters are the game's own (cardreader/03). */
    /* f_20c6bc: 0 CLOSED, 1 category one, 2 category two. FX1 steps it and
       the THIRD press closes - update2 @0x446540's non-Ruby arm is
       `if (f_20c6bc == 2) f_20c6bc = 0; else f_20c6bc++`, and RubyMix's own
       arm closes at 1 instead, so that mode has a single page. The same
       press also flips g_37dced4 in the per-mode handler
       (`if (getState(6) == 2 && f_20c6bc >= 1) { g_37dced4++; if (== 2) =
       0; }`), which is the READOUT page - so page = opt_page - 1 and the two
       counters move together. This was modelled as a bool, which is why
       category two could not be reached. */
    int             opt_page;
    /* The five counters the panel's four rows read, named for the globals
       songselectinput.cpp:638 seeds them from. One per row per page, plus
       the note arrangement which is `order`. */
    int             opt_a4;    /* g_37dcea4, 0..0xb - page one, row 5 */
    int             opt_c8;    /* g_37dcec8, 0..3   - page two, row 4 */
    int             opt_ee4;   /* g_37dcee4, 0..3   - page two, row 5 */
    int             opt_auto;  /* g_37dcee8, 0..3   - the auto assist */
    int             opt_bga;   /* g_37dced0, 0..2   - page two, row 6 */
    /* THE PANEL ITSELF and the slide that brings it on. update2 @0x446540
       moves f_20c6c0 by +-50 a frame, clamped to [0, 511], toward 511 while
       the layer is up; update @0x443380 then draws the effector panel at
       (511 - slide, 0) and the style panel at (833 - slide, 317) through
       their charts' own f214/f218 origin. At slide 0 both sit off the right
       edge of a 640-wide screen, which is what makes it a slide-in. */
    ez2_bga_clip   *optpanel;                /* m_20cb10, EffectPanel.str */
    ez2_bga_clip   *stylepanel;              /* m_c05a8, STYLE_SELECT.str */
    int             optpanel_tried;
    int             optpanel_key;            /* page + all three indices */
    int             stylepanel_at;           /* frame the style chart restarted */
    int             stylepanel_style;        /* which style its row 2 shows */
    /* THE RANKING PANEL'S OWN EASE - g_1b2eb74 toggles it (FX4), and
       update2 @0x446540 runs the slide and the fade off that flag. */
    /* 2P'S OWN OPTIONS, and why they are not the same fields as 1P's above.
     *
     * The option layer above is the ORIGINAL's, reconstructed: FX1 toggles
     * it and FX2/FX3/FX4 step the counters (update2 @0x446540,
     * input5KeyMix @0x43ff00). The effector row is 1P's hardware - the
     * cabinet has one, on 1P's side - so as faithfully reconstructed, that
     * layer is reachable by 1P and nobody else, and in a two-player credit
     * both sides then play on 1P's choices.
     *
     * These are the port's addition, not a correction of the original: 2P
     * gets their own set through the panel, opened with the same
     * START + KEY3 on their own bank that opens the in-play one. 1P's path
     * is untouched. */
    int             p2_joined;      /* 2P has touched their panel */
    /* THE TWO SETS THE SCREEN IS FILLING IN. `opts[0]` starts as the command
     * line's and takes 1P's panel choices; `opts[1]` starts UNSET and takes
     * 2P's, so every field 2P never touched still says "follow 1P" when
     * play_chart resolves the pair. The counters below are what the panel
     * DRAWS - the game's own g_37dc* - and these are what a stage is told. */
    ez2_player_opts opts[EZ2_PLAYERS];
    /* 2P's own copy of the ORIGINAL's panel: a second EffectPanel.str with
     * 2P's counters bound to its four cells. A second clip rather than one
     * drawn twice, because the cell textures are bound INTO the clip - one
     * clip cannot show two players' values in the same frame. */
    ez2_bga_clip   *optpanel2;
    int             optpanel2_key;
    float           p2_opt_slide;
    int             p2_opt_page;
    int             p2_order;
    int             p2_a4, p2_c8, p2_ee4, p2_bga;

    int             rank_on;      /* g_1b2eb74 */
    float           rank_slide;   /* f_20c69c, 0 .. 213 */
    float           rank_ramp;    /* f_20c6a0, 0 .. 300 - shapes the slide */
    int             rank_bright;  /* f_20c698, 0 .. 255 */
    float           opt_slide;               /* f_20c6c0 */
    ez2_bga_clip   *disccur;                 /* system\SongSelect\TT_DiscCur.str */
    unsigned        disccur_frame;
} SelectState;
#define FADE_OUT_FRAMES 10

/* The screens' limits and thresholds, from the ctors and handlers named
 * above. TT_NONE is a screen the original never reads the total on. */
#define TT_NONE          0, 0
#define TT_MODE_SELECT   0x14, 0x14
#define TT_NAME_ENTRY    5, 5

/* One screen's fade state: entering for the first FADE_IN_FRAMES, leaving
 * for FADE_OUT_FRAMES once something called fade_leave. */
typedef struct {
    int leave_at;                  /* frame the screen decided to end, or -1 */
    int in_frames, out_frames;     /* 0 = the defaults above, < 0 = no fade-in; a ScrFader's own
                                      step is 256/step frames (@0x450420) */
} Fade;


/* One per-song placement waiting for its name. */
typedef struct {
    char mode[24];
    char key[EZ2_STAGE_NAME];
    int  tier;
    int  place;
    int  score;
} PendingName;

/* THE RANKING SCREEN IS NAME ENTRY - the game's flow, per the owner: the
 * RESULT places the score (@0x450690's pass) and this screen asks for the
 * name that goes on it, feeding the per-song tables song select shows
 * (readRanking @0x430cf0). On factory-default tables nearly every finished
 * 1P session places, which is why the screen shows up after almost every
 * credit. The mode-wide table (ranking_<mode>.bin, read the way the
 * screen's own loader @0x4580e0 reads it) is drawn as the backdrop; whether
 * the screen also WRITES that table has not been read, so the port does not.
 *
 * Scratch turns the letter, keys 1/5 move the cursor, START confirms. When
 * the frame budget or the timer runs out the current name stands - a
 * cabinet's name entry times out too. */
/* THE RANKING SCREEN - the mode-wide table on the wheel's own row art.
 *
 * One row is m4574c0 @0x4574c0 (call-exact, src/rankingrow.cpp): the
 * four-digit place (20x37 white_entry cells, leading zeros suppressed, the
 * ones digit always drawn), the dot glyph tucked 5 back, the eight
 * 16x16 nrf glyphs through the kEntryChars map, and the seven 19x18
 * scfont digits on a line 18 below - white for the player's own place,
 * 0x646464 grey otherwise. The column walk is m459870 @0x459870 (100%):
 * rows 46 apart from y=189 down to 465, the columns at x=63 and x=383
 * (src/rankingupdate.cpp's own calls). The attract drifts the scroll; the
 * game's wheel physics (update2's tween) drive it when a player is
 * turning, which the port does not model yet. */
typedef struct {
    EzTexture *place[11];      /* white_entry_0..9 + the dot at [10] */
    EzTexture *glyph[50];      /* nrf_00..49 */
    EzTexture *score[10];      /* scfont_0..9 */
    signed char map[128];      /* kEntryChars @0x4ae454 inverted */
} RankArt;



/* THE MACHINE'S PLAYBACK DEVICES, enumerated once when the settings page is
 * built. Global because the menu widget holds POINTERS to its choice strings
 * and does not copy them, so they have to outlive the page. */
#define EZ2_MAX_AUDIODEV 16
/* THE LANGUAGE ROW: "ORIGINAL" then one per text/strings.<lang>.ini beside
 * the executable (ez2/textspec.h). The codes are the files'; the labels
 * are the bitmap font's ASCII. */
#define EZ2_MAX_LANGS 12

/* THE PORT PAGE'S ROWS, by name. The first five ARE the settings file, in the
 * order it writes them; the rest of the page is doors and captions. */
#define PORT_ROW_WIDE    0
#define PORT_ROW_FULL    1
#define PORT_ROW_BGA     2
#define PORT_ROW_UI      3
#define PORT_ROW_AUDIO   4
/* WHICH CARD the exclusive path takes. It is a value row like the four above
 * it, but its choices are the machine's, not a fixed list - so it is the last
 * of the persisted rows and the loop that copies values across has to stop
 * after it rather than at PORT_ROW_AUDIO. */
#define PORT_ROW_AUDIODEV 5
#define PORT_ROW_LANG    6
#define PORT_ROW_VOLUME  7      /* ...and the last of the value rows */
#define PORT_ROW_KEYMAP  9
#define PORT_ROW_BACK   14
#define PORT_ROW_BG     11      /* BACKGROUND (UseBackground) */

/* The LIGHTING TEST page's rows - TestLightingSink::onMenu @0x475e60's three,
 * with a caption between the values and the door. */
#define LIGHT_ROW_NEON   0
#define LIGHT_ROW_LAMP   1
#define LIGHT_ROW_BACK   3

/* THE TOTAL RESULT - the radio runners' SECOND runResult after the fourth
 * stage (`if (countListA() != 2 && g_elemCount >= 3) { g_1b2e7c4 = 1;
 * runResult(); }`, moderunner.cpp:1114-1119), which Screen48D380::s5
 * @0x450620 turns into a TotalResultDirector. Ctor @0x454990, update2
 * @0x454800, update @0x4546e0 (SCREEN-AUDIT.md 6.9, 13). The radio arm:
 *   bg\TRCourse_bg.spv behind BG_R.str (looped) and result_grad at
 *   (-5,-1) 645 wide, blend (9,6); totalresult_R.str with the mode icon in
 *   cell 7; TotalR_csName_R.str with the channel tag (Channel_Tag\<fam>\
 *   <channel>) in cell 1 and the course level (LvFont\lv%02d) in cell 2,
 *   looping from frame 0x33; totalresult_scR.str carrying the readouts -
 *   per-stage rate x10 in cells 9, 0xd, 0x11, 0x3b (small font), the
 *   stage scores in 0x15, 0x1c, 0x23 and 0x3f (the last reads stage 3's
 *   score again - as the ctor has it), the course rate x10 in 0x2a and the
 *   total in 0x2e (big font), the last stage's max combo clamped 9999 in
 *   0x47, the rank art in 0x38 and the per-stage art in 0x35..0x37, 0x46;
 *   TotalR_SongName_R.str with the four trimmed song names in cells 1..4
 *   and their discs in 5..8; TotalR_Allcombo_R.str looping from 0x5a with
 *   AllCombo_not(_m) in cells 3i+1..3i+3 for every stage that was not a
 *   full combo. The four R clips sit at (-18, 0). The course rate is the
 *   four rates x 0.025, graded on the eleven-step 55..100 ladder;
 *   TotalResult_bgm loops from the ctor; the screen fades in ten a tick,
 *   holds for 0x438 = 1080 ticks or any play/START key (m4191c0), then
 *   decide.wav and a fade out ten a tick to a floor of one. The rank and
 *   stage art tables (@0x4ae318..) are placeholder .rdata in the decomp;
 *   the folder names them rank_<grade> and srank_f_<grade> (the failed set
 *   - the cleared per-stage art's names are not recoverable from the
 *   placeholder, so a cleared stage keeps the clip's own cell). */
typedef struct {
    long  score;
    int   rate10;                   /* g_1b2ebf8: rate x 10 */
    int   max_combo;
    int   failed;                   /* g_1b2efc0 */
    int   allcombo;                 /* g_1b2f070 */
    int   grade;                    /* the stage's rank index */
    char  stem[EZ2_STAGE_NAME];
} StageRec;

/* ---- shared globals (defined in the file that owns them) ---- */
extern ez2_layout g_layout;
extern int g_field_anchor;
extern int g_ui_anchor;
extern int g_bg_anchor;
extern ez2_portcfg g_cfg;
extern ez2_portcfg g_cfg_saved;
extern char g_cfg_path[1024];
extern ez2_font g_font;
extern int g_font_ok;
extern int g_shot_taken;
extern int g_shot_skip;
extern int g_title_probe;
extern int g_mix_style;
extern int g_p2_join;
extern int g_seat;
/* The 1P channel a 2P one stands for while both seats are taken - see
 * core.c. Returns `ch` unchanged with one player. */
int menu_channel(int ch);
extern ez2_credit g_credit;
extern int g_game_version;
extern int g_adv_sound;
extern const char *g_screen_want;
extern const char *g_screen;
extern const char *g_import_root;
extern char g_exe_dir[1024];
extern int g_window_up;
extern int g_pace_fast;
extern ez2_keyconf *g_keyconf;
extern char g_keys_path[1024];
extern EzAudioDevice g_audiodev[EZ2_MAX_AUDIODEV];
extern int g_audiodev_count;
extern char g_text_dir[1024];
extern char g_lang_code[EZ2_MAX_LANGS][16];
extern int g_lang_count;

/* ---- shared functions ---- */
void layout_apply(void);
void fill_screen(unsigned int argb);
int load_keys(const char *exe);
const char *find_game_exe(const char *root);
void optpanel_draw(ez2_bga_clip *panel, int *keycache, int page, int order, int a4, int c8, int ee4, int bga, float dx, int frames);
int font_decode(void *ctx, const char **s, EzTextGlyph *g);
int game_mode_index(const char *name);
void fx_stamp(FxPanel *fx, int song_bpm, int pct, int scroll_bpm);
void fx_load(FxPanel *fx, const char *root, const char *mode_name, int cv2);
void fx_free(FxPanel *fx);
void lights_frame(int shape, const char *mode_name);
void lights_off(void);
void import_progress(const char *folder, int index, int total, void *user);
int import_bmson(const char *folder, const char *out_root, char *key, size_t n);
void trace_screen(void);
int  ez2_faithful(void);      /* core.c: the deliberate departures switched off */
void take_shot(const char *shot);
void strip_variant(char *sw);
void select_free(SelectState *st);
void select_refresh(SelectState *st, const ez2_songdb *db, const char *root, const char *mode_name, const ez2_select_wheel *wheel);
int menu_events(EzInputEvent *ev, int cap, int limit, int thresh);
void frame_pace(void);
void credit_plate_free(void);
void credit_plate_draw(const char *root);
void credit_plate_set_y(float y);     /* 0 = the usual 440; catch: 669 */
void credit_pump(const EzInputEvent *ev, int nev);
int read_bookkeeping_coins(const char *root);
void draw_fade(int level);
void fade_reset(Fade *f);
void fade_leave(Fade *f, int frame);
int fade_gone(const Fade *f, int frame);
int fade_level(const Fade *f, int frame);
void draw_texture_hgrad(EzTexture *t, float x, float y, float w, float h,
                        unsigned int left, unsigned int right);
void draw_texture(EzTexture *t, float x, float y, float w, float h, unsigned int color);
void draw_texture_rot(EzTexture *t, float x, float y, float w, float h, float angle, unsigned int color);
void order_by_allsong(const char *root, const char *mode_name, const char *exe, ez2_songdb *db);
void cv2_fx_stamp(SelectState *st);
void cv2_fx_press(SelectState *st, int which, int kind, const char *name);
void seed_page(const ez2_songdb *full, int cat, ez2_songdb *page);
void timefont_draw(int value);
void cv2_timefont_draw(SelectState *st, int value);
void timecount_play(const char *root);
void timefont_free(void);
int run_select(ez2_songdb *db, const ez2_songdb *full, const char *root, const char *mode_name, SelectState *st, ez2_song_chart *out, int frame_limit, const char *shot, int auto_pick, int stage, int rounds);
int run_result(const PlayResult *r, const char *player, const char *root_for_result, int frame_limit, const char *shot, int stage, int rounds);
int run_clip_screen(ez2_bga_clip *clip, const char *sound_path, int hold, int skippable, int frame_limit, const char *shot, const char *credit_root);
int run_mode_intro(const char *root, const char *mode_name, int frame_limit, const char *shot);
int run_mode_interlude(const char *root, const char *mode_name, int frame_limit, const char *shot);
void rank_art_load(RankArt *a);
void rank_art_free(RankArt *a);
void rank_row(const RankArt *a, const ez2_mode_ranking *mr, float x, float y, int c, int white, int alpha);
/* The song select's drawRankTable for another screen (the course wheel). */
void select_rank_table_draw(const char *root, const char *mode_name,
                            const char *key, float x, float y, float dx,
                            int bright);
int run_ranking_screen(const char *root, const char *mode_name, long session_score, int frame_limit, const char *shot);
const char *radio_family(ez2_mode m);
int run_channel_select(const char *root, const char *mode_name, const ez2_stageini *courses, const ez2_course **out, int frame_limit, const char *shot, int auto_go);
int run_eyecatch(const char *root, const char *mode_name, const char *channel, int stage_no, int frame_limit, const char *shot);
int run_name_entry(const char *root, const char *mode_name, char *name_io, size_t name_n, long session_score, int frame_limit, const char *shot);
void testmenu_draw(const ez2_menu *m, const char *hint, const char *hint2);
void testmenu_input_page(const ez2_keyconf *kc);
int keys_default_path(char *out, size_t n);
void run_keymap_page(int frame_limit, const char *shot);
int lang_build(const char **labels);
int audiodev_build(const char **labels);
void menu_step_value(ez2_menu *cur, ez2_menu *port, int *saved, int dir);
void run_video_page(void);
int run_test_menu(const char *root, const char *exe, const ez2_keyconf *kc, int frame_limit, const char *shot);
int run_title(const char *root, const char *exe, const char *shot, int auto_go, int fast);
int run_mode_select(const char *root, char *mode_out, size_t mode_n, const char *shot, int auto_go);
int any_play_key(const EzInputEvent *ev);
int run_total_result(const char *root, const char *mode_name, const char *channel, int channel_level, const StageRec *st, int n, long total, int frame_limit, const char *shot);
int run_game_over(const char *root, const char *mode_name, int frame_limit, const char *shot);
int run_ending(const char *root, const char *mode_name, int frame_limit, const char *shot);
int run_warning_short(const char *root, int frame_limit, const char *shot);
int run_warning(const char *root, int frame_limit, const char *shot);
void reset_chart_state(void);
int play_chart(const PlayOpts *o, PlayResult *res);
int main(int argc, char **argv);

#endif /* EZ2PLAY_H */
