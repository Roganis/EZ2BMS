/* ez2play/play.c - the play screen - the chart in memory, the playfield, and play_chart.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../../LICENSE.
 */
#include "ez2play.h"


typedef struct {
    double   time_ms;
    int      lane;               /* index into the mode's lane list */
    int      track;
    unsigned key_index;
    unsigned char velocity, pan;
    unsigned tick;               /* the note's own time, in chart ticks */
    unsigned hold_ticks;
    /* A catch fruit the paddle missed: judged, but still falling - the
     * original draws it to the field's bottom (measured: fruit to y 478
     * on playcatch_hits, none below the paddle on the port). */
    unsigned char fell;
    double   hold_ms;
    unsigned char kind;          /* the record's kind byte - picks the hold's
                                    instalment step, see ez2/score.h */
    /* Milliseconds per JUDGE tick (1/192 beat) at this note's position. The
     * windows are beat-relative, so every note carries its own conversion -
     * see ez2_tick_ms() and ../../docs/judge-timing.md. */
    double   tick_ms_size;
    int      judged;
} PlayNote;

typedef struct {
    double   time_ms;
    unsigned key_index;
    unsigned char velocity, pan;
    int      fired;
} AutoNote;

static PlayNote  g_notes[MAX_NOTES];
static int       g_note_count;
static AutoNote  g_auto[MAX_NOTES];
static int       g_auto_count;
static EzSound  *g_samples[EZ2_EZI_SLOTS];
/* ONE VOICE PER LANE, which is what the engine has: a CHANNEL, with a sample
 * bound into it (m40fbf0 @0x40fbf0) and its own level and pan (setVolume
 * @0x40f4a0 / setPan @0x40f550). Playing the shared sample object instead
 * made two lanes fight over one voice - see platform.h's note on
 * 11stargazer, where the same sample is deliberately placed on two lanes at
 * opposite pans so that holding both restores the stereo image. */
static EzSound  *g_lane_voice[EZ2_MAX_LANES];

/* ---- loading ------------------------------------------------------------ */


/* Load the key tables ONCE, up front, and fail loudly there.
 *
 * Doing it per file made every failure look like a bad file: a mistyped or
 * relative --exe reported "cannot read CHART.ez as a chart", which points at
 * the one thing that was fine. Diagnostics should name the thing that broke. */
/* The tables themselves are ez2_file_read_decrypted's business - it caches one
 * per kind. This only proves, once and early, that they CAN be had. */
int load_keys(const char *exe)
{
    ez2_keytable probe;
    int k, rc;

    for (k = 0; k < EZ2_KEY_COUNT; k++) {
        rc = ez2_keytable_from_exe(exe, (ez2_keykind)k, &probe);
        if (rc != EZ2_KT_OK) {
            ezLogErrf("ez2play: --exe %s: %s\n"
                      "  It must point at your own UNPACKED EZ2AC executable, "
                      "and\n"
                      "  a relative path resolves against the CURRENT "
                      "directory,\n"
                      "  not the chart's.\n",
                      exe, ez2_keytable_strerror(rc));
            return 0;
        }
    }
    return 1;
}


/* THE OTHER HALF OF THE DROP-IN: finding the executable the key tables live
 * in, when nobody passed `--exe`.
 *
 * The tables are 512 bytes of the original's `.rdata` and this repository
 * neither carries them nor may (ez2/keytable.h), so one file in the folder has
 * to be the user's own copy of the game. Which one cannot be guessed from the
 * name: a real data folder holds several `.exe` files, the shipped `EZ2AC.exe`
 * is Themida-packed and will NOT work, and the unpacked copy a person makes
 * gets whatever name they felt like. So this does not guess - it TRIES each
 * one, and the key tables coming out cleanly is the test.
 *
 * When none works but exes were seen, saying so is the whole value: "there is
 * an EZ2AC.exe here but it is packed" is a fixable message, and "cannot read
 * CHART.ez as a chart" - which is what the old path produced - is not. */
const char *find_game_exe(const char *root)
{
    enum { MAX_EXES = 32 };
    /* Static, and the winner is returned by POINTER rather than copied out:
     * the caller holds `exe` for the whole run anyway, and copying meant
     * naming a size twice. */
    static char paths[MAX_EXES][512];
    ez2_keytable probe;
    int n, i, k, ok;

    if (!root)
        return 0;

    n = ez2_vfs_children_ext(root, ".exe", &paths[0][0], sizeof paths[0],
                             MAX_EXES);
    for (i = 0; i < n; i++) {
        ok = 1;
        for (k = 0; k < EZ2_KEY_COUNT && ok; k++)
            ok = ez2_keytable_from_exe(paths[i], (ez2_keykind)k, &probe)
                 == EZ2_KT_OK;
        if (ok)
            return paths[i];
    }

    if (n > 0) {
        ezLogErrf("ez2play: %d executable%s in %s, and none of them holds "
                  "the\n"
                  "  key tables. The shipped EZ2AC.exe is packed - put your "
                  "own\n"
                  "  UNPACKED copy in this folder, or name one with --exe.\n",
                  n, n == 1 ? "" : "s", root);
    }
    return 0;
}


/* The tempo map, same shape as ez2render's. */
/* The tempo map lives in ez2/chart.c - it was three copies, one per tool, and
 * two returned milliseconds where the third returned seconds. */
static ez2_tempo g_tempo;
static unsigned  g_tpm;        /* ticks per measure, for the measure lines */

static int gds_key_for_channel(int ch)
{
    switch (ch) {
    case EZ_IN_KEY1: return EZ2_GDS_KEY_1;
    case EZ_IN_KEY2: return EZ2_GDS_KEY_2;
    case EZ_IN_KEY3: return EZ2_GDS_KEY_3;
    case EZ_IN_KEY4: return EZ2_GDS_KEY_4;
    case EZ_IN_KEY5: return EZ2_GDS_KEY_5;
    case EZ_IN_KEY6: return EZ2_GDS_KEY_6;
    case EZ_IN_KEY7: return EZ2_GDS_KEY_7;
    case EZ_IN_SCRATCH_UP:   return EZ2_GDS_SCRATCH_UP;
    case EZ_IN_SCRATCH_DOWN: return EZ2_GDS_SCRATCH_DOWN;
    case EZ_IN_PEDAL:        return EZ2_GDS_PEDAL;
    /* THE EFFECTOR ROW IS THE CABINET'S KEYS 6..9: the descriptors give
     * 7StreetMix's sixth and seventh lanes Key=6 and 7 (EF1, EF2) and
     * SpaceMix's four extra lanes 6..9, and those are the buttons the
     * cabinet has there - the KEY6/KEY7 channels above are a keyboard's
     * way of reaching the same lanes. Measured 2026-09-08 (tools/oracle):
     * the original clears 7K and 14K on presses of these buttons; the
     * port dropped them. */
    case EZ_IN_EFFECT1: return 6;
    case EZ_IN_EFFECT2: return 7;
    case EZ_IN_EFFECT3: return 8;
    case EZ_IN_EFFECT4: return 9;
    /* Player 2's bank, as the shipped descriptors spell it: 18..22 for the
     * five keys, 8/9 for keys six and seven (spacemix.gds), 23/24 for the
     * scratch pair, 25 for the pedal. One ClubMix/SpaceMix slot spans both
     * banks, so these route P2's hands onto the right half of the shared
     * field with no other change. */
    case EZ_IN_P2_KEY1: return 18;
    case EZ_IN_P2_KEY2: return 19;
    case EZ_IN_P2_KEY3: return 20;
    case EZ_IN_P2_KEY4: return 21;
    case EZ_IN_P2_KEY5: return 22;
    case EZ_IN_P2_KEY6: return 8;
    case EZ_IN_P2_KEY7: return 9;
    case EZ_IN_P2_SCRATCH_UP:   return 23;
    case EZ_IN_P2_SCRATCH_DOWN: return 24;
    case EZ_IN_P2_PEDAL:        return 25;
    default: return -1;
    }
}

static int cmp_note(const void *a, const void *b)
{
    double x = ((const PlayNote *)a)->time_ms, y = ((const PlayNote *)b)->time_ms;
    return x < y ? -1 : (x > y ? 1 : 0);
}

/* THE KEYSOUND - KEZPlayer::reseedLane @0x40ffa0, vtable slot 32.
 *
 * A playable lane's notes are NOT sounded by the song clock. The stage setup
 * gives every one of the player's track handles kind 1
 * (`setKind(h, (g_1b5f2e0 != 0) + 1)`, ../../src/stagesetup.cpp:132) and
 * applyEvent @0x40fc50's note arm is gated `if (a->field_0x00 != 1)` - so the
 * event walk skips them. `g_1b5f2e0` is the AUTOPLAY option (include/judge.h
 * settles it), and it makes them kind 2 instead, which is exactly what makes
 * autoplay audible. The sound is fired on demand by reseedLane, which given a
 * lane finds the record nearest the clock - `findAfter`, then `findPrev` from
 * it, and whichever is closer when both exist - and re-runs its bind, volume,
 * pan and level.
 *
 * TWO CONSEQUENCES THE PORT HAD BACKWARDS. A missed note is SILENT: nothing
 * sounds it, because the walk skipped it and no press reseeded it. And a
 * press ALWAYS sounds something - there is no window on reseedLane's search,
 * so hitting a key between notes plays the nearer neighbour. The port
 * sounded every note at its scheduled time, missed ones included, and never
 * on a hit, which is the opposite arrangement.
 *
 * Returns the index of the record reseedLane would pick, or -1 when the lane
 * has none at all. */
static int keysound_pick(int lane, double now_ms)
{
    int before = -1, after = -1;
    int j;

    for (j = 0; j < g_note_count; j++) {
        if (g_notes[j].lane != lane)
            continue;
        if (g_notes[j].time_ms <= now_ms)
            before = j;                 /* the list is time-ordered */
        else { after = j; break; }
    }
    if (before < 0)
        return after;
    if (after < 0)
        return before;
    /* "pick whichever is closer": the original compares the clock against
     * the midpoint of the two record times. */
    return (now_ms <= (g_notes[before].time_ms + g_notes[after].time_ms) * 0.5)
           ? before : after;
}

static int cmp_auto(const void *a, const void *b)
{
    double x = ((const AutoNote *)a)->time_ms, y = ((const AutoNote *)b)->time_ms;
    return x < y ? -1 : (x > y ? 1 : 0);
}

/* ---- drawing ------------------------------------------------------------ */

static const unsigned int kLaneColour[] = {
    0xff40a0ff, 0xffffffff, 0xff40a0ff, 0xffffffff, 0xff40a0ff,
    0xffffc040, 0xffffc040, 0xffff4040, 0xff40ff80, 0xffc080ff,
    0xff40a0ff, 0xffffffff, 0xff40a0ff, 0xffffffff, 0xff40a0ff, 0xffffc040
};

/* The game's own font, when the tree has it - see the adapter below. Declared
 * here because draw_playfield sizes its rows by it. */
ez2_font g_font;
int      g_font_ok;

/* The play field's skin - the game's own .pvi and textures (scene/skin.h).
 * NULL when the mode has none in this tree, in which case draw_playfield
 * falls back to the port's own bars. */
static ez2_skin *g_skin;

/* THE SCROLL - the game's own placement, in chart TICKS (ez2/scroll.h). The
 * port scrolled in milliseconds until 2026-08-30; the two agree on a
 * constant-BPM chart and diverge on every chart with a tempo change. */
/* ONE SCROLL PER PLAYER, and a map from lane to player so the file-scope draw
 * helpers can pick - `lane_player[]` is a local in play_chart and they cannot
 * see it.
 *
 * `g_scroll_split` is the fidelity switch. It is set only when the two sides'
 * options actually differ (ez2/playeropts.h); until then index 0 is used for
 * everything and every path is the one that ran when there was a single
 * `g_scroll`, so one-player runs and matched duo runs are unchanged. */
static ez2_scroll    g_scroll[EZ2_PLAYERS];
static unsigned char g_lane_player[EZ2_MAX_LANES];
static int           g_scroll_split;

/* ---- TWO FIELDS -----------------------------------------------------------
 *
 * Two players is two FIELDS, and the original draws them from two different
 * panel files: `STYLE_<mode>N_0.pvi` on the left and `_1` on the right, each
 * with its own tracks, gauge, score, combo and target bar, with the battle
 * meter between them. Recorded on the original for the first time
 * (scripts/two5k.osc): 1P's panel art is `1p_*` at x 18..190, 2P's is `2p_*`
 * at 428..500, and `battle_obj` / `battle_counter` sit at 260..290.
 *
 * `lanes[]` is one flat list - slot 0's lanes then slot 1's - because the
 * judge, the note store and the scroll are all keyed by that index already.
 * What the SKIN needs is different: each player's lanes are tracks 0..n-1 of
 * THEIR OWN panel, so a flat lane 7 is that player's track 0. These two maps
 * are what every per-lane skin call goes through. */
static ez2_skin     *g_skin_p[EZ2_PLAYERS];
static unsigned char g_lane_track[EZ2_MAX_LANES];
static int           g_two_players;   /* the stage has two seats - see lane_pan_pos */
/* THE READY COUNT IS RUNNING. Its own frames draw the field, but not the
 * measure GRID: the original draws no measure line at all through the count,
 * where the port drew one for every one of its 379 frames - the boundary at
 * tick 0, sitting on the judgement line because the chart clock has not
 * started. Measured in every keys mode (2026-09-10: 379 draws against zero
 * on 5K, Ruby, 7K, the 5K course and RadioMix alike; EZ2Catch, which draws
 * no grid, is the one that does not show it). */
static int           g_ready_counting;
static int           g_field_anchor_p[EZ2_PLAYERS];

static ez2_skin *skin_for_lane(int lane)
{
    if (lane < 0 || lane >= EZ2_MAX_LANES)
        return g_skin_p[0];
    return g_skin_p[g_lane_player[lane]] ? g_skin_p[g_lane_player[lane]]
                                         : g_skin_p[0];
}

static int track_for_lane(int lane)
{
    if (lane < 0 || lane >= EZ2_MAX_LANES)
        return 0;
    return (int)g_lane_track[lane];
}

/* TWO PLAYERS SPLIT THE KEYSOUNDS BETWEEN THE SPEAKERS, and the rule is in
 * the stage setup rather than anywhere near the mixer. PlayerSlot::beginStage
 * @0x4305a0 (../../src/stagesetup.cpp), and its catch and GF twins, open with
 *
 *     if (countListA() > 1)
 *         for every track of this slot
 *             clock->setPan(handle, id != 0 ? 0x7f : 0);
 *
 * - only when two players are seated, and per slot. The clock's slot 17 is
 * KEZPlayer::setEntryPan @0x40fb70, which does NOT set the pan: it sets the
 * entry's pan POSITION at +0x20, the bias `setPan` @0x40f550 then folds into
 * every later pan the notes carry (ez2/mixparam.c is that function). A bias
 * of 0 collapses any note's pan to hard left and one of 0x7f to hard right,
 * so player one's whole lane set comes out of the left speaker and player
 * two's out of the right, whatever the chart wrote per note. With ONE player
 * the loop never runs and the notes keep their own pan - which is why this is
 * a two-player-only rule and not a mixer default.
 *
 * The backing track is not in either player's TrackList and is not panned.
 *
 * WHAT IS DELIBERATELY NOT COPIED: the engine's sound entries are indexed by
 * the chart TRACK and both players' lanes carry the same tracks, so on the
 * cabinet the two share one voice per track and each hit cuts the other's.
 * The owner listened to it (2026-09-09) and called it what it is - "not
 * pleasant and pretty much a bug" - so the port keeps a voice per LANE and
 * both sides sound independently. The pan below is the same code's intent,
 * which is worth having; the cutting is not. ../../NEEDS-OWNER.md item L. */
static int lane_pan_pos(int lane)
{
    if (!g_two_players || lane < 0 || lane >= EZ2_MAX_LANES)
        return EZ2_PAN_CENTRE;
    return g_lane_player[lane] ? 0x7f : 0;
}

/* THE ORIGINAL'S OPTION PANEL, drawn for ONE player.
 *
 * EffectPanel.str with its four value cells bound to that player's counters.
 * Hoisted out of draw_select so the same panel can serve 2P beside 1P - it
 * was inline, which is why the port's first per-player panel was a drawn
 * rectangle instead of this.
 *
 * The layer numbers, the two pages and which counter each cell shows are the
 * original's (input5KeyMix @0x43ff00 switches on g_37dced4); only the fact
 * that the values arrive as arguments is new. `dx` places it: 0 is where the
 * art is authored, which is the right-hand side.
 *
 * THIS IS THE SONG SELECT'S PANEL AND IT BELONGS THERE. The in-play options
 * are a different, smaller asset - system\InGameEffector\ - which the port
 * draws as FxPanel. Putting this one over the play field, which the port did
 * briefly, covers the notes with a 363 px page of pre-song choices. */
void optpanel_draw(ez2_bga_clip *panel, int *keycache, int page,
                          int order, int a4, int c8, int ee4, int bga,
                          float dx, int frames)
{
    static const char *const kOptIcon[] = {   /* f_bfee8, 0..10 */
        "RANDOM_OFF", "RANDOM", "SRANDOM", "PS", "FR", "MRANDOM",
        "HRANDOM", "MIRROR", "MIRROR_A", "KEY", "SP"
    };
    static const char *const kFadeIcon[] = {  /* f_bfed4, 0..3 */
        "FADEOUT_OFF", "FADEOUT", "FADEIN", "BLINK"
    };
    static const char *const kBgIcon[] = {    /* f_bff58, 0..2 */
        "BG_ON", "BLACK", "BG_OFF"
    };
    /* f_bfe5c, 0..3 - the ctor spells these three in mixed case. */
    static const char *const kRevIcon[] = {
        "Reverse_off", "Reverse_on", "4D_on", "5D_on"
    };
    char ip[256];
    int r4, r5, r6, key;

    if (!panel)
        return;

    if (page == 1) {
        r4 = (order >= 0 && order < 11) ? order : 0;
        r5 = a4 % 12;
        r6 = 0;
    } else {
        r4 = c8 & 3;
        r5 = ee4 & 3;
        r6 = bga % 3;
    }
    /* One key over the page and all three indices - a cell is only re-set
     * when something it shows MOVED, because set_texture reloads the image
     * from disk. */
    key = (page << 24) | (r4 << 16) | (r5 << 8) | r6;
    if (*keycache != key) {
        snprintf(ip, sizeof ip,
                 "system\\SongSelect\\Effector\\EFFECTOR_CATE_%d.bmp", page);
        ez2_bga_clip_set_texture(panel, 3, 0, ip);

        snprintf(ip, sizeof ip,
                 "system\\SongSelect\\Effector\\EFFECTOR_%s.bmp",
                 page == 1 ? kOptIcon[r4] : kFadeIcon[r4]);
        ez2_bga_clip_set_texture(panel, 4, 0, ip);

        if (page == 1)
            snprintf(ip, sizeof ip,
                     "system\\SongSelect\\Effector\\EFFECTOR_NOTE_%02d.bmp",
                     r5 + 1);          /* the ctor loads i+1 */
        else
            snprintf(ip, sizeof ip,
                     "system\\SongSelect\\Effector\\Effector_%s.bmp",
                     kRevIcon[r5]);
        ez2_bga_clip_set_texture(panel, 5, 0, ip);

        if (page == 1)
            snprintf(ip, sizeof ip,
                     "system\\SongSelect\\Effector\\EFFECTOR_AUTO_DISABLE.bmp");
        else
            snprintf(ip, sizeof ip,
                     "system\\SongSelect\\Effector\\EFFECTOR_%s.bmp",
                     kBgIcon[r6]);
        ez2_bga_clip_set_texture(panel, 6, 0, ip);

        *keycache = key;
    }
    if (ez2_bga_clip_frames(panel) > 0)
        ez2_bga_clip_draw_at(panel, frames % ez2_bga_clip_period(panel),
                             dx, 0.0f);
}

/* A MODE THAT USES PLAYER 2'S KEY BANK IS A ONE-PLAYER MODE - see the long
 * note at the `duo` decision for the evidence. Keys 8/9 and 18..25 are the
 * second half of the cabinet, and a mode whose own descriptor reaches for
 * them is a wide layout for one person, not a field two people share. */
static int mode_is_one_player(const ez2_gds *g, int lane_count)
{
    int li;

    if (!g)
        return 0;
    for (li = 0; li < lane_count && li < EZ2_GDS_MAX_TRACKS; li++) {
        int k = g->slots[0].lanes[li].key;

        if (k == 8 || k == 9 || (k >= 18 && k <= 25))
            return 1;
    }
    return 0;
}

/* The x range one player's lanes cover, for clipping the measure line to it.
 * Returns 0 when that side owns no enabled lane, which is every unsplit run's
 * player 2 and also a mode whose second bank is empty. */
static int lane_span(int player, float *x, float *w)
{
    float lo = 0.0f, hi = 0.0f;
    int lane, any = 0;

    for (lane = 0; lane < EZ2_MAX_LANES; lane++) {
        float lx, lw;

        if (g_lane_player[lane] != (unsigned char)player)
            continue;
        if (!ez2_skin_lane_enabled(skin_for_lane(lane), track_for_lane(lane)))
            continue;
        lx = ez2_skin_lane_x(skin_for_lane(lane), track_for_lane(lane));
        lw = ez2_skin_lane_w(skin_for_lane(lane), track_for_lane(lane));
        if (!any || lx < lo)        lo = lx;
        if (!any || lx + lw > hi)   hi = lx + lw;
        any = 1;
    }
    if (!any)
        return 0;
    *x = lo;
    *w = hi - lo;
    return 1;
}

/* Which scroll a lane is drawn with. Unsplit, always the first - that is what
 * keeps the common path identical rather than merely equivalent. */
static const ez2_scroll *scroll_for_lane(int lane)
{
    if (!g_scroll_split || lane < 0 || lane >= EZ2_MAX_LANES)
        return &g_scroll[0];
    return &g_scroll[g_lane_player[lane]];
}
/* EZ2CATCH's paddle, published for the draw - draw_playfield is handed the
 * field's state rather than the play loop's locals, and this is the one
 * thing it needs that predates that split. */
static int   g_catch_paddle;
static float g_paddle_x, g_paddle_half;
static int   g_paddle_open[EZ2_MAX_LANES];
/* The chart's own scroll multiplier, from on-disk record type 6 - event kind
 * 7, `g_1b2e708 = ev->v.fvalue` (../../src/kezplayer.cpp:175). 6333 of these
 * appear across 24 of the 12,359 shipped charts, in a smooth ramp; the rest
 * of the library never leaves 1.0. Held as a tick-ordered list and walked by
 * the cursor, the way the event queue walks it. */
typedef struct { unsigned int tick; float mult; } ScrollPoint;
static ScrollPoint g_scrollpts[4096];
static int         g_scrollpt_count;
static int         g_scrollpt_at;      /* how many are already in force */
static float       g_chart_mult = 1.0f;

static int cmp_scrollpt(const void *a, const void *b)
{
    unsigned int x = ((const ScrollPoint *)a)->tick;
    unsigned int y = ((const ScrollPoint *)b)->tick;
    return x < y ? -1 : (x > y ? 1 : 0);
}

/* Advance the multiplier to the cursor. Rewinds cleanly because the caller
 * only ever moves forward, and a seek would reset the pair. */
static void scroll_mult_advance(double now_tick)
{
    while (g_scrollpt_at < g_scrollpt_count &&
           (double)g_scrollpts[g_scrollpt_at].tick <= now_tick)
        g_chart_mult = g_scrollpts[g_scrollpt_at++].mult;
}

static void draw_playfield(int lane_count, double now_ms, double now_tick,
                           const int *lane_down, const ez2_score *sc,
                           const ez2_song_ini *ini, long total_notes,
                           const char *last_judge, double last_judge_at,
                           const ez2_score *sc_p2)
{
    float field_w = 44.0f * lane_count;
    float x0 = (SCREEN_W - field_w) * 0.5f;
    char line[96];
    int i, lh;
    int pl, players = (sc_p2 && g_skin_p[1]) ? 2 : 1;

    /* ONE FIELD PER PLAYER, IN TURN, which is the order the original draws
     * them: its whole left field - bed, grid, notes, panel, score, gauge -
     * then its whole right one (measured, two5k). Each is a skin of its own
     * with its own anchor, so the loop is around the field and not inside
     * it. `players` is 1 unless a second skin actually loaded, which keeps
     * every one-player path exactly as it was. */
    for (pl = 0; pl < players; pl++) {
    ez2_skin *g_skin = g_skin_p[pl];
    const ez2_score *scp = pl ? sc_p2 : sc;
    /* THE KEYS THIS FIELD ANSWERS TO. `lane_down` is indexed by the flat
     * lane list - both players' lanes end to end - and a skin's press beam
     * and pressed-panel art are indexed by ITS OWN lane number. Handing the
     * flat array to the second field lit player one's hands on player two's
     * panel and left player two's own keys dark. */
    int down_pl[EZ2_MAX_LANES];
    const int *down = lane_down;
    int lanes_pl = lane_count;

    if (players > 1) {
        int L;

        memset(down_pl, 0, sizeof down_pl);
        lanes_pl = 0;
        for (L = 0; L < lane_count && L < EZ2_MAX_LANES; L++) {
            if ((int)g_lane_player[L] != pl)
                continue;
            down_pl[track_for_lane(L)] = lane_down ? lane_down[L] : 0;
            lanes_pl++;
        }
        down = down_pl;
    }

    if (g_skin) {
        /* THE GAME'S OWN FIELD: geometry, art and effects all come from the
         * skin; this function only places the notes on it. */
        float jy = ez2_skin_judge_y(g_skin);
        float top = ez2_skin_field_top(g_skin);

        /* THE FIELD IS ONE RIGID GROUP and it moves as one - lanes, notes,
         * key panel, gauge, score, combo, bombs. Every coordinate below stays
         * in design space; the anchor puts the group against the canvas edge
         * the .pvi says it belongs to. */
        ezPushAnchor(g_field_anchor_p[pl]);

        ez2_skin_tick(g_skin, now_ms, down, lanes_pl);
        /* The groove light pulses on the beat - one period per quarter at
         * the tempo under the needle. */
        {
            unsigned tk = ez2_tempo_tick_at_ms(&g_tempo, now_ms - LEAD_IN_MS,
                                               g_tpm);
            float bpm = ez2_tempo_bpm_at(&g_tempo, tk);

            if (bpm > 1.0f)
                ez2_skin_set_beat(g_skin, 60000.0 / (double)bpm);
        }
        ez2_skin_draw_bed(g_skin);
        /* EVERYTHING BELOW IS PLACED IN TICKS, not milliseconds - the game's
         * own metric (ez2/scroll.h). A note's distance from the line is
         * `(note.tick - now_tick) * 1.6 * speed`, and the tempo never enters
         * it: that is what keeps a beat the same height in a fast section and
         * a slow one. The cull is by SCREEN POSITION for the same reason -
         * a time window would cull a different set at every tempo. */
        /* The measure grid, under the notes (the panel draw @0x42dab0's
         * order): every boundary whose scrolled y is on the field. */
        if (g_tpm > 0 && !g_ready_counting) {
            /* THE GRID IS PER PLAYER ONCE THE SPEEDS DIFFER. A boundary is at
             * a different height for each side, so one full-width line would
             * be at the wrong height for one of them. Split, it is drawn once
             * per side and clipped to that side's lanes; unsplit, it is the
             * single full-width draw it has always been. */
            int pass, passes = g_scroll_split ? EZ2_PLAYERS : 1;

            for (pass = 0; pass < passes; pass++) {
                const ez2_scroll *sc = &g_scroll[pass];
                float span_x = 0.0f, span_w = 0.0f;
                long m = (long)(now_tick / (double)g_tpm) - 1;

                if (g_scroll_split && !lane_span(pass, &span_x, &span_w))
                    continue;                  /* this side owns no lanes */

                for (; ; m++) {
                    float y;

                    if (m < 0)
                        continue;
                    y = ez2_scroll_y(sc, jy, (double)m * (double)g_tpm,
                                     now_tick, 1.0f, 1.0f);
                    if (y < top - 200.0f)
                        break;                   /* past the top, and rising */
                    if (y >= top && y <= jy) {
                        if (g_scroll_split)
                            ez2_skin_draw_measure_span(g_skin, y,
                                                       span_x, span_w);
                        else
                            ez2_skin_draw_measure(g_skin, y);
                    }
                }
            }
        }
        for (i = 0; i < g_note_count; i++) {
            PlayNote *n = &g_notes[i];
            float y, hold_top;

            if (n->judged && n->hold_ticks == 0 && !n->fell)
                continue;
            if ((int)g_lane_player[n->lane] != pl)
                continue;             /* this pass is one player's field */
            if (!ez2_skin_lane_enabled(skin_for_lane(n->lane), track_for_lane(n->lane)))
                continue;
            {
                const ez2_scroll *sc = scroll_for_lane(n->lane);

                y = ez2_scroll_y(sc, jy, (double)n->tick, now_tick,
                                 1.0f, 1.0f);
                hold_top = n->hold_ticks
                         ? ez2_scroll_y(sc, jy,
                                        (double)(n->tick + n->hold_ticks),
                                        now_tick, 1.0f, 1.0f)
                         : y;
            }
            /* CULL BY THE TAIL, not by the head. m42a630 @0x42a630 tests the
             * TOP of the bar against the field's bottom (`if (yTop >= bottom)
             * return 0;`) and its own top against the window above - so a
             * long note stays on screen for as long as any part of it is,
             * which is what a hold IS. The port tested the head's y, so a
             * hold vanished the moment its head passed the line however much
             * of its body was still coming: "they disappear sooner than
             * their actual range". */
            /* THE WINDOW ABOVE IS THE SPRITE'S OWN HEIGHT, not forty: the
             * drawers return 2 when `e->f08 - vh > y` - the note's top edge
             * a whole texture height above the field's top - so a 6-pixel
             * bar enters at -6 and the catch's 128-pixel fruit at -128
             * (measured: catch notes born at y -127.5 on the original,
             * -69.5 on the port). `y` here is the head's centre. */
            {
                float nh = ez2_skin_note_h(skin_for_lane(n->lane), track_for_lane(n->lane));

                if (nh <= 0.0f)
                    nh = 80.0f;
                /* The catch drawer's y is the fruit's BOTTOM (its quad is
                 * drawn from y - vh), so the same `f08 - vh > y` test lets
                 * a fruit in with its top two heights above the field
                 * (measured: 64-pixel fruit born at -128). */
                /* And below: the tap drawer returns 0 once the note's top
                 * edge passes the track's bottom (`yv >= f10 + f08`), 375
                 * on 5K and 480 on the catch field - the port cut at the
                 * judge row + 40, which dropped the falling fruit at the
                 * paddle (measured: 19,600 note-frames against 12,300). */
                if (hold_top - nh * 0.5f >= ez2_skin_lane_bottom(skin_for_lane(n->lane), track_for_lane(n->lane)) ||
                    y < top - nh * (g_catch_paddle ? 1.5f : 0.5f))
                    continue;
            }
            /* NO TOP CLAMP. This used to pull the tail down to the field's
             * top edge, and a long note's tail is above that for most of its
             * life - so `hold_top` came out BELOW `y` (measured: y -39.9,
             * hold_top clamped to 0.0), the drawer's `hold_top < y` test
             * failed, and the whole hold fell through to the single-quad TAP
             * path. That is the rest of "long notes behave strangely": not
             * one bug but two, this and the head-based cull above.
             *
             * m42a630 @0x42a630 clamps only the BOTTOM - `if (capEnd >=
             * bottom) { h = bottom - capY; q3gate = 0; }`, shortening the
             * body and dropping the tail cap - and lets the top run off the
             * field. Clamping the head to the line is that same shortening. */
            if (y > jy && !g_catch_paddle) y = jy;   /* the head stops on the line - a fruit does not */
            {
                const ez2_scroll *bs = scroll_for_lane(n->lane);

                ez2_skin_draw_note(skin_for_lane(n->lane), track_for_lane(n->lane), y, hold_top, n->judged,
                                   bs ? bs->base * bs->rate : 0.0f);
            }
        }
        if (g_catch_paddle)
            ez2_skin_draw_paddle(g_skin, g_paddle_x, g_paddle_half,
                                 lane_count, g_paddle_open);
        else
            ez2_skin_draw_press(g_skin, down);
        ez2_skin_draw_front(g_skin, scp->score, scp->max_combo, scp->combo,
                            (float)(scp->gauge / scp->gauge_max));

        ezPopAnchor();
    }
    }   /* one field per player */

    if (g_skin_p[0]) {
        /* THE PANELS, over everything and outside the field anchor - each
         * slides from its own player's screen edge, so they take the canvas
         * edges rather than the field's. */
        /* The port's own readouts, kept small and out of the field: the
         * grade and rate, and the windows. This one is pinned to the screen's
         * right edge rather than the field's, so it takes the canvas edge. */
        if (ez2_faithful()) {
            (void)last_judge; (void)last_judge_at; (void)ini;
            return;
        }
        ezPushAnchor(EZ_ANCHOR_RIGHT);
        ezSetTextScale(g_font_ok ? 1 : 2);
        snprintf(line, sizeof line, "%s %d.%02d%%",
                 ez2_score_grade_name(sc, ez2_score_grade(sc, total_notes)),
                 (int)ez2_score_rate(sc, total_notes),
                 (int)(ez2_score_rate(sc, total_notes) * 100) % 100);
        ezDrawText(SCREEN_W - 16 - (int)strlen(line) * (g_font_ok ? 9 : 8),
                   SCREEN_H - 28, line, 0xffffc040);
        ezPopAnchor();
        (void)last_judge; (void)last_judge_at; (void)ini;
        return;
    }

    /* The bare field is the port's own debug view, not the game's art, so it
     * stays in design space and centred whatever --ui-mode says. */
    ezPushAnchor(EZ_ANCHOR_CENTER);

    /* The lane bed. */
    ezSetBlend(2, 1);                          /* ONE / ZERO */
    ezFillRect((int)x0, 0, (int)field_w, SCREEN_H, 0xff101018);

    ezSetBlend(5, 6);                          /* SRCALPHA / INVSRCALPHA */
    for (i = 0; i < lane_count; i++) {
        float lx = x0 + 44.0f * i;
        /* A pressed lane lights up - the only feedback that says the port
         * heard the key even when no note was there. */
        if (lane_down[i])
            ezDrawRect(lx + 1, 0, lx + 43, SCREEN_H, 0x18ffffff);
        ezDrawRect(lx + 43, 0, lx + 44, SCREEN_H, 0x30ffffff);
    }

    /* The judgement line. */
    ezDrawRect(x0, JUDGE_LINE - 2, x0 + field_w, JUDGE_LINE + 2, 0xc0ff4040);

    /* Notes, nearest first so an overlap reads correctly. The bare field
     * places them the same way the skinned one does - by tick. */
    for (i = 0; i < g_note_count; i++) {
        PlayNote *n = &g_notes[i];
        float y, lx, hold_top;

        if (n->judged && n->hold_ticks == 0)
            continue;

        y  = ez2_scroll_y(scroll_for_lane(n->lane), (float)JUDGE_LINE,
                          (double)n->tick,
                          now_tick, 1.0f, 1.0f);
        lx = x0 + 44.0f * n->lane;
        if (y < -40.0f || y > SCREEN_H + 40.0f)
            continue;

        if (n->hold_ticks) {
            hold_top = ez2_scroll_y(scroll_for_lane(n->lane),
                                    (float)JUDGE_LINE,
                                    (double)(n->tick + n->hold_ticks),
                                    now_tick, 1.0f, 1.0f);
            ezDrawRect(lx + 14, hold_top, lx + 30, y,
                       n->judged ? 0x60ffffff : 0x80ffffff);
        }
        ezDrawRect(lx + 3, y - 6, lx + 41, y + 6,
                   n->judged ? 0x40ffffff : kLaneColour[n->lane % 16]);
    }

    /* HUD. */
    /* THE ROW PITCH FOLLOWS THE FONT. The 3x5 fallback is 10px tall at scale
     * 2; the game font is 16 at scale 1, and drawing it at 2 on a 16px pitch
     * is what put SCORE through COMBO. */
    ezSetTextScale(g_font_ok ? 1 : 2);
    lh = g_font_ok ? 20 : 16;
    snprintf(line, sizeof line, "COMBO %ld", sc->combo);
    ezDrawText(16, 16, line, 0xffffffff);
    snprintf(line, sizeof line, "SCORE %ld", sc->score);
    ezDrawText(16, 16 + lh, line, 0xffffffff);
    snprintf(line, sizeof line, "%s %d.%02d%%",
             ez2_score_grade_name(sc, ez2_score_grade(sc, total_notes)),
             (int)ez2_score_rate(sc, total_notes),
             (int)(ez2_score_rate(sc, total_notes) * 100) % 100);
    ezDrawText(16, 16 + 2 * lh, line, 0xffffc040);

    snprintf(line, sizeof line, "K %ld C %ld G %ld M %ld",
             sc->counts[EZ2_J_KOOL], sc->counts[EZ2_J_COOL],
             sc->counts[EZ2_J_GOOD], sc->counts[EZ2_J_MISS]);
    ezDrawText(16, 440, line, 0xffa0a0a0);

    /* The gauge, down the right edge. */
    {
        float h = (float)(sc->gauge / sc->gauge_max) * 400.0f;
        ezDrawRect(600, 40, 624, 440, 0x40ffffff);
        ezDrawRect(600, 440 - h, 624, 440,
                   sc->gauge < 30.0f ? 0xffff4040 : 0xff40ff80);
        snprintf(line, sizeof line, "%d", (int)sc->gauge);
        ezDrawText(600, 20, line, 0xffffffff);
    }

    /* The last judgement, fading. */
    if (last_judge && now_ms - last_judge_at < 400.0) {
        ezSetTextScale(g_font_ok ? 2 : 3);
        ezDrawText(SCREEN_W / 2 - 30, 300, last_judge, 0xffffffff);
        ezSetTextScale(g_font_ok ? 1 : 2);
    }

    snprintf(line, sizeof line, "WINDOW %d %d %d %d T",
             ini->kool_ticks, ini->cool_ticks, ini->good_ticks, ini->miss_ticks);
    ezDrawText(400, 16, line, 0xff808080);

    ezPopAnchor();
}

/* ---- main --------------------------------------------------------------- */
/* ---- the game's own font ------------------------------------------------- */

/* The seam takes a DECODER, not a path: reading game data is not the
 * platform's job (platform.h). This is the whole adapter - ez2/font.c already
 * has the shape the seam asked for, because both were read off the same four
 * blitters under KGraphics::drawText @0x406f50. */

int font_decode(void *ctx, const char **s, EzTextGlyph *g)
{
    ez2_glyph e;

    if (!ez2_font_next((const ez2_font *)ctx, s, &e))
        return 0;
    g->bits    = e.bits;
    g->stride  = e.stride;
    g->w       = e.w;
    g->h       = e.h;
    g->advance = e.advance;
    return 1;
}

/* ---- one chart, start to finish ----------------------------------------- */

/* What the PREVIOUS chart left behind. The note arrays are a fixed-size arena
 * rather than an allocation, so a second chart needs only its counts reset -
 * but the sounds are real handles, and not freeing them is how a session loop
 * ends up playing the last song's keysounds over the next one. */
void reset_chart_state(void)
{
    int i;

    /* THE CHANNELS GO FIRST. They borrow a loaded sound's PCM, so a voice
     * still bound to one must be torn down before the sound it points at. */
    for (i = 0; i < EZ2_MAX_LANES; i++)
        if (g_lane_voice[i]) {
            ezSoundFree(g_lane_voice[i]);
            g_lane_voice[i] = 0;
        }
    for (i = 0; i < EZ2_EZI_SLOTS; i++)
        if (g_samples[i]) {
            ezSoundFree(g_samples[i]);
            g_samples[i] = 0;
        }
    g_note_count  = 0;
    g_auto_count  = 0;
    g_scrollpt_count = 0;
    g_scrollpt_at    = 0;
    /* PER CHART. A session plays several, and a split left set from a duo
     * stage would be read by the next one with a stale lane map. */
    g_scroll_split   = 0;
    memset(g_lane_player, 0, sizeof g_lane_player);
    g_two_players    = 0;
    g_ready_counting = 0;
    /* AND THE LANE->PANEL MAP BACK TO THE IDENTITY. `g_lane_track` says where
     * a flat lane sits in ITS OWN player's panel, and only the two-player
     * setup fills it; left at zero, every note in a one-player stage drew
     * with lane 0's art - the turntable's - and in a mode whose lane 0 is
     * disabled (5KeyMix) the enable test then culled every note on the
     * field. One player is the identity: lane i is panel row i. */
    {
        int li;

        for (li = 0; li < EZ2_MAX_LANES; li++)
            g_lane_track[li] = (unsigned char)li;
    }
    g_chart_mult     = 1.0f;
    ez2_tempo_free(&g_tempo);
}

/* 0 played it, 1 something was wrong, 77 ctest's skip. The platform and the
 * audio device belong to the CALLER - they outlive any one chart. */
int play_chart(const PlayOpts *o, PlayResult *res)
{
    const char *exe = o->exe, *root = o->root, *chart_path = o->chart_path;
    const char *shot = o->shot, *player = o->player;
    const char *rank_key;
    int auto_play = o->auto_play, fast = o->fast, save = o->save;
    int frame_limit = o->frame_limit;

    /* THE LIVE SPEED - the effector row's own stepper (m45f640 @0x45f640:
     * +-25 with the -24-at-the-999-cap asymmetry, clamped 50..999 - the
     * arithmetic ez2_speed_step_percent already carries). EFFECT1/2 step it
     * mid-song and the scroll recomputes, which is what the cabinet's
     * panel does; the readout flashes for a moment. */
    int live_pct2 = -1;
    /* THE TWO SIDES' OPTIONS, RESOLVED ONCE, HERE.
     *
     * `o->opts[1]` arrives unset wherever 2P never chose, so it is resolved
     * against 1P's set before anything reads it: a side that opened no panel
     * comes out identical to 1P, `same` is 1, and every path below is the one
     * that ran before per-player options existed. That is the fidelity rule
     * ez2/playeropts.h states, and this is the single place it is applied -
     * nothing downstream may read `o->opts` directly. */
    ez2_player_opts po[EZ2_PLAYERS];
    int same;
    int live_pct;
    double vclock = 0.0;
    double dt_sum = 0.0;         /* the oracle's press error, signed ms */
    long   dt_n = 0;
    double now_tick = 0.0;                     /* the scroll's cursor */
    int    o_bga = 1;                          /* resolved from the ini */
    int    sample_count = 0;
    /* THE READY COUNT - see the block above the load below. */
    ez2_bga_clip *ready_clip = 0;
    EzSound      *ready_a = 0, *ready_b = 0;
    int           ready_frame = 0, ready_total = 0;
    double        ready_ms = 0.0, ready_at = -1.0;
    int           ready_cue[3];
    int           ready_fired[3];
    int           counting = 0;
    /* Last frame's instalments-owed per lane - a fall means the pump paid
     * one, which is when the held note's effect re-fires. */
    long   hold_owed[24];
    /* WHAT THE PORT ACTUALLY SAW. `held_peak` is the most lanes it ever had
     * down at once and `hold_broken` how many holds ended because their key
     * came up with instalments still owed. Reported so "more than two held
     * long notes give misses" can be told apart: if the peak never reaches
     * three while three keys are held, the presses never arrived and the
     * keyboard is ghosting (few boards do 3+ simultaneous keys in one matrix
     * region); if it does reach three and holds still break, it is here. */
    int    held_peak = 0;
    long   hold_broken = 0;
    /* THE INPUT PATH, MEASURED. `age` is how long a key edge sat between the
     * timestamp SDL gave it and the frame that processed it - the part of the
     * latency the port can see. It says whether reading evdev directly would
     * be worth the permission story: the frame-sampling term is gone now, so
     * what is left here is the compositor's queueing plus SDL's own poll. */
    unsigned long age_n = 0, age_sum = 0, age_max = 0;
    double miss_window_ms = 0.0;               /* the widest MISS window on the chart */
    char sibling[2048];
    unsigned char *chart_bytes = 0, *ini_text = 0, *ezi_text = 0;
    size_t n = 0;
    ez2_chart chart;
    ez2_song_ini ini;
    ez2_ezi index;
    ez2_chart_id id;
    ez2_gds gds;
    const char *gds_mode;
    int gds_ok = 0;
    ez2_score sc;
    /* Player 2's book on a shared field (ClubMix/SpaceMix): the lanes route
     * by their .gds key bank, each side judged on its own half. */
    ez2_score sc2;
    int duo = 0;
    int lane_p1 = 0;      /* where player two's lanes begin in the flat list */
    int lane_player[EZ2_MAX_LANES];
    long total_p2 = 0;
    /* The battle meter - BattleMode::m41c060 @0x41c060's needle state
     * (f20/f24/f28/f2c) and m41bca0 @0x41bca0's winner banner, drawn only
     * in duo. */
    EzTexture *bt_needle = 0, *bt_win[3] = { 0, 0, 0 };
    /* THE METER'S BODY IS TWO CLIPS, not hand-placed plates. Measured on the
     * original's own two-player recording: `battle_OBJ.str` draws
     * battle_obj's mask and plate at (259.5,205.5) 120x140 and carries the
     * WINNER plate in its third cell at (283,219) 73x13, then the needle is
     * drawn over it, then `battle_OBJ2.str` puts battle_obj2 at (290,276)
     * 59x61 - six draws in that order. The port drew the needle and a
     * hand-placed banner and none of the dial. */
    ez2_bga_clip *bt_obj = 0, *bt_obj2 = 0;
    int bt_shown = -1;      /* which winner plate the clip's cell holds */
    float bm_target = 0.0f, bm_base = 0.0f, bm_step = 0.0f;
    int bm_phase = 0;
    /* The effector panel and its input state (update2 @0x41e620): START held
     * arms the speed section, and every action replays the pop-up. */
    FxPanel fx;
    /* ONE PER SIDE. This was a single flag fed by BOTH starts, and the dial
     * it armed was 1P's - so in a two-player credit, 2P holding their own
     * START and turning their own turntable changed 1P's note speed. The
     * gesture is the game's own (update2 @0x41e620: START arms the speed
     * section, START + turntable is the 0.01 dial); what was missing is that
     * it belongs to whoever pressed START. */
    int    start_held[EZ2_PLAYERS] = { 0, 0 };
    int lanes[EZ2_MAX_LANES], lane_count = 0, lane_down[EZ2_MAX_LANES];
    /* EZ2CATCH IS NOT A KEYS MODE. You do not press a lane; you move a
     * PADDLE across the field, and a lane the paddle covers catches whatever
     * falls down it. CatchMainGameDirector::m46d360 @0x46d360 is the whole
     * of it - the mover and the lane-open test both. */
    int   catch_mode = 0;
    /* SCRATCHMIX IS A FRET-AND-STRUM GAME - see the block at the judge. */
    int   scratch_mode = 0;
    double strum_until[EZ2_PLAYERS];   /* the fret latch, one per side */
    float paddle_x = 0.0f, paddle_half = 65.0f;
    int   paddle_open[EZ2_MAX_LANES];
    long total_notes = 0;
    const char *last_judge = 0;
    double last_judge_at = -1e9;
    int i, t, j, frames = 0, running = 1, use_wall = 0, quit = 0;
    ez2_bga *bga = 0;
    double last_now = 0.0;
    double start_ms = 0.0;             /* the stage clock's zero, fractional */
    int next_auto = 0;
    double end_ms = 0.0;
    double end_all_ms = 0.0;          /* the last record of ANY type */
    int end_all_type = 0;
    int end_ramp = 0;                 /* the end-of-round fade's tick count */
    /* THE GAUGE-OVER RAMP. An empty gauge does not stop the stage at once:
     * Panel::m429170 @0x429170 latches b118 when the filled-segment count
     * reaches zero and raises the gauge-over flag g_1b2eba4 once the stage
     * is past fifty ticks of g_1b5f19c (a stage-AGE counter - m420570
     * @0x420570 uses the same fifty as a start-up guard, so it is not a
     * grace period). update2 @0x4249e0 then ramps g_1b2e898 one a tick and
     * at 0x78 - 120 - fires the leave and clears the flag. The port let a
     * dead gauge play the chart out to its last note. */
    int dead_ticks = 0;               /* the stage's own age, in 60 Hz ticks */
    int dead_ramp = -1;               /* -1 until the gauge-over is raised */
    long dead_breaks_at = -1;         /* MISS+FAIL count when the gauge died */
    /* Effector6thStyle::update2 @0x41e620 plays System\GaugeOver\GaugeOver
     * .wav on the ramp's FIRST tick (`g_1b2e898 == 1`), and in RubyMix
     * alone update @0x41d920 draws GaugeOver.str over the field while the
     * flag is up (SCREEN-AUDIT.md 5.2). */
    EzSound *snd_gaugeover = 0;
    ez2_bga_clip *gaugeover_clip = 0;
    int gaugeover_frame = 0;
    /* THE STAGE'S TICK. Every counter above and below is an update2
     * @0x4249e0 step, and update2 runs once a frame at 60 Hz (Obj401780::run
     * @0x401930 paces 17/17/16 ms). This loop is deliberately unpaced (see
     * the READY note further down: ~770 iterations a second), so a counter
     * that steps "once per iteration" runs a dozen times too fast - the
     * gauge-over ramp's two seconds were a fifth of one, the effector pop-up
     * flashed past, the press beam snapped. GAMEPLAY-AUDIT.md converted the
     * READY count and the lamps to the clock and wrote the rule down;
     * SCREEN-AUDIT.md 5.1 found the six it left. `tick` is derived from the
     * stage clock `now` - zero through the READY hold, re-based when the
     * song starts, virtual under --fast - and `dticks` is how many ticks
     * this iteration crossed: 0 on most, 1 now and then, never more than a
     * second's worth after a stall. */
    int tick = 0, tick_prev = 0, dticks = 0;
    /* And ONE counter that runs from the director's construction, READY
     * hold included: the fade-in below is ordered by the ctor and steps
     * once a frame from the first frame, while `tick` is zero until the
     * song starts. Same time base as the READY count (60 Hz off the real
     * clock; one frame an iteration under --fast). */
    double entry_at = -1.0, entry_ms = 0.0;
    int entry_tick = 0;
    int fx_prev_tick = 0;        /* what the effector panel has already spent */
    int chart_marked = 0;        /* the oracle's chart mark, raised once */
    int stage_failed = 0;

    /* BEFORE ANYTHING READS AN OPTION. See the declaration above.
     *
     * ON A ONE-PLAYER CREDIT THERE IS NO SECOND SIDE TO RESOLVE. Player two's
     * set is taken to BE player one's, so `same` holds and not one of the
     * paths below can be reached - a stray `--p2-speed` on a solo run is not
     * a difference, because there is nobody it could differ from. */
    po[0] = o->opts[0];
    po[1] = (o->players >= 2) ? o->opts[1] : o->opts[0];
    ez2_player_opts_resolve(&po[1], &po[0]);
    same = ez2_player_opts_equal(&po[0], &po[1]);
    live_pct = (po[0].speed_index >= 0) ? ez2_speed_percent(po[0].speed_index)
                                        : 100;

    memset(res, 0, sizeof *res);
    memset(hold_owed, 0, sizeof hold_owed);
    memset(paddle_open, 0, sizeof paddle_open);
    strum_until[0] = strum_until[1] = -1.0;
    g_catch_paddle = 0;
    res->place = -1;

    /* --- chart, rules and lanes --- */
    if (!load_keys(exe))
        return 1;
    chart_bytes = ez2_file_read_decrypted(chart_path, exe, EZ2_KEY_EZ, &n);
    if (!chart_bytes || ez2_chart_parse(chart_bytes, n, &chart) != EZ2_CHART_OK) {
        if (getenv("EZ2_SKIP_IF_ABSENT")) {
            fprintf(stdout, "SKIP: cannot read %s\n", chart_path);
            return 77;
        }
        fprintf(stderr, "ez2play: cannot read %s as a chart\n", chart_path);
        return 1;
    }
    ez2_chart_id_parse(chart_path, &id);
    /* An explicit --mode wins over the filename. It has to name the layout
     * actually played, so for a CV2 chart that is the SUB-mode. */
    if (o->mode_name && o->mode_name[0]) {
        ez2_mode m = ez2_mode_from_name(o->mode_name);

        snprintf(id.mode_name, sizeof id.mode_name, "%s", o->mode_name);
        if (m != EZ2_MODE_UNKNOWN)
            id.mode = m;
    }

    /* THE MODE'S .gds IS THE AUTHORITY ON LANE ORDER, and on which key drives
     * which lane (docs/gds-slots.md). ez2_mode_lanes has the right SET but
     * sorts it ascending, which puts the scratch mid-row. Falling back keeps
     * a rootless run playable. */
    /* A CV2 CHART'S LAYOUT IS NOT CV2MIX'S - there is no such descriptor. The
     * song table's `kind` byte names one of ten sub-modes (ez2/mode.h), and
     * that is where the lanes come from. */
    gds_mode = id.mode_name;
    if (id.mode == EZ2_MODE_CV2 && root && exe) {
        const char *sub = ez2_songdb_cv2_submode(root, exe, id.song);
        if (sub)
            gds_mode = sub;
    }
    if (root && ez2_gds_load_for_mode(root, gds_mode, &gds) == EZ2_GDS_OK)
        lane_count = ez2_gds_lanes(&gds, 0, lanes, EZ2_MAX_LANES);
    if (lane_count > 0)
        gds_ok = 1;
    else
        lane_count = ez2_mode_lanes(id.mode, lanes, EZ2_MAX_LANES);
    memset(lane_player, 0, sizeof lane_player);
    /* One player: lane i is row i of the one panel. The duo arm below
     * rewrites it; reset_chart_state restores it after every chart. */
    for (i = 0; i < EZ2_MAX_LANES; i++)
        g_lane_track[i] = (unsigned char)i;
    /* THE PADDLE'S HALF-WIDTH, m46d360's own ladder: 65 by default, 47 in
     * extreme mode, and the hidden/race arms the port does not expose. */
    catch_mode = (id.mode == EZ2_MODE_CATCH);
    scratch_mode = (id.mode == EZ2_MODE_SCRATCH);
    paddle_half = 65.0f;
    /* WHETHER TWO PEOPLE CAN PLAY THIS MODE AT ALL, and the port had the test
     * exactly inverted.
     *
     * It read "this mode's .gds uses keys 18..25, so its lanes can be split
     * between two players" and enabled a shared-field duo on precisely the
     * modes where that is wrong. A mode that uses PLAYER 2'S KEY BANK is a
     * WIDE ONE-PLAYER LAYOUT - one person spanning both halves of the
     * cabinet - and the shipped art says so without ambiguity:
     *
     *     mode          _1 fields   P2-bank keys
     *     ClubMix           0            6
     *     SpaceMix          0            8
     *     10RadioMix        0            6
     *     14RadioMix        0            8
     *     EZ2Catch         10            6
     *     StreetMix        46            0
     *     5KeyMix          44            0     (and 7Street, Ruby,
     *     ...                                   5Radio, Radio, Scratch)
     *
     * The four wide modes ship NO second player's field - `STYLE_<mode>N_1.pvi`
     * does not exist for them - while every mode two people can share ships
     * one for every style. Catch has the art but is one-player too.
     *
     * So the old test enabled "two players" on the five modes that cannot
     * have them, and disabled it on all seven that can. What it produced on
     * ClubMix was one player's own 10-key field cut down the middle and
     * scored as two people. */
    duo = 0;
    if (o->players >= 2 && gds_ok) {
        if (mode_is_one_player(&gds, lane_count)) {
            /* Asked for two on a wide layout. One person plays it; saying so
             * is better than quietly halving their field. */
            printf("  %s is a ONE-PLAYER mode (it uses both halves of the "
                   "cabinet) - playing it as one\n", id.mode_name);
        } else if (1) {
            /* TWO PLAYERS, AND IT IS THE SECOND SLOT THAT MAKES IT ONE.
             *
             * The mode's descriptor carries a slot per side, and the two
             * are the SAME ROW on the two banks: 5KeyMix's slot 0 is keys
             * 15/16,10-14,17 and its slot 1 keys 23/24,18-22,25 - scratch,
             * five keys, pedal, in that order both times. Appending it gives one
             * flat lane list the judge, the note store and the two scrolls
             * are already keyed by, with `lane_player` saying whose each is
             * and `lane_track` where it sits in THAT player's panel. */
            int p2[EZ2_MAX_LANES];
            int n2 = ez2_gds_lanes(&gds, 1, p2, EZ2_MAX_LANES);
            int k;

            if (n2 <= 0 || lane_count + n2 > EZ2_MAX_LANES) {
                printf("  %s has no second slot to give player two - "
                       "playing as one\n", id.mode_name);
            } else {
                lane_p1 = lane_count;
                for (k = 0; k < lane_count; k++) {
                    lane_player[k] = 0;
                    g_lane_track[k] = (unsigned char)k;
                }
                /* BOTH PLAYERS PLAY THE SAME MUSIC, AND LANE k IS LANE k.
                 *
                 * Measured twice over. On the original's own two-player
                 * recording the two fields draw the same note pattern lane
                 * for lane - 698/466/724/460/466 on 1P's five and the same
                 * five counts again 416 px to the right - while not one of
                 * the 1114 shipped 5-key charts puts a single note on the
                 * second bank's tracks (tools/ez2lanes over the whole
                 * library). So slot 1 is a KEY MAP and nothing else: it says
                 * which of player two's buttons drives which of their lanes.
                 *
                 * And the binary does exactly this copy itself. The tail of
                 * EZ2DJMainGameDirector::m421190 @0x421190
                 * (../../src/maingame.cpp) walks slot 1's entries and writes
                 * slot 0's handle into each - `f380[0x77 + i*4] = f380[0x77 +
                 * i*4 - 0x71]`, the handle at +0x18 of a 0x10-byte entry,
                 * 0x71 ints being one 0x1c4-byte list - keeping slot 1's own
                 * keys. Lane index to lane index, which is what the two
                 * slots line up by: both open on the scratch, then the five
                 * keys, then the pedal, then the extras (docs/gds-slots.md).
                 *
                 * The port had been mapping slot 1's TRACK NUMBERS back to
                 * first-bank ones by arithmetic, and the numbering does not
                 * survive it: 5KeyMix's slot 1 reads 20,14-18,19, so the
                 * scratch lane took the pedal's track and the pedal lane the
                 * scratch's, and 7StreetMix's 12,13,20,14-19 came out as a
                 * nine-lane permutation - player two's keys hitting player
                 * one's notes in the wrong order, which is the reported
                 * "keymap completely messed up". */
                for (k = 0; k < n2; k++) {
                    lanes[lane_count + k] = k < lane_p1 ? lanes[k] : p2[k];
                    lane_player[lane_count + k] = 1;
                    g_lane_track[lane_count + k] = (unsigned char)k;
                }
                lane_count += n2;
                duo = 1;
                printf("  two players: %d lanes each, the same chart on both\n",
                       n2);
            }
        } else {
            /* TWO PLAYERS IS TWO FIELDS, AND THE PORT HAS ONE.
             *
             * Each player needs their own `STYLE_<mode>N_<player>.pvi` - the
             * game ships the pair for every mode two people can share - their
             * own scroll, their own score, and the same lanes fed from their
             * own key bank. The port loads one skin with `player` hard-coded
             * to 0 and keeps one set of note states, so a second player has
             * nowhere to play.
             *
             * It used to enter a shared-field "duo" here, which scored every
             * lane to 1P and then announced P1 WINS against 2P's nothing.
             * A missing feature that says so beats a game that pretends. */
            printf("  two players needs a second field (STYLE_%s1_1.pvi and "
                   "its own scroll and score), which the port does not draw "
                   "yet - playing as one\n", id.mode_name);
        }
    }
    if (duo) {
        /* The overlay's own art, System\BattleMode\ (the ctor changes into
         * that directory for its loads - src/gfpanelctor.cpp). */
        bt_needle = ezTextureLoad("system\\BattleMode\\battle_counter.abm");
        {
            char bp[2048];

            if (root && ez2_vfs_resolve(root, "system\\BattleMode\\battle_OBJ.str",
                                        bp, sizeof bp))
                bt_obj = ez2_bga_clip_open(bp);
            if (root && ez2_vfs_resolve(root, "system\\BattleMode\\battle_OBJ2.str",
                                        bp, sizeof bp))
                bt_obj2 = ez2_bga_clip_open(bp);
        }
        bt_win[0] = ezTextureLoad("system\\BattleMode\\battle_1pwin.abm");
        bt_win[1] = ezTextureLoad("system\\BattleMode\\battle_2pwin.abm");
        bt_win[2] = ezTextureLoad("system\\BattleMode\\battle_3pwin.abm");
    }
    if (lane_count == 0) {
        /* THE MODE CAME FROM THE FILENAME, and two conventions in the library
         * do not carry one this way. Measured over all 12,360 charts: 112
         * CV2Mix charts name the container rather than the sub-mode whose
         * layout they play, and 10 use a `#<tag>-<song>.ez` spelling
         * (#5k, #7k, #7s, #o2christ, #12yog) instead of `<mode>1p-<song>.ez`.
         * All of those songs carry 23 or more ordinary charts beside them, so
         * nothing is unreachable in a real session - this only bites when a
         * chart is handed to ez2play by PATH, which is a developer's way in.
         * Say so rather than leaving a bare '?'. */
        fprintf(stderr, "ez2play: no lane set for mode '%s'\n",
                id.mode_name[0] ? id.mode_name : "?");
        fprintf(stderr, "  the mode is inferred from the chart's filename, "
                        "and this one does not spell it as <mode>1p-<song>.ez\n"
                        "  pass --mode NAME to say which layout to play "
                        "(CV2Mix charts need their SUB-mode, e.g. "
                        "--mode AndromedaMix)\n");
        return 1;
    }

    /* The skin: the game's own field for this mode, if the tree has it. */
    if (g_skin) { ez2_skin_free(g_skin); g_skin = 0; }
    if (g_skin_p[1]) { ez2_skin_free(g_skin_p[1]); g_skin_p[1] = 0; }
    g_skin_p[0] = 0;

    if (root) {
        /* The mode's canonical name (the filename spells EZ2CATCH "catch"),
         * or the CV2 sub-mode's. */
        int cv2 = (id.mode == EZ2_MODE_CV2);
        const char *skin_mode = (cv2 && gds_mode != id.mode_name)
                              ? gds_mode : ez2_mode_name(id.mode);
        /* THE CV2 PANEL, AND ITS STYLE IS FIXED AT ONE. The keys player's
         * setup @0x430b50 builds `STYLE_%s1_` from the CV2 style tag and the
         * scratch player's @0x465d90 hard-codes `STYLE_ScratchMix1_%d.pvi` -
         * neither consults the style cycler, which is the song select's and
         * belongs to the ordinary modes. Passing the cycler here asked for a
         * variant CV2 does not ship. */
        int style = cv2 ? 1 : g_mix_style + 1;

        /* a one-player credit on the 2P side plays the MIRRORED field,
         * STYLE_<mode>1_1.pvi - the input banks are swapped for the credit,
         * so the lanes still read 1P's channels */
        g_skin = ez2_skin_load_ex(root, skin_mode, (g_seat && !duo) ? 1 : 0, po[0].black,
                                  po[0].note_style, style, cv2);
        ez2_skin_set_gf(g_skin, id.mode == EZ2_MODE_SCRATCH);
        if (g_skin)
            printf("skin: %s's own STYLE_%s%d_0.pvi%s - the game's field\n",
                   skin_mode, skin_mode, style, cv2 ? " (CV2Mix's)" : "");
        g_skin_p[0] = g_skin;
        /* AND THE SECOND PLAYER'S OWN PANEL. Not a mirror of the first and
         * not the same file: `_1` is a panel in its own right, with its
         * lanes on the right of the screen, its own gauge and its own score
         * row - which is why two fields need two skins and not one drawn
         * twice. Its note skin is that player's. */
        if (duo) {
            g_skin_p[1] = ez2_skin_load_ex(root, skin_mode, 1, po[1].black,
                                           po[1].note_style, style, cv2);
            ez2_skin_set_gf(g_skin_p[1], id.mode == EZ2_MODE_SCRATCH);
            if (g_skin_p[1])
                printf("skin: and STYLE_%s%d_1.pvi for player two\n",
                       skin_mode, style);
            else {
                printf("  player two's field (STYLE_%s%d_1.pvi) is missing - "
                       "playing as one\n", skin_mode, style);
                duo = 0;
                lane_count = lane_p1;   /* drop the lanes nobody can see */
            }
        }
    }
    /* WHICH EDGE THIS FIELD BELONGS TO. Two-player modes put 1P hard against
     * the left edge and 2P against the right; single-field modes sit centred.
     * The .pvi says which, so the skin classifies itself - see
     * ../WIDESCREEN.md part 2. At Wide = 0 the answer costs nothing either
     * way, since every anchor is the identity. */
    {
        int fl = 0, fr = 0;
        int pl;

        /* ONE ANSWER PER FIELD. Each player's panel classifies itself from
         * its OWN bounds, which is the whole point of the two files: 1P's
         * lanes sit at 39..180 and 2P's at 459..600, so on a wide canvas one
         * belongs against the left edge and the other against the right. */
        for (pl = 0; pl < EZ2_PLAYERS; pl++) {
            g_field_anchor_p[pl] = EZ2_ANCHOR_CENTER;
            if (g_skin_p[pl] && ez2_skin_field_bounds(g_skin_p[pl], &fl, &fr)) {
                g_field_anchor_p[pl] = ez2_layout_anchor_for_box(fl, fr);
                if (g_layout.gutter)
                    printf("layout: field %d %d..%d -> %s\n", pl, fl, fr,
                           g_field_anchor_p[pl] == EZ2_ANCHOR_LEFT  ? "LEFT" :
                           g_field_anchor_p[pl] == EZ2_ANCHOR_RIGHT ? "RIGHT"
                                                                    : "CENTER");
            }
        }
        g_field_anchor = g_field_anchor_p[0];
    }

    /* The effector panel - by the mode the lanes came from, which for CV2
     * charts is the sub-mode (the descriptor rule above). */
    /* THE DIAL. CV2Mix runs the 0..20 index and every other mode the
     * 50..999 percent - m422f20 @0x422f20 gates on the CV2 flag, and
     * ez2/speed.h had the two the wrong way round until 2026-08-30.
     * --speed-index keeps naming an index because that is its documented
     * interface; on a non-CV2 mode it is converted to the percent the
     * game's own dial would carry.
     *
     * DECIDED HERE, above the effector's first stamp, because that stamp
     * SHOWS the dial and was reading the pre-dial default of 100. */
    if (po[0].speed_pct > 0) {
        live_pct = ez2_speed_step_by(po[0].speed_pct, 0);   /* clamp only */
    } else if (po[0].speed_index >= 0) {
        /* THE ONE PER-SONG FLOOR (m422f20's CV2 step-down arm): on 11ambit
         * the index cannot go below 2. It lives in the INDEX branch, so on
         * the cabinet it is CV2Mix's rule; --speed-index is that same index
         * offered on every mode as a convenience, so the floor travels with
         * it. The game compares g_songInfoName, the variant-trimmed name
         * (m430f50 @0x430f50), so "cv2mix1p-11ambit-5s1" has to become
         * "11ambit" first - what strip_variant does for the titles. */
        char stem[160];
        int ix;

        snprintf(stem, sizeof stem, "%s", id.stem);
        strip_variant(stem);
        ix = ez2_speed_step_song(po[0].speed_index, 0, EZ2_SPEED_STEPS - 1,
                                 stem);
        live_pct = ez2_speed_percent(ix);
    } else if (!ez2_speed_uses_index(id.mode)) {
        live_pct = EZ2_SPEED_PCT_DEFAULT;
    }

    /* THE PANEL IS CV2'S WHEN THE MODE IS, not the sub-mode's. A CV2 stage
     * runs its lanes off a sub-mode descriptor ("5keymix" and the rest), and
     * passing that name here loaded the keys panel - the normal_panel plate
     * and three speedfont readouts - over a field the original gives
     * icon.str and three 42x42 dials (measured, playcv2_hits). */
    fx_load(&fx, root, gds_mode, id.mode == EZ2_MODE_CV2);
    if (po[0].speed_index >= 0)
        fx.speed_index = po[0].speed_index;
    {
        char gop[2048];

        /* AND CV2 HAS ITS OWN OVERLAY AND ITS OWN STING. The effector ctor
         * @0x41dcc0 picks the .str three ways (../../src/panels.cpp:995):
         * `System\\GaugeOver\\GaugeOver.str` with the CV2 flag down,
         * `System\\CV2Mix\\Streetmix1st\\GaugeOver\\GaugeOver.str` for
         * panel style 7, and CV2Mix's own otherwise. Measured on
         * playcv2_hits: the original's dying stage paints ga_panel1 and
         * out_txt02 out of `CV2Mix\GaugeOver` for the last 260 frames and
         * the port painted nothing. */
        int cv2 = (id.mode == EZ2_MODE_CV2);
        const char *gsnd = cv2 ? "system\\cv2mix\\gaugeover\\GaugeOver.ssf"
                               : "system\\gaugeover\\Gaugeover.ssf";
        const char *gstr = !cv2 ? "system\\gaugeover\\gaugeover.str"
                         : g_mix_style == 7
                             ? "system\\CV2Mix\\Streetmix1st\\GaugeOver\\GaugeOver.str"
                             : "system\\CV2Mix\\GaugeOver\\GaugeOver.str";

        if (ez2_vfs_resolve(root, gsnd, gop, sizeof gop) ||
            ez2_vfs_resolve(root, "system\\gaugeover\\Gaugeover.ssf", gop, sizeof gop))
            snd_gaugeover = ezSoundLoad(gop);
        if ((cv2 || ez2_mode_from_name(o->mode_name) == EZ2_MODE_RUBY) &&
            ez2_vfs_resolve(root, gstr, gop, sizeof gop))
            gaugeover_clip = ez2_bga_clip_open(gop);
    }
    fx_stamp(&fx, (int)(chart.bpm + 0.5f), live_pct,
             ez2_scroll_bpm((int)(chart.bpm + 0.5f), live_pct));

    /* The note order rewrites which TRACK each lane plays, so it runs once the
     * lanes are resolved and before anything reads the chart - the keysound
     * index, the scroll, the judge. The `.gds` map is what the four mirrors
     * need, because they select lanes by CONTROL ID, not by position. */
    if (po[0].order != EZ2_OPT_NONE) {
        ez2_lane_map lm;
        ez2_rng orng = EZ2_RNG_INIT;
        int swaps;

        if (gds_ok) {
            ez2_lane_map_from_gds(&gds, 0, &lm);
        } else {
            memset(&lm, 0, sizeof lm);
            lm.count = lane_count;
            for (i = 0; i < lane_count; i++) {
                lm.track[i]   = lanes[i];
                lm.control[i] = -1;
            }
        }
        if (!ez2_order_option_available(id.mode, (ez2_order_option)po[0].order))
            printf("order: note - %s's own menu does not offer %s "
                   "(its cycler skips that value); applying it anyway\n",
                   ez2_mode_name(id.mode),
                   ez2_order_option_name((ez2_order_option)po[0].order));
        ez2_rng_seed(&orng, po[0].order_seed_set ? po[0].order_seed : 1u);
        swaps = ez2_note_order_apply_option(&chart, &lm,
                                            (ez2_order_option)po[0].order,
                                            id.mode, &orng);
        printf("order: %s -> %d swap%s%s\n",
               ez2_order_option_name((ez2_order_option)po[0].order),
               swaps < 0 ? 0 : swaps, swaps == 1 ? "" : "s",
               gds_ok ? "" : "  (no .gds: control ids unknown, "
                             "the mirrors by id are no-ops)");
    }

    /* "....ez" -> "....ini": the extension GROWS by one, so this cannot be a
     * two-character overwrite. Getting that wrong silently opened "....in". */
    snprintf(sibling, sizeof sibling, "%s", chart_path);
    { size_t l = strlen(sibling);
      if (l > 3 && l + 2 < sizeof sibling) strcpy(sibling + l - 2, "ini"); }
    ini_text = ez2_file_read_decrypted(sibling, exe, EZ2_KEY_INI, &n);
    if (ini_text) ez2_song_ini_parse((const char *)ini_text, n, &ini);
    else          ez2_song_ini_defaults(&ini);
    /* The game judges with the file's windows PLUS 3 ticks (@0x430793), never
     * with the raw ones. Normal mode, so +3. */
    ez2_song_ini_apply_judge_widening(&ini, 0);
    /* And the gauge rates get the director's per-mode adjustments before
     * anything reads them: 14-key bonus, catch's GOOD zero (@0x4206e0 /
     * @0x46c2b0 - PORT-DELTAS finding 15). The mode is the SELECTED one, so a
     * CV2 chart (mode 12) gets no bonus even when its sub-mode would. */
    ez2_song_ini_apply_mode_bonus(&ini, id.mode);
    /* AND THE MEASURE SCALE, which nothing called until the playfield needed
     * it: m420640 @0x420640 FORCES the .gds/.ini value to 1.6 outside modes
     * 6/7/8/9/12, so a chart that says 1.0 - or says nothing - still scrolls
     * at 1.6. It is the lane's base scroll rate (resetLanes @0x427680). */
    ez2_song_ini_apply_measure_scale(&ini, id.mode);

    ez2_tempo_build(&chart, &g_tempo);
    g_tpm = chart.ticks_per_measure;
    miss_window_ms = (double)ini.miss_ticks * ez2_tick_ms(ez2_tempo_slowest(&g_tempo));

    /* THE GAME'S SPEED IS A MULTIPLIER ON THE CHART'S BPM, not a pixel rate.
     * update2 @0x41e76e reads `songBpm * percent / 100` and the notes move at
     * that; the effector's readout is that BPM. So an index picks a scroll
     * that means the same thing on every chart, where a raw --speed does not.
     *
     * The pixels-per-millisecond this loop wants is then just the scroll BPM
     * scaled by a constant of the playfield's choosing - kept at the old
     * default's value so --speed and --speed-index agree at index 5. */

    /* THE BGA IS ON BY DEFAULT, and it was not - it sat behind an opt-in
     * --bga, so a real session (ez2port.sh passes neither) never showed one.
     * The game has no per-run switch: EZ2DJMainGameDirector::m420a60
     * @0x420a60 opens with
     *
     *     g_iniProfile->getInt("UseBackground", &use);
     *     if (use == 0) goto done;
     *
     * and then loads the song's scene unconditionally. The only control is
     * the OPERATOR's EZ2AC.ini, which ships with UseBackground = 1.
     *
     * 283 of the library's 436 songs have one, so absent is the normal case
     * and not worth a warning. Its clock is the same `now` the notes use,
     * minus the lead-in: the scene starts when the chart does, not when the
     * window opens. */
    if (o->bga < 0)
        o_bga = ez2_operator_ini_int(root, exe, "UseBackground", 1);
    else
        o_bga = o->bga;
    /* THE BACKGROUND IS KEYED BY THE SONG'S FOLDER, not by the chart's
     * stem: bgload.cpp changes into `BG\<g_songInfoName>`, the song info
     * name being the directory the chart lives in. The two differ for a
     * radio stage - `5radiomix1p-5lom-dd.ez` in `sound\5lom\` has the stem
     * `5lom-dd` (the variant tag is part of the name, ez2/mode.c) and the
     * background `bg\5lom\5lom.scr` - which is why every radio stage said
     * "this song has none" (the owner, 2026-09-03). */
    {
        char bgkey[128];
        const char *p, *slash = 0, *prev = 0;

        bgkey[0] = 0;
        for (p = chart_path; *p; p++)
            if (*p == '/' || *p == '\\') { prev = slash; slash = p; }
        if (prev && slash > prev + 1 && (size_t)(slash - prev - 1) < sizeof bgkey) {
            memcpy(bgkey, prev + 1, (size_t)(slash - prev - 1));
            bgkey[slash - prev - 1] = 0;
        }
        if (!bgkey[0])
            snprintf(bgkey, sizeof bgkey, "%s", id.stem);
        if (o_bga && root && bgkey[0]) {
            char mpath[2048];
            int start_ms = 0;

            /* A user-song package's movie, started at the bmson's first
             * bga event (usersongs.h); otherwise the game tree's scene. */
            if (ez2_usersongs_bga(bgkey, mpath, sizeof mpath, &start_ms)) {
                if (ez2_bga_open_movie(mpath, start_ms / 1000.0, &bga) != EZ2_BGA_OK) {
                    bga = 0;
                    printf("background: movie %s did not open (codec?)\n", mpath);
                } else
                    printf("background: movie %s from %d ms\n", mpath, start_ms);
            } else if (ez2_bga_open(root, bgkey, &bga) != EZ2_BGA_OK) {
                bga = 0;
                printf("background: none for %s\n", bgkey);
            } else {
                /* THE WHOLE SCENE NOW, not a clip at a time during play:
                 * see ez2_bga_preload. Under --fast the loads are free. */
                unsigned t0 = ezTimeMs();
                int clips = 0, texs = 0;

                if (ez2_bga_preload(bga, &clips, &texs))
                    printf("background: scene %s, %d clip%s / %d texture%s loaded in %u ms\n",
                           bgkey, clips, clips == 1 ? "" : "s", texs, texs == 1 ? "" : "s",
                           ezTimeMs() - t0);
                else
                    printf("background: %s\n", bgkey);
            }
        }
    }

    /* --- THE READY COUNT, and the stage waits for it ------------------------
     *
     * A stage does not begin on the frame it is loaded. `BattleMode` @0x41c1a0
     * is created alongside the director (src/maingame.cpp, three sites) as its
     * `pending` object, and EZ2DJMainGameDirector::update2 @0x4249e0 opens:
     *
     *     if (pending != 0) {
     *         if (pending->ready == 0)
     *             return;                 // the WHOLE stage is held
     *         if (ready == 0) { ...; ready = 1; start(); }
     *     }
     *
     * so until the overlay says it is done, nothing ticks: no clock, no
     * scroll, no keysound, no judgement. `pending->ready` is BattleMode's
     * `m_f2d`, and update @0x41c8e0 latches it when its chart0 reports done.
     *
     * chart0 is the countdown clip, picked by the ctor (src/panels.cpp):
     * `BATTLE_READY.str` for a real two-up keys battle (`countListA() > 1 &&
     * g_modeIndex != 1`), `READYCOUNT.str` otherwise. Both are 380 frames at
     * 60 fps - 6.3 seconds - and their layers are the art: READY, the 3-2-1
     * numerals off `count.bmp`, then START (or FIGHT on the battle one).
     *
     * The three voice cues are update2 @0x41c660's, off chart0's own frame:
     * Battle-01 at 205, Battle-01 AGAIN at 265 (stopped and rewound first),
     * Battle-02 at 325 - sixty frames apart, one a second, which is what
     * makes it a count of three. Under the CV2 flag the clip is 196 frames
     * and the cues are 25/85/145; the same three sounds, the same spacing.
     *
     * NOT for CV2Mix's own style (g_mixStyle == 7), where update @0x41c8e0
     * latches m_f2d outright and there is no count at all. */
    {
        static const char *const kReadyDir[2] = {
            "system\\BattleMode\\", "system\\CV2Mix\\BattleMode\\"
        };
        int cv2 = (id.mode == EZ2_MODE_CV2);
        char leaf[256], full[2048];

        /* countListA() > 1 && g_modeIndex != 1 - a real two-up keys battle
         * gets FIGHT where one player gets START. RubyMix (1) is excluded by
         * the original, which is why the test is on the mode and not just on
         * the count. */
        snprintf(leaf, sizeof leaf, "%s%s", kReadyDir[cv2],
                 (duo && game_mode_index(gds_mode) != 1) ? "BATTLE_READY.str"
                                                         : "READYCOUNT.str");
        if (root && ez2_vfs_resolve(root, leaf, full, sizeof full))
            ready_clip = ez2_bga_clip_open(full);
        if (ready_clip) {
            ready_total = ez2_bga_clip_frames(ready_clip);
            if (ready_total <= 0) {
                ez2_bga_clip_free(ready_clip);
                ready_clip = 0;
            }
        }
        if (ready_clip) {
            ready_cue[0] = cv2 ? 0x19 : 0xcd;
            ready_cue[1] = cv2 ? 0x55 : 0x109;
            ready_cue[2] = cv2 ? 0x91 : 0x145;
            ready_fired[0] = ready_fired[1] = ready_fired[2] = 0;
            snprintf(leaf, sizeof leaf, "%sBattle-01.ssf", kReadyDir[cv2]);
            if (ez2_vfs_resolve(root, leaf, full, sizeof full))
                ready_a = ezSoundLoad(full);
            snprintf(leaf, sizeof leaf, "%sBattle-02.ssf", kReadyDir[cv2]);
            if (ez2_vfs_resolve(root, leaf, full, sizeof full))
                ready_b = ezSoundLoad(full);
            counting = 1;
            printf("  ready count: %d frames, cues at %d/%d/%d\n",
                   ready_total, ready_cue[0], ready_cue[1], ready_cue[2]);
        }
    }

    /* --- split the chart into lanes and backing --- */
    for (t = 0; t < chart.track_count; t++) {
        int lane = -1;
        int lane2 = -1;     /* the second field's copy of the same track */

        for (i = 0; i < lane_count; i++)
            if (lanes[i] == t) {
                if (lane < 0) lane = i;
                else if (lane2 < 0) lane2 = i;
            }

        for (j = 0; j < chart.tracks[t].note_count; j++) {
            const ez2_note *e = &chart.tracks[t].notes[j];
            double when;

            /* THE SCROLL EVENTS COME FIRST - they are not notes, and the
             * note filter below would drop them. On-disk type 6 becomes
             * runtime event kind 7 through NoteConvert @0x410ef0, and that
             * arm is `g_1b2e708 = ev->v.fvalue` (../../src/kezplayer.cpp:175)
             * - a FLOAT, where ez2/chart.h files the payload as a u32. 6333
             * of them appear across 24 of the 12,359 shipped charts. */
            if (e->type == EZ2_NOTE_T6) {
                if (g_scrollpt_count < (int)(sizeof g_scrollpts /
                                             sizeof g_scrollpts[0])) {
                    ScrollPoint *sp = &g_scrollpts[g_scrollpt_count++];

                    sp->tick = e->tick;
                    memcpy(&sp->mult, &e->raw[0], sizeof sp->mult);
                }
                continue;
            }
            /* EVERY RECORD IS PART OF THE WALK. drainQueue @0x40fd70 ends
             * the run when the cursor passes the LAST RECORD of the merged
             * list, whatever its type - a trailing volume, BPM, mark or
             * type-8 record after the last note keeps the stage open until
             * its own tick. The port ended at the last note or sample and
             * cut such songs short (the owner, 2026-09-03). */
            {
                double w = ez2_tempo_ms(&g_tempo, e->tick,
                                        chart.ticks_per_measure) + LEAD_IN_MS;

                if (w > end_all_ms) {
                    end_all_ms = w;
                    end_all_type = e->type;
                }
            }
            if (e->type != EZ2_NOTE_NOTE)
                continue;
            when = ez2_tempo_ms(&g_tempo, e->tick, chart.ticks_per_measure) + LEAD_IN_MS;

            if (lane >= 0 && g_note_count < MAX_NOTES) {
                PlayNote *p = &g_notes[g_note_count++];
                p->time_ms   = when;
                p->lane      = lane;
                p->track     = t;
                p->key_index = e->key_index;
                p->velocity  = e->velocity;
                p->pan       = e->pan;
                p->tick      = e->tick;
                p->hold_ticks = ez2_note_hold_ticks(e);
                p->hold_ms   = p->hold_ticks
                             ? ez2_tempo_ms(&g_tempo, e->tick + p->hold_ticks,
                                            chart.ticks_per_measure)
                               + LEAD_IN_MS - when
                             : 0.0;
                p->kind      = e->unknown;
                p->tick_ms_size = ez2_tick_ms(ez2_tempo_bpm_at(&g_tempo, e->tick));
                p->judged    = 0;
                /* THE GAME'S NOTE TOTAL COUNTS A HOLD'S INSTALMENTS - each
                 * one is a scored note through the sink (see ez2/score.h),
                 * and +0xe105bc came out as 242 heads + 309 instalments on
                 * the traced stage. So does the maximum, and so does the
                 * rate. The counter is the game's own @0x42f2d0. */
                total_notes += ez2_note_counted(p->kind, chart.ticks_per_measure,
                                                (unsigned)e->length, 0);
                if (duo && lane_player[lane])
                    total_p2 += ez2_note_counted(p->kind,
                                                 chart.ticks_per_measure,
                                                 (unsigned)e->length, 0);
                /* AND THE OTHER FIELD'S COPY. Two players is two notes to
                 * hit, judged and scored apart - one note object each, the
                 * same tick. */
                if (lane2 >= 0 && g_note_count < MAX_NOTES) {
                    PlayNote *q = &g_notes[g_note_count++];

                    *q = *p;
                    q->lane = lane2;
                    total_notes += ez2_note_counted(q->kind,
                                                    chart.ticks_per_measure,
                                                    (unsigned)e->length, 0);
                    if (lane_player[lane2])
                        total_p2 += ez2_note_counted(q->kind,
                                                     chart.ticks_per_measure,
                                                     (unsigned)e->length, 0);
                }
            } else if (lane < 0 && g_auto_count < MAX_NOTES) {
                AutoNote *a = &g_auto[g_auto_count++];
                a->time_ms   = when;
                a->key_index = e->key_index;
                a->velocity  = e->velocity;
                a->pan       = e->pan;
                a->fired     = 0;
            }
        }
    }
    qsort(g_notes, (size_t)g_note_count, sizeof g_notes[0], cmp_note);
    qsort(g_auto,  (size_t)g_auto_count,  sizeof g_auto[0],  cmp_auto);
    qsort(g_scrollpts, (size_t)g_scrollpt_count, sizeof g_scrollpts[0],
          cmp_scrollpt);

    /* AND THE GEOMETRY, once the chart's own scroll events are collected.
     * MeasureScale is the lane's base rate (resetLanes @0x427680 out of the
     * director's f320), forced to 1.6 outside modes 6/7/8/9/12 by m420640
     * @0x420640 - ez2_song_ini_apply_measure_scale has already done that. */
    ez2_scroll_init(&g_scroll[0], ini.measure_scale, EZ2_SCROLL_BEAT,
                    ez2_scroll_target(live_pct, g_chart_mult));

    /* PLAYER TWO'S OWN OPTIONS, and what can be done with them today.
     *
     * `same` is the fidelity switch and it was decided at the top of this
     * function, from the two RESOLVED sets. When it holds - every one-player
     * run, and every credit where 2P opened no panel - nothing here happens,
     * `g_scroll_split` stays clear, the second scroll is never consulted, and
     * the field is drawn exactly as it was before per-player options existed.
     * ez2/playeropts.h states that rule; this is where it is kept.
     *
     * When the two sides DO differ, only what lives per LANE can be honoured
     * while there is one field. The dial can: the draw paths take a lane's own
     * scroll. The note skin can: it is stored per lane. The arrangement cannot
     * - it rewrites the one chart both sides read - and neither can the black
     * panel, which IS the field. Those wait for the second field, and saying
     * so beats quietly playing 1P's. */
    live_pct2 = live_pct;
    if (!same) {
        if (po[1].speed_pct > 0)
            live_pct2 = ez2_speed_step_by(po[1].speed_pct, 0);  /* clamp only */
        else if (po[1].speed_index >= 0)
            live_pct2 = ez2_speed_percent(po[1].speed_index);

        if (!duo) {
            /* The commonest case by far right now: the port draws one field,
             * so a 2P who set anything is a 2P whose settings are being
             * ignored. That is worth a line - it is the difference between a
             * missing feature and a panel that does nothing for no reason. */
            printf("  2P set their own options, and this stage has one field "
                   "- they do not apply yet\n");
        } else {
            if (po[1].order != po[0].order)
                printf("  2P asked for %s where 1P has %s: the arrangement "
                       "rewrites the one chart both sides read, so both play "
                       "1P's until there are two fields\n",
                       ez2_order_option_name((ez2_order_option)po[1].order),
                       ez2_order_option_name((ez2_order_option)po[0].order));
            if (po[1].black != po[0].black)
                printf("  2P plays the %s panel - their field is their own "
                       "STYLE file, so this one does apply\n",
                       po[1].black ? "Black" : "ordinary");
            g_scroll_split = (live_pct2 != live_pct);
        }
    }
    ez2_scroll_init(&g_scroll[1], ini.measure_scale, EZ2_SCROLL_BEAT,
                    ez2_scroll_target(live_pct2, g_chart_mult));
    /* NO OPTION PANEL OVER THE FIELD. The song select's EffectPanel.str was
     * drawn here for a while and it was the wrong asset: the original has a
     * DEDICATED, reduced in-play panel - system\InGameEffector\ - and the
     * port already draws it (FxPanel, fx_load/fx_stamp above). It carries
     * what belongs in a song: the speed readout and the two boosts. The
     * select panel's arrangement, fade and BG rows are pre-song choices, and
     * a 363 px page over the play field to show them was covering the notes
     * the player was trying to hit. */
    /* The map the file-scope draw helpers read. `lane_player[]` is this
     * function's local and they cannot see it. It is published for ANY
     * two-player stage, not only a speed-split one: it is what picks a
     * lane's FIELD, and with two fields that decides which half of the
     * screen a note is drawn on. Gated on the split, both players' notes
     * came out on player one's field. */
    if (duo || g_scroll_split) {
        int li;

        for (li = 0; li < EZ2_MAX_LANES; li++)
            g_lane_player[li] = (unsigned char)(lane_player[li] ? 1 : 0);
    }
    /* AND WHETHER THE SEATS ARE BOTH TAKEN, which is what decides the
     * keysound pan (lane_pan_pos). Not the same question as the split. */
    g_two_players = duo;
    if (g_scroll_split)
        printf("  scroll: 2P runs %d%% where 1P runs %d%% - the field is "
               "split\n", live_pct2, live_pct);

    /* 2P'S OWN NOTE SKIN needs nothing here any more: their field is a skin
     * of its own, loaded above with po[1].note_style. This used to reach
     * into player ONE's skin and set the style on the lanes numbered past
     * its own - the shared-field arrangement, left behind when the second
     * field arrived. */
    printf("  scroll: %d%% x MeasureScale %.2f = %.2f px/tick, "
           "%d BPM readout%s\n",
           live_pct, (double)ini.measure_scale,
           (double)ez2_scroll_offset(&g_scroll[0], 1.0, 0.0, 1.0f, 1.0f),
           ez2_scroll_bpm_scaled((int)(chart.bpm + 0.5f), live_pct,
                                 ini.measure_scale),
           g_scrollpt_count ? " (the chart moves it)" : "");

    /* WHEN THE STAGE IS OVER: when the player's walk runs off the end of
     * the chart (drainQueue @0x40fd70 drops the playing flag, update2
     * @0x4249e0 reads it back as `notify->v27() == 0` and calls m424830,
     * which orders the 26-tick fade @0x450420 and nothing else - no tail,
     * no held-key gate; SCREEN-AUDIT.md 5.3). The end is the last record. */
    for (i = 0; i < g_note_count; i++) {
        double e = g_notes[i].time_ms + g_notes[i].hold_ms;
        if (e > end_ms) end_ms = e;
    }
    for (i = 0; i < g_auto_count; i++)
        if (g_auto[i].time_ms > end_ms) end_ms = g_auto[i].time_ms;
    if (end_all_ms > end_ms) {
        printf("  song end: last record is type %d at %.1f s, %.1f s after "
               "the last note or sample\n", end_all_type, end_all_ms / 1000.0,
               (end_all_ms - end_ms) / 1000.0);
        end_ms = end_all_ms;
    }

    /* --- samples --- */
    if (!ez2_vfs_sibling(chart_path, "ezi", sibling, sizeof sibling))
        snprintf(sibling, sizeof sibling, "%s", chart_path);
    ezi_text = ez2_file_read_decrypted(sibling, exe, EZ2_KEY_EZI, &n);
    if (ezi_text && ez2_ezi_parse((const char *)ezi_text, n, &index) == EZ2_EZI_OK) {
        char dir[1024], swapped[EZ2_EZI_NAME], full[2048];
        const char *slash = strrchr(chart_path, '/');
        snprintf(dir, sizeof dir, "%.*s",
                 slash ? (int)(slash - chart_path) : 1, slash ? chart_path : ".");
        for (i = 0; i < index.count; i++) {
            const ez2_ezi_entry *e = &index.entries[i];
            if (e->note < 0 || e->note >= EZ2_EZI_SLOTS || g_samples[e->note])
                continue;
            if (!ez2_ezi_resolve(e->name, swapped, sizeof swapped))
                continue;
            /* The .ezi may name another song's folder with a relative path,
             * and it names files in whatever case it likes - both of which
             * ez2_vfs_resolve handles and a bare snprintf did not. */
            if (!ez2_vfs_resolve(dir, swapped, full, sizeof full))
                snprintf(full, sizeof full, "%s/%s", dir, swapped);
            g_samples[e->note] = ezSoundLoad(full);
            if (g_samples[e->note])
                sample_count++;
        }
        printf("  samples: %d of %d named by the .ezi\n",
               sample_count, index.count);
        ez2_ezi_free(&index);
    }

    /* One channel per lane, opened once the layout is known. */
    for (i = 0; i < lane_count && i < EZ2_MAX_LANES; i++)
        if (!g_lane_voice[i])
            g_lane_voice[i] = ezSoundChannel();

    /* A carried gauge is never zero (a dead stage is game over), so zero -
     * a caller that filled PlayOpts with memset - means full too. */
    ez2_score_init(&sc, o->gauge_in > 0.0f ? o->gauge_in : EZ2_GAUGE_MAX,
                   EZ2_GAUGE_MAX);
    ez2_score_init(&sc2, EZ2_GAUGE_MAX, EZ2_GAUGE_MAX);
    /* EZ2CATCH scores by a different model, not a different constant - see
     * ez2/score.h. Chosen from the chart's own mode. */
    if (id.mode == EZ2_MODE_CATCH) {
        ez2_score_set_model(&sc, EZ2_SCORE_CATCH);
        ez2_score_set_model(&sc2, EZ2_SCORE_CATCH);
    }
    /* AND CV2MIX IS A THIRD MODEL, not a keys mode with different constants:
     * `runCv2Mix` @0x417a3f sets the global that the sink @0x42e620 and the
     * rank @0x42e190 both branch on, which changes the note values, adds a
     * combo multiplier, drops GOOD from the combo and swaps the grade ladder.
     * See ez2/score.h. */
    else if (id.mode == EZ2_MODE_CV2) {
        ez2_score_set_model(&sc, EZ2_SCORE_CV2);
        ez2_score_set_model(&sc2, EZ2_SCORE_CV2);
    }
    memset(lane_down, 0, sizeof lane_down);

    printf("%s\n  %s %s, %d lanes, %ld notes, %d backing  (%s)\n", chart_path,
           ez2_mode_name(id.mode), ez2_tier_name(id.tier), lane_count,
           total_notes, g_auto_count,
           gds_ok ? "lane order and key map from the mode's .gds"
                  : "no .gds - lane order is a guess");
    printf("  windows %d/%d/%d/%d ticks (+3 widened) = %.0f/%.0f/%.0f/%.0f ms "
           "at %.1f bpm\n",
           ini.kool_ticks, ini.cool_ticks, ini.good_ticks, ini.miss_ticks,
           ini.kool_ticks * ez2_tick_ms(chart.bpm),
           ini.cool_ticks * ez2_tick_ms(chart.bpm),
           ini.good_ticks * ez2_tick_ms(chart.bpm),
           ini.miss_ticks * ez2_tick_ms(chart.bpm), chart.bpm);
    {
        /* Say when the mode's field spans PLAYER 2's bank - one Club/Space
         * slot covers both key banks, and the right half answers only to
         * the P2 channels. */
        int has_p2 = 0, pk;

        for (pk = 18; pk <= 25 && gds_ok; pk++)
            if (ez2_gds_lane_for_key(&gds, 0, pk) >= 0)
                has_p2 = 1;
        printf(has_p2
                   ? "  keys: S D F J K, A/Q scratch, SPACE pedal"
                     "  +P2: C V B N M, UP/DOWN scratch, RSHIFT pedal\n"
                   : "  keys: S D F J K, A/Q scratch, SPACE pedal\n");
        printf("  effector: 1/2 boosts, 3/4 speed -/+25, "
               "START+scratch the 0.01 dial, START+D/J -/+10\n");
    }
    if (o_bga && bga == 0)
        printf("  bga: this song has none\n");
    else if (!o_bga)
        printf("  bga: off (%s)\n",
               o->bga < 0 ? "UseBackground = 0" : "--no-bga");
    else
        printf("  bga: %s%s%s\n",
               ez2_bga_has_scene(bga) ? "scene" : "",
               (ez2_bga_has_scene(bga) && ez2_bga_has_video(bga)) ? " + " : "",
               ez2_bga_has_video(bga) ? "video" : "");
    if (g_note_count)
        printf("  first note at %.1f s, last at %.1f s (%d ms lead-in)\n",
               g_notes[0].time_ms / 1000.0,
               g_notes[g_note_count - 1].time_ms / 1000.0, LEAD_IN_MS);

    /* WHICH CLOCK. The audio device is the right one - a rhythm game's "now"
     * is what the player hears - but it only advances if a device is actually
     * consuming frames. With no audio (a headless run, SDL_AUDIODRIVER=dummy)
     * it sits at zero forever and no note ever arrives, which is exactly how
     * the first headless run scored nothing. So: audio when it is moving,
     * wall clock when it is not, and a virtual clock under --fast so a whole
     * chart can be checked in a second instead of two minutes. */
    start_ms = ezAudioTimeMsF();
    {
        unsigned int t0 = ezTimeMs();
        ezSleepMs(30);
        /* Under the screen oracle the audio device is SDL's dummy, whose
         * clock moves but not at real time (a chart ran at half speed
         * against the frames, 2026-09-08); the wall clock is what the
         * original's recording is keyed to. */
        if (ezAudioTimeMsF() == start_ms || getenv("EZ2_ORACLE_OUT")) {
            use_wall = 1;
            start_ms = ezTimeMsF();
            printf("  (no audio clock - using the wall clock)\n");
        }
        (void)t0;
    }

    lights_off();
    /* THE LATE PRESENT. Under vsync the swap paces this loop to the screen,
     * and a press pumped at the top of the pass is then heard a refresh
     * late - up to 16.7 ms on the cabinet's 60 Hz, 8 on average, where the
     * unsynchronised loop measured ~1 (LATENCY.md). With this on, ezPresent
     * skips a swap the refresh is not yet close to and the pass comes round
     * again - pump, judge, keysound, redraw - so the sound follows the key
     * within a loop period and the swap blocks only for its last few
     * milliseconds (platform/common/ezlate.h). Not under --fast or a frame
     * budget: those count every pass as a frame and expect it shown. */
    if (frame_limit < 0 && !fast)
        ezSetLatePresent(1);
    while (running && (frame_limit < 0 || frames < frame_limit)) {
        double now, disp;
        EzInputEvent ev[32];
        int nev;

        ezBeginFrame();
        if (entry_at < 0.0)
            entry_at = fast ? 0.0 : (double)ezTimeMs();
        if (fast)
            entry_ms += 1000.0 / 60.0;
        else
            entry_ms = (double)ezTimeMs() - entry_at;
        entry_tick = (int)(entry_ms * 60.0 / 1000.0);
        ez2_lights_ready(counting && ready_frame >= 0xcd);
        lights_frame(EZ2_LIGHTS_PLAY, gds_mode);
        /* THE STAGE ENDING IS NOT THE PLAYER LEAVING, and conflating them made
         * the result screen unreachable: every normal finish looked like a
         * quit. Only the pump saying so is a quit. */
        if (!ezPlatformPump()) {
            running = 0;
            quit = 1;
        }
        /* TEST in-game: runMainGame @0x416320 returns 6, the runner runs
         * the test screen, drains the seats and moves to the next round
         * with no result (moderunner.cpp:1084; SCREEN-AUDIT.md 8.10). */
        if (ezInputDown(EZ_IN_TEST)) {
            running = 0;
            res->test = 1;
        }
        if (fast) {
            vclock += 8.0;                       /* 8 ms a frame, virtual */
            now = vclock;
        } else {
            now = (use_wall ? ezTimeMsF() : ezAudioTimeMsF()) - start_ms;
        }

        /* THE READY COUNT holds the whole stage, exactly as @0x4249e0's
         * `if (pending->ready == 0) return;` does: the clock is re-based every
         * frame so `now` stays at zero, which is what keeps the scroll still,
         * the backing silent and every note unaged. Only the overlay moves. */
        if (counting) {
            int c;

            if (fast)
                vclock = 0.0;
            else
                start_ms = use_wall ? ezTimeMsF() : ezAudioTimeMsF();
            now = 0.0;

            /* THE CLIP IS AUTHORED AT 60 fps AND THIS LOOP IS NOT PACED.
             *
             * Every other screen is paced to 60 Hz (`frame_pace()` -
             * "the clip's own frame rate"); the PLAY loop deliberately does
             * not, so the picture is as fresh as the compositor will take it.
             * LATENCY.md measures the result: ~770 iterations a second, and on
             * a 240 Hz screen even a vsynced loop would be four times 60.
             *
             * So one clip frame per iteration is not a frame rate, it is
             * whatever the machine happens to manage - here it burned all 380
             * frames in about half a second, which is what "way too fast"
             * was. The count advances on a REAL clock instead, and the frame
             * is derived from elapsed milliseconds at the clip's own 60. */
            if (ready_at < 0.0)
                ready_at = fast ? 0.0 : (double)ezTimeMs();
            if (fast)
                ready_ms += 1000.0 / 60.0;   /* one clip frame an iteration */
            else
                ready_ms = (double)ezTimeMs() - ready_at;
            ready_frame = (int)(ready_ms * 60.0 / 1000.0);

            for (c = 0; c < 3; c++) {
                EzSound *snd = (c == 2) ? ready_b : ready_a;

                if (ready_fired[c] || ready_frame < ready_cue[c] || !snd)
                    continue;
                ready_fired[c] = 1;
                /* The second cue STOPS AND REWINDS the first sample before
                 * replaying it - update2 @0x41c660 spells that out, and it
                 * matters because Battle-01 is 311 ms and the cues are a
                 * second apart, so the two never overlap anyway; doing it the
                 * original's way costs nothing and keeps the shape. */
                ezSoundStop(snd);
                ezSoundPlay(snd, 0);
            }
            /* THE ORACLE'S CHART MARK GOES ONE FRAME BEFORE THE ZERO. The
             * recorder hooks the original at KSongPlayerBase::start, and
             * its song clock - the audio position - begins some 12 ms after
             * that call, so the original's mark leads its zero; the port's
             * mark and zero fell on the same tick and every note and beam
             * sat 3-5 px (a sub-frame) ahead of the original's at the same
             * recorded time. Marking on the count's last frame puts the two
             * marks in the same relation to their zeros within a few ms. */
            /* AND IT IS LATCHED, NOT AN EQUALITY. `ready_frame` is derived
             * from the wall clock, so one long frame steps it past the
             * count's last and the mark was never raised at all - the whole
             * stage then recorded as one `play` screen and the comparer
             * paired a chart against a READY count (measured on
             * playcatch_hits: 6782 frames of "play" and no "chart"). */
            if (!chart_marked && ready_frame >= ready_total - 1 &&
                getenv("EZ2_ORACLE_OUT")) {
                chart_marked = 1;
                /* THE RECORDING'S MARK ONLY. The script's chart clock is
                 * raised a frame later, when the song's clock actually
                 * starts - see the note on ezOracleMark. Sharing the one
                 * call stamped every generated press a frame early. */
                ezOracleMark("chart");
            }
            if (ready_frame >= ready_total) {
                counting = 0;
                /* for the screen oracle: which recorded frame is the chart's
                 * zero (frames.txt carries the same clock) */
                if (getenv("EZ2_ORACLE_OUT")) {
                    printf("  chart zero at %u ms\n", ezTimeMs());
                }
                /* AND THE SCRIPT'S CHART CLOCK STARTS HERE, with the song's
                 * - the zero every generated press is stamped from. */
                if (getenv("EZ2_ORACLE_OUT"))
                    ezOracleScriptScreen("chart");
                /* start() fires on the frame after the latch, so the song's
                 * clock begins here and not when the stage was loaded. */
                if (fast)
                    vclock = 0.0;
                else
                    start_ms = use_wall ? ezTimeMsF() : ezAudioTimeMsF();
            }
        }

        /* NO "START HELD FIVE SECONDS" LEAVE. update2 @0x4249e0 does have
         * one (heldFor(4/5) >= 5000), but inside `if (g_1b2eb44 != 0)` -
         * the tutorial flag, whose only writers anywhere (src and both
         * Ghidra dumps) are `= 0`. A dead path in the cabinet; the port's
         * copy of it was deleted (SCREEN-AUDIT.md 5.4, Reachability). */

        /* --- backing audio, fired as its time arrives --- */
        /* NOT DURING THE READY COUNT. The chart clock is held at zero while
         * the count runs, and `time_ms <= now` is true at zero for a sample
         * at tick 0 - which on an old song is the whole backing track. It
         * fired on the count's first frame, five seconds before the chart:
         * BLUE's rap came in three measures early and its track ran out
         * before the last notes (the owner, 2026-09-04/05). The original
         * restarts the pump only when the count is over (update2 @0x4249e0
         * returns until pending->ready, then start() @0x41fa10 restarts
         * it), so nothing plays before then. */
        while (!counting && next_auto < g_auto_count &&
               g_auto[next_auto].time_ms <= now) {
            AutoNote *a = &g_auto[next_auto++];
            EzSound *s = (a->key_index < EZ2_EZI_SLOTS) ? g_samples[a->key_index] : 0;
            if (getenv("EZ2_TRACE_SCREENS") && a->time_ms < 1.0)
                printf("backing: key %d fires at chart %.1f ms, frame %d\n",
                       a->key_index, now, frames);
            if (s) {
                /* THE MATCHED SETTERS, not a paraphrase of them. This path
                 * had its own hand-rolled arithmetic - `(v - 127)/127 *
                 * 5000` for the level - where the press path already used
                 * ez2_ds_level / ez2_ds_pan, which ARE setVolume @0x40f4a0
                 * and setPan @0x40f550 and which port/oracle/run.sh checks
                 * against the original's own object over every note volume
                 * 0..127 and five pan positions. Two spellings of one thing
                 * is how they drift; the backing was quieter than the game's
                 * across most of the range. */
                ezSoundVolume(s, ez2_ds_level(EZ2_MIX_UNITY, EZ2_MIX_UNITY,
                                              EZ2_MIX_UNITY, a->velocity));
                ezSoundPan(s, ez2_ds_pan(EZ2_PAN_CENTRE, a->pan));
                ezSoundPlay(s, 0);
            }
        }

        /* --- input --- */
        nev = ezInputEvents(ev, 32);
        for (i = 0; i < nev; i++) {
            int lane = -1;
            int fx_lane = 0;          /* an effector button playing a lane */
            /* Which lanes this event actually plays. One, normally; in
             * ScratchMix a strum fires every fret that is down. */
            int fire[EZ2_MAX_LANES], nfire = 0, fi;

            /* Channel to lane. The scratch is two directions onto one lane;
             * beyond that this is positional and follows mode.c's order,
             * which is the part that is NOT verified - see mode.h. */
            /* The effector row rides above the lane mapping - update2
             * @0x41e620's model. START arms the speed section; effector
             * keys 1/2 toggle the boosts (control ids 6/7); the turntable
             * with START held is the speed dial (commands 0x22/0x23,
             * handlers +/-25 @0x422f48/0x422fd7 = ez2_speed_step_percent).
             * EFFECT3/4 keep the port's bare +/- for scripting. */
            if (ev[i].channel == EZ_IN_START ||
                (duo && ev[i].channel == EZ_IN_P2_START)) {
                int side = (ev[i].channel == EZ_IN_P2_START) ? 1 : 0;

                start_held[side] = ev[i].down;
                continue;
            }

            /* PER MODE, per Effector6thStyle::update2 @0x41e620 (SCREEN-
             * AUDIT.md 5.6): in 7StreetMix and StreetMix (3/7) nothing on
             * the effector row fires unless a seated side holds START; in
             * SpaceMix and 14RadioMix (5/9) the row jumps to its radio
             * ladder before keys 8/9 are read, so effector 3/4 do nothing
             * and the +-25 is on the PEDALS (0x11 down, 0x19 up) without
             * START - and with START held the pedals are the boosts. */
            {
                /* THE ROLE OF THE EFFECTOR ROW FOLLOWS THE DESCRIPTOR THE
                 * LANES CAME FROM, and on CV2 that is the SUB-mode. A CV2
                 * stage runs 5-key, 7-key, club or space charts under
                 * `CV2Mix`, so asking the session's mode name gave EZ2_MODE_CV2
                 * here, `is37` came out false, and its 7-key charts had their
                 * two extra lanes - which ARE the effector buttons - eaten by
                 * the boost toggles instead of judged (the owner, 2026-09-08:
                 * "for 7k mode the two effector keys didn't register").
                 * gds_mode is the same name gds_key_for_channel resolved the
                 * lanes with, so the two cannot disagree again. */
                ez2_mode em = ez2_mode_from_name(gds_mode);
                int start_any = start_held[0] || (duo && start_held[1]);
                int is37 = em == EZ2_MODE_7STREET || em == EZ2_MODE_RADIO;
                int is59 = em == EZ2_MODE_SPACE || em == EZ2_MODE_14RADIO;

                /* In the 7-key and 14-key families the effector buttons
                 * ARE lanes (gds_key_for_channel: keys 6/7, and 8/9 in the
                 * 14-key ones), so with START up they go to the lane switch
                 * below and skip every gesture. START held keeps them the
                 * gestures they are everywhere else. */
                fx_lane = !start_any &&
                          ((is37 && (ev[i].channel == EZ_IN_EFFECT1 ||
                                     ev[i].channel == EZ_IN_EFFECT2 ||
                                     /* AND 8/9 ARE THE SIXTH AND SEVENTH KEYS
                                      * OF THE OTHER PANEL. With one player
                                      * they belong to nobody and are dropped
                                      * below; with two they are player two's
                                      * two extra lanes, the same buttons
                                      * 6/7 are for player one. */
                                     (duo && (ev[i].channel == EZ_IN_EFFECT3 ||
                                              ev[i].channel == EZ_IN_EFFECT4)))) ||
                           (is59 && ev[i].channel >= EZ_IN_EFFECT1 &&
                                    ev[i].channel <= EZ_IN_EFFECT4));
                if (is37 && !start_any && !fx_lane &&
                    ev[i].channel >= EZ_IN_EFFECT1 &&
                    ev[i].channel <= EZ_IN_EFFECT4)
                    continue;
                if (is59 && !fx_lane && ev[i].down &&
                    (ev[i].channel == EZ_IN_EFFECT3 ||
                     ev[i].channel == EZ_IN_EFFECT4))
                    continue;
                if (is59 && ev[i].down &&
                    (ev[i].channel == EZ_IN_PEDAL ||
                     ev[i].channel == EZ_IN_P2_PEDAL)) {
                    if (start_any) {
                        if (ev[i].channel == EZ_IN_PEDAL)
                            fx.bass_on = !fx.bass_on;
                        else
                            fx.treble_on = !fx.treble_on;
                        fx_stamp(&fx, (int)(chart.bpm + 0.5f), live_pct,
                                 ez2_scroll_bpm((int)(chart.bpm + 0.5f), live_pct));
                        fx.frame = 0;
                    } else {
                        live_pct = ez2_speed_step_by(live_pct,
                                       ev[i].channel == EZ_IN_PEDAL ? -25 : 25);
                        fx_stamp(&fx, (int)(chart.bpm + 0.5f), live_pct,
                                 ez2_scroll_bpm((int)(chart.bpm + 0.5f), live_pct));
                        fx.frame = 0;
                    }
                    /* the pedal is still a lane in these modes: fall on */
                }
            }
            if (!fx_lane && ev[i].down && (ev[i].channel == EZ_IN_EFFECT1 ||
                                           ev[i].channel == EZ_IN_EFFECT2)) {
                /* Effector keys 1/2 (control ids 6/7): the boost toggles
                 * (commands 0x1b/0x1c). Stamped only - the EQ itself is DSP
                 * the port does not have yet. */
                if (ev[i].channel == EZ_IN_EFFECT1)
                    fx.bass_on = !fx.bass_on;
                else
                    fx.treble_on = !fx.treble_on;
                fx_stamp(&fx, (int)(chart.bpm + 0.5f), live_pct,
                         ez2_scroll_bpm((int)(chart.bpm + 0.5f), live_pct));
                fx.frame = 0;
                continue;
            }
            {
                /* The speed ladder, the sink @0x422f20's own arms:
                 * effector 3/4 = -/+25 (commands 0xa/9), START + the
                 * turntable = the 0.01 dial, -/+1 (0x23/0x22), START +
                 * keys 2/4 = -/+10 (0x25/0x24). Every consumed event is
                 * an effector gesture, not a note hit. */
                int sd = 0;

                int side = 0;   /* whose dial this gesture turns */

                if (ev[i].down && !fx_lane) {
                    /* The effector row is 1P's hardware - there is no second
                     * one on the cabinet (platform.h's channel list), so
                     * these stay 1P's. */
                    if (ev[i].channel == EZ_IN_EFFECT4)      sd =  25;
                    else if (ev[i].channel == EZ_IN_EFFECT3) sd = -25;
                    else if (start_held[0]) {
                        if (ev[i].channel == EZ_IN_SCRATCH_UP)        sd = 1;
                        else if (ev[i].channel == EZ_IN_SCRATCH_DOWN) sd = -1;
                        else if (ev[i].channel == EZ_IN_KEY4)         sd = 10;
                        else if (ev[i].channel == EZ_IN_KEY2)         sd = -10;
                    }
                    /* AND 2P'S OWN, off 2P's own bank. Checked second so a
                     * 1P gesture is never reattributed; the two banks are
                     * disjoint channels, so nothing can match both. */
                    if (sd == 0 && duo && start_held[1]) {
                        if (ev[i].channel == EZ_IN_P2_SCRATCH_UP)        sd = 1;
                        else if (ev[i].channel == EZ_IN_P2_SCRATCH_DOWN) sd = -1;
                        else if (ev[i].channel == EZ_IN_P2_KEY4)         sd = 10;
                        else if (ev[i].channel == EZ_IN_P2_KEY2)         sd = -10;
                        if (sd != 0)
                            side = 1;
                    }
                }
                if (sd != 0 && side == 1) {
                    /* 2P's dial, and turning it SPLITS the field if it was
                     * not split already - the decision is not only made at
                     * load time, because this is exactly the moment a player
                     * asks for their own speed. */
                    int li;

                    /* UNLESS THERE IS NOTHING TO SPLIT. With one field 2P has
                     * no scroll of their own, and the one thing this must not
                     * do is fall through and turn 1P's dial instead - which is
                     * what a single shared flag used to do. So the gesture is
                     * dropped, not redirected. */
                    if (!duo)
                        continue;

                    live_pct2 = ez2_speed_step_by(live_pct2, sd);
                    if (live_pct2 != live_pct && !g_scroll_split) {
                        for (li = 0; li < EZ2_MAX_LANES; li++)
                            g_lane_player[li] =
                                (unsigned char)(lane_player[li] ? 1 : 0);
                        g_scroll_split = 1;
                    }
                    continue;
                }
                if (sd != 0) {
                    live_pct = ez2_speed_step_by(live_pct, sd);
                    /* The rate EASES to the new dial - the panels chase it a
                     * tenth of the gap per tick rather than jumping. Nothing
                     * to do here but move the dial; the frame loop's
                     * ez2_scroll_tick does the rest. */
                    fx_stamp(&fx, (int)(chart.bpm + 0.5f), live_pct,
                             ez2_scroll_bpm((int)(chart.bpm + 0.5f),
                                            live_pct));
                    fx.frame = 0;
                    continue;
                }
            }
            if (start_held[0] &&
                (ev[i].channel == EZ_IN_SCRATCH_UP ||
                 ev[i].channel == EZ_IN_SCRATCH_DOWN ||
                 ev[i].channel == EZ_IN_KEY2 || ev[i].channel == EZ_IN_KEY4))
                continue;   /* held START makes these the dial, not hits */
            if (start_held[1] &&
                (ev[i].channel == EZ_IN_P2_SCRATCH_UP ||
                 ev[i].channel == EZ_IN_P2_SCRATCH_DOWN ||
                 ev[i].channel == EZ_IN_P2_KEY2 ||
                 ev[i].channel == EZ_IN_P2_KEY4))
                continue;   /* and the same for 2P, on 2P's own bank */
            switch (ev[i].channel) {
            case EZ_IN_KEY1: case EZ_IN_KEY2: case EZ_IN_KEY3:
            case EZ_IN_KEY4: case EZ_IN_KEY5:
                lane = ev[i].channel - EZ_IN_KEY1;
                break;
            case EZ_IN_KEY6: lane = 5; break;
            case EZ_IN_KEY7: lane = 6; break;
            case EZ_IN_SCRATCH_UP: case EZ_IN_SCRATCH_DOWN:
                lane = lane_count - 2; break;
            case EZ_IN_PEDAL:
                lane = lane_count - 1; break;
            default: break;
            }
            /* With a descriptor, the map is DATA: translate the seam's channel
             * to the game's own and let the .gds say which lane it drives.
             * Both scratch directions resolve to the one turntable lane
             * because the file gives that entry two keys. */
            if (gds_ok) {
                int gk = gds_key_for_channel(ev[i].channel);
                int gl = (gk >= 0) ? ez2_gds_lane_for_key(&gds, 0, gk) : -1;

                if (gl >= 0)
                    lane = gl;
                else if (duo && gk >= 0) {
                    /* AND PLAYER TWO'S HANDS FIND THEIRS IN SLOT 1. The
                     * second slot is the mirrored bank - 5KeyMix's is tracks
                     * 20/14-18/19 against slot 0's 10/3-7/11 - and its lanes
                     * were appended after the first player's, so its index
                     * is offset by however many the first has. */
                    gl = ez2_gds_lane_for_key(&gds, 1, gk);
                    if (gl >= 0)
                        lane = lane_p1 + gl;
                }
            }
            if (lane < 0 || lane >= lane_count)
                continue;
            lane_down[lane] = ev[i].down;
            /* NOTHING JUDGES AND NOTHING SOUNDS while the count runs -
             * update2 @0x4249e0 returns before any of it. Hammering the keys
             * over the countdown must not spend the notes waiting behind
             * it. */
            if (counting)
                continue;
            if (!ev[i].down || auto_play)
                continue;
            /* IN EZ2CATCH A KEY IS NOT A NOTE. m46d360 @0x46d360 reads keys
             * 0xa / 0xc / 0xe only as a 0.8 / 1.2 / 1.5 scale on the
             * paddle's speed WHILE HELD, and nothing in the mode hands a
             * press to the judge or to a channel - the catching is done by
             * the paddle covering a lane. So no keysound and no judgement
             * here, which is the reported "pressing keys triggers sounds
             * when it should not". */
            if (catch_mode)
                continue;

            /* --- SCRATCHMIX IS A FRET-AND-STRUM GAME -------------------
             *
             * GFMainGameDirector::m45d200 @0x45d200 is the mode's own input
             * scanner and it is not a keys game at all. Two roles:
             *
             *   the TURNTABLE is the STRUM. Codes 0x0f/0x10 (and 0x17/0x18
             *   for side two) are read as a pair and drive `pick`, with a
             *   latch that counts up while held and expires past six frames;
             *   the entry is marked on the judge (`setF0(lane, 1)`) and
             *   never judged as a lane of its own.
             *
             *   the FIVE KEYS are FRETS, and alone they do nothing. The arm
             *   forces a held fret's state to 1 whenever no strum is latched
             *   (`if (bx[0] == 0 && bx[2] == 0) st = 1;`) - so it never
             *   CHANGES, and the dispatcher below it only fires on a change.
             *   A press reaches the player exactly when a fresh strum lands
             *   with the fret held: `if (pick == 2) if (st == 2) if (bx[0] >
             *   0 || bx[2] > 0) handleEvent(i, 1)` - kind 1, judgePress
             *   (PlayerRecord::handleEvent @0x466da0).
             *
             * The shipped charts agree: ScratchMix's five Lines carry every
             * note, its turntable and pedal tracks are EMPTY, and there is
             * not one hold in them - the "hold" is the fret key in your hand
             * while you scratch.
             *
             * So the fret's own press sounds nothing and judges nothing; the
             * strum below does both, for every fret held at that moment. */
            nfire = 0;
            if (scratch_mode) {
                int strum = (ev[i].channel == EZ_IN_SCRATCH_UP ||
                             ev[i].channel == EZ_IN_SCRATCH_DOWN ||
                             ev[i].channel == EZ_IN_P2_SCRATCH_UP ||
                             ev[i].channel == EZ_IN_P2_SCRATCH_DOWN);

                /* WHOSE HANDS THESE ARE. m45d200 reads the two banks as two
                 * players - 0x0f/0x10 against 0x17/0x18 - so a strum arms
                 * ITS OWN side's latch and sweeps ITS OWN side's frets. The
                 * port swept every lane on the field and kept one latch, so
                 * with two people playing each scratch fired the other's
                 * held keys and opened the other's window. */
                int pl = duo ? (int)lane_player[lane] : 0;

                if (strum) {
                    /* The strum: arm the latch, then play and judge every
                     * fret already down. The turntable's own lane carries no
                     * notes and is not judged here. */
                    int L;
                    /* The PEDAL is not a fret. m45d200's arm excludes codes
                     * 0x11 and 0x19 outright (`code != 0x11 && code != 0x19`)
                     * - they are the effector chord in race mode - and the
                     * shipped charts put nothing on that lane anyway, so
                     * firing it would only sound a note that is not there.
                     * Player two's pedal is their own bank's (0x19). */
                    int pedal = gds_ok
                              ? ez2_gds_lane_for_key(&gds, pl,
                                    gds_key_for_channel(pl ? EZ_IN_P2_PEDAL
                                                           : EZ_IN_PEDAL))
                              : -1;

                    if (pedal >= 0 && pl)
                        pedal += lane_p1;
                    strum_until[pl] = now + STRUM_WINDOW_MS;
                    for (L = 0; L < lane_count && nfire < EZ2_MAX_LANES; L++)
                        if (L != lane && L != pedal && lane_down[L] &&
                            (int)lane_player[L] == pl)
                            fire[nfire++] = L;
                } else if (ev[i].channel == EZ_IN_PEDAL ||
                           ev[i].channel == EZ_IN_P2_PEDAL) {
                    continue;   /* not a fret - see the strum arm above */
                } else if (strum_until[pl] >= 0.0 && now <= strum_until[pl]) {
                    /* A fret pressed INSIDE the latch still counts - it stays
                     * up for six frames after the scratch, so fretting a
                     * moment late is a hit rather than a miss. */
                    fire[nfire++] = lane;
                } else {
                    continue;   /* a fret alone is silent and unjudged */
                }
            } else {
                fire[nfire++] = lane;
            }

            /* THE KEYSOUND FIRES FIRST, and unconditionally - reseedLane
             * @0x40ffa0 has no window, so a press between notes still
             * sounds the nearer neighbour. Judgement is a separate
             * question, decided below.
             *
             * ON THIS LANE'S OWN CHANNEL, in reseedLane's own order: bind
             * the record's sample (m40fbf0), then its volume, then its pan,
             * then retrigger (m40f520). Two lanes carrying the same sample
             * at opposite pans are then two voices rather than one fought
             * over, which is what 11stargazer's paired long notes need. */
            for (fi = 0; fi < nfire; fi++) {
              int lane = fire[fi];
              {
                int k = keysound_pick(lane, now);
                EzSound *src = (k >= 0 && g_notes[k].key_index < EZ2_EZI_SLOTS)
                             ? g_samples[g_notes[k].key_index] : 0;
                EzSound *v = (lane < EZ2_MAX_LANES) ? g_lane_voice[lane] : 0;

                if (src && v && ezSoundChannelBind(v, src)) {
                    ezSoundVolume(v, ez2_ds_level(EZ2_MIX_UNITY, EZ2_MIX_UNITY,
                                                  EZ2_MIX_UNITY,
                                                  g_notes[k].velocity));
                    ezSoundPan(v, ez2_ds_pan(lane_pan_pos(lane), g_notes[k].pan));
                    ezSoundStop(v);
                    ezSoundPlay(v, 0);
                }
            }

            /* The nearest unjudged note in this lane. */
            {
                /* JUDGE AT THE KEY'S OWN EDGE, not at the frame that noticed
                 * it. The events have carried an SDL timestamp since the
                 * input layer was written - `ezInputEvents - timestamped
                 * press/release EVENTS. What judgement needs, because a
                 * level polled once a frame cannot resolve a 6 ms window at
                 * 16.7 ms of granularity' - and judgement then threw it away
                 * and used the frame clock, so every press carried 0..16.7 ms
                 * of delay, all of it LATE, averaging about 8.
                 *
                 * The event's timestamp is on SDL's tick clock and `now` is
                 * on the AUDIO clock, so the two cannot be compared directly;
                 * what transfers is the event's AGE, which both clocks
                 * measure in real milliseconds.
                 *
                 * ../../docs/judge-timing.md describes this exactly: the
                 * original stamps a press with the song clock AT PROCESSING
                 * TIME minus a fixed 5 ticks, "sized like the average
                 * frame-sampling delay (~8 ms) - the devs compensated the
                 * input path's mean latency", and says a backdating patch is
                 * "both meaningful and cleanly implementable". This is that
                 * patch. The original's -5 is deliberately NOT also applied:
                 * it exists to cancel the very delay this removes, and doing
                 * both would bias every press early instead of late. */
                double press = now;
                unsigned int age = ezTimeMs() - ev[i].time_ms;

                if (age <= 200u) {              /* a sane, positive age */
                    press = now - (double)age;
                    age_n++;
                    age_sum += age;
                    if (age > age_max)
                        age_max = age;
                }
                int best = -1;
                double best_dt = 1e9;

                for (j = 0; j < g_note_count; j++) {
                    PlayNote *p = &g_notes[j];
                    double dt, win;
                    if (p->judged || p->lane != lane)
                        continue;
                    dt = press - p->time_ms;
                    /* The early exit uses the chart's widest possible window;
                     * candidacy uses this note's own, because a tick is worth
                     * a different number of milliseconds at every BPM. */
                    if (dt < -miss_window_ms) break;        /* sorted by time */
                    win = (double)ini.miss_ticks * p->tick_ms_size;
                    if (dt > win || dt < -win) continue;
                    if (dt < 0 ? -dt : dt) {
                        double a = dt < 0 ? -dt : dt;
                        if (a < best_dt) { best_dt = a; best = j; }
                    } else { best_dt = 0; best = j; }
                }
                if (best >= 0) {
                    ez2_judgement v = ez2_judge(
                        (press - g_notes[best].time_ms) / g_notes[best].tick_ms_size,
                        &ini);
                    if (v != EZ2_J_NONE) {
                        /* for the screen oracle: where the presses land */
                        dt_sum += press - g_notes[best].time_ms;
                        dt_n++;
                        g_notes[best].judged = 1;
                        if (v != EZ2_J_MISS && g_notes[best].hold_ticks) {
                            /* The head commits like a tap and the hold
                             * starts: instalments then pay while held and
                             * FAIL while released - see ez2/score.h. */
                            ez2_score_hold_press(duo && lane_player[lane] ? &sc2 : &sc, lane, v,
                                                 g_notes[best].hold_ticks + 6,
                                                 g_notes[best].tick,
                                                 g_notes[best].kind,
                                                 chart.ticks_per_measure, &ini);
                        } else {
                            ez2_score_apply(duo && lane_player[lane] ? &sc2 : &sc, v, &ini);
                        }
                        ez2_skin_on_judge(skin_for_lane(lane), v,
                                          track_for_lane(lane),
                                          press < g_notes[best].time_ms ? 1 : 0);
                        last_judge = ez2_judgement_name(v);
                        last_judge_at = now;
                    }
                }
              }
            }
        }

        /* --- notes that aged out, and auto-play --- */
        for (j = 0; j < g_note_count; j++) {
            PlayNote *p = &g_notes[j];
            if (p->judged)
                continue;
            if (auto_play || catch_mode) {
                if (now < p->time_ms)
                    break;                       /* sorted */
                /* CATCH JUDGES BY POSITION. m46d360 sets each lane's
                 * JudgeLane flag from whether the paddle covers it, and
                 * `tick() @0x426ab0 then grades every hit 5 AT ITS START
                 * with no input at all` (include/judge.h) - so a note on an
                 * open lane is caught and one on a closed lane is not. */
                if (catch_mode && !auto_play &&
                    (p->lane >= EZ2_MAX_LANES || !paddle_open[p->lane])) {
                    p->judged = 1;
                    p->fell = 1;
                    ez2_score_apply(duo && lane_player[p->lane] ? &sc2 : &sc,
                                    EZ2_JUDGE_UNHIT, &ini);
                    ez2_skin_on_judge(skin_for_lane(p->lane), EZ2_JUDGE_UNHIT,
                                      track_for_lane(p->lane), -1);
                    last_judge = "MISS";
                    last_judge_at = now;
                    continue;
                }
                p->judged = 1;
                /* A CAUGHT NOTE SOUNDS. In the keys modes the keysound rides
                 * the PRESS (reseedLane @0x40ffa0, above); EZ2Catch has no
                 * press - the paddle covering the lane is the hit - so
                 * nothing here ever bound a sample and the fruit landed in
                 * silence. The notes ARE the song's keysounds, so the whole
                 * melody went missing.
                 *
                 * Same idiom as the press path, on the note's own lane
                 * channel: bind (m40fbf0), volume, pan, retrigger (m40f520).
                 * Autoplay already sounds notes through its own path, so
                 * this is the catch case only. */
                if (catch_mode && !auto_play && p->lane < EZ2_MAX_LANES &&
                    p->key_index < EZ2_EZI_SLOTS) {
                    EzSound *src = g_samples[p->key_index];
                    EzSound *v   = g_lane_voice[p->lane];

                    if (src && v && ezSoundChannelBind(v, src)) {
                        ezSoundVolume(v, ez2_ds_level(EZ2_MIX_UNITY,
                                                      EZ2_MIX_UNITY,
                                                      EZ2_MIX_UNITY,
                                                      p->velocity));
                        ezSoundPan(v, ez2_ds_pan(lane_pan_pos(p->lane), p->pan));
                        ezSoundStop(v);
                        ezSoundPlay(v, 0);
                    }
                }
                if (p->hold_ticks)
                    ez2_score_hold_press(duo && lane_player[p->lane] ? &sc2 : &sc, p->lane, EZ2_J_KOOL,
                                         p->hold_ticks + 6, p->tick, p->kind,
                                         chart.ticks_per_measure, &ini);
                else
                    ez2_score_apply(duo && lane_player[p->lane] ? &sc2 : &sc, EZ2_J_KOOL, &ini);
                ez2_skin_on_judge(skin_for_lane(p->lane), EZ2_J_KOOL,
                                  track_for_lane(p->lane), -1);
                last_judge = "KOOL";
                last_judge_at = now;
            } else if (now - p->time_ms > (double)ini.miss_ticks * p->tick_ms_size) {
                p->judged = 1;
                if (p->hold_ticks) {
                    /* An unhit hold starts its hold at MISS (the game's
                     * expiry scan goes through the press commit): the
                     * remaining instalments tick out as MISSes while the
                     * key stays up, and holding it late recovers GOOD. */
                    ez2_score_hold_press(duo && lane_player[p->lane] ? &sc2 : &sc, p->lane, EZ2_JUDGE_UNHIT,
                                         p->hold_ticks + 6, p->tick, p->kind,
                                         chart.ticks_per_measure, &ini);
                    ez2_score_hold_set_held(duo && lane_player[p->lane] ? &sc2 : &sc, p->lane, lane_down[p->lane]);
                } else {
                    ez2_score_apply(duo && lane_player[p->lane] ? &sc2 : &sc, EZ2_JUDGE_UNHIT, &ini);
                }
                ez2_skin_on_judge(skin_for_lane(p->lane), EZ2_JUDGE_UNHIT,
                                  track_for_lane(p->lane), -1);
                last_judge = "MISS";
                last_judge_at = now;
            } else {
                break;                           /* sorted */
            }
            /* AUTOPLAY ALONE SOUNDS A NOTE ON SCHEDULE. The option gives
             * the player's handles kind 2, which puts them back inside
             * applyEvent's `!= 1` gate and lets the song clock play them -
             * that IS what autoplay is. A MISS sounds nothing: the walk
             * skipped the note and no press reseeded it. The port used to
             * sound both, on the reasoning that "the notes ARE the music,
             * so a missed note must not silence the song" - which is true
             * of the auto lanes, and they are handled above. */
            if (auto_play) {
                EzSound *s = (p->key_index < EZ2_EZI_SLOTS)
                           ? g_samples[p->key_index] : 0;
                if (s) {
                    /* The matched setters' arithmetic, not a float paraphrase
                     * of it - two truncating integer divisions in order. The
                     * paraphrase was one lsb low across most of the range;
                     * port/oracle checks this against @0x40f4a0 / @0x40f550
                     * themselves. Unity mix: the port has no per-lane mixer. */
                    ezSoundVolume(s, ez2_ds_level(EZ2_MIX_UNITY, EZ2_MIX_UNITY,
                                                  EZ2_MIX_UNITY, p->velocity));
                    ezSoundPan(s, ez2_ds_pan(lane_pan_pos(p->lane), p->pan));
                    ezSoundPlay(s, 0);
                }
            }
        }

        /* The key state feeds the hold machine: a held lane pumps its
         * instalments at the head's grade, a released one ticks the rest
         * out as FAILs. AUTOPLAY never lets go, so it keeps every one - which
         * is what makes its max combo the chart's full total and lets
         * AUTOPLAY PERFECT stay a real check. The clock is the song's own,
         * in chart ticks, as the game runs it. */
        if (!auto_play)
            for (i = 0; i < lane_count; i++)
                ez2_score_hold_set_held(duo && lane_player[i] ? &sc2 : &sc, i, lane_down[i]);

        /* THE PADDLE. m46d360 @0x46d360, per side:
         *
         *   stR = getState(0x10)   the turntable one way
         *   stL = getState(0x0f)   and the other
         *   v = delta, scaled 0.8 / 1.2 / 1.5 by keys 0xa / 0xc / 0xe HELD
         *       (B1 / B3 / B5 - which is the whole of what those keys do in
         *       this mode, and why they must not sound a note)
         *   v = (5 > v) ? v*v*6 : v*30            going right
         *   v = (v > -5) ? v*v*-6 : v*30          going left
         *   x = paddle +/- v, clamped to [0, (lanes-1)*width - half]
         *
         * A cabinet feeds `delta` from a real turntable; a keyboard has one
         * bit, so a held key is a steady delta - a feel constant, not a
         * reading (NEEDS-OWNER item D.2). A delta of 1 gave 6 px a frame,
         * which the owner played and called a bit too fast (2026-09-03),
         * so the key now feeds sqrt(0.5): half the speed, 3 px a frame,
         * through the same curve so B1/B3/B5 still scale it. */
        if (catch_mode && lane_count > 0) {
            float width = (float)ez2_skin_lane_width(g_skin, lane_count);
            float v = 0.0f, hi;
            int li;

            if (ezInputDown(EZ_IN_SCRATCH_DOWN) || ezInputDown(EZ_IN_SCRATCH_UP)) {
                v = 0.70710678f;
                if (ezInputDown(EZ_IN_KEY1)) v *= 0.8f;
                if (ezInputDown(EZ_IN_KEY3)) v *= 1.2f;
                if (ezInputDown(EZ_IN_KEY5)) v *= 1.5f;
                if (ezInputDown(EZ_IN_SCRATCH_DOWN))
                    v = (5.0f > v) ? v * v * 6.0f : v * 30.0f;
                else
                    v = -((5.0f > v) ? v * v * 6.0f : v * 30.0f);
            }
            hi = (float)(lane_count - 1) * width - paddle_half;
            paddle_x += v;
            if (paddle_x > hi) paddle_x = hi;
            else if (0.0f > paddle_x) paddle_x = 0.0f;

            /* `x > lo - half && lo + width > x` - m46d360's own predicate,
             * lane by lane. An open lane catches; a closed one does not. */
            for (li = 0; li < lane_count && li < EZ2_MAX_LANES; li++) {
                float lo = (float)li * width;

                paddle_open[li] = (paddle_x > lo - paddle_half &&
                                   lo + width > paddle_x);
            }
            g_catch_paddle = 1;
            g_paddle_x = paddle_x;
            g_paddle_half = paddle_half;
            memcpy(g_paddle_open, paddle_open, sizeof g_paddle_open);
        }

        /* THE HELD NOTE'S EFFECT LOOPS. It is not one burst for the whole
         * hold: the pump pays an instalment every beat-division and each one
         * runs the press flash through the slot's sink - "the sink is paid
         * one note at that grade, the effect is drawn through the track sink
         * at +0x3cc" (src/holdtick.cpp). TrackSink::m42d370 @0x42d370 then
         * puts that lane's bomb frame back to 0:
         *
         *     if (a >= 4)      s1460.f98[i] = 0;   // the COOL bomb
         *     else if (a == 3) f1620[i] = 0;       // the LongNote bomb
         *     f3230[a] = 0xf;                      // the judgement flash
         *
         * so a hold flashes once per instalment for as long as it is held.
         * Watching each lane's `owed` fall is the same event: score.h keeps
         * that counter per lane precisely so a HUD can flash per instalment
         * "the way the pump's effect draw (@0x42d370, trailing 1) does". */
        {
            int ndown = 0;

            for (i = 0; i < lane_count; i++)
                if (lane_down[i])
                    ndown++;
            if (ndown > held_peak)
                held_peak = ndown;
        }
        for (i = 0; i < lane_count && i < 24; i++) {
            const ez2_score *ls = (duo && lane_player[i]) ? &sc2 : &sc;
            long owed = ls->holds[i].owed;

            if (ls->holds[i].active && !ls->holds[i].held && hold_owed[i] > 0)
                hold_broken++;

            if (ls->holds[i].active && owed < hold_owed[i])
                /* THROUGH THE CONVERTER. holds[].grade is the GAME's
                 * numbering - 5 is KOOL - and ez2_judgement's 5 is MISS, so
                 * casting it straight across showed a MISS plate for every
                 * instalment of a perfectly-held note while the scorer,
                 * which does go through port_grade, stayed correct. That is
                 * the "loads of misses during long notes, but the combo
                 * never drops and the tally says two". */
                ez2_skin_on_judge(skin_for_lane(i),
                                  ez2_score_judgement_of(ls->holds[i].grade),
                                  track_for_lane(i), -1);
            hold_owed[i] = ls->holds[i].active ? owed : 0;
        }
        {
            long paid = sc.hold_paid;
            long paid2 = sc2.hold_paid;
            ez2_score_hold_advance(&sc, ez2_tempo_tick_at_ms(&g_tempo,
                                                              now - LEAD_IN_MS,
                                                              chart.ticks_per_measure),
                                   &ini);
            if (duo)
                ez2_score_hold_advance(&sc2, ez2_tempo_tick_at_ms(&g_tempo,
                                                              now - LEAD_IN_MS,
                                                              chart.ticks_per_measure),
                                   &ini);
            /* The pump draws a judgement per instalment; so does the HUD -
             * AND EACH FIELD DRAWS ITS OWN. Two players is two panels with
             * a judgement plate and a combo readout each, so a plate raised
             * on the shared skin pointer put player two's hold, and player
             * two's combo, on player one's field. */
            if (sc.hold_paid != paid) {
                last_judge = ez2_judgement_name(sc.last_hold_grade);
                last_judge_at = now;
                ez2_skin_on_judge(g_skin_p[0], sc.last_hold_grade, -1, -1);
            }
            if (duo && sc2.hold_paid != paid2)
                ez2_skin_on_judge(g_skin_p[1], sc2.last_hold_grade, -1, -1);
            /* The combo clip restarts on every change. */
            {
                static long shown_combo = -1;
                static long shown_combo2 = -1;
                if (sc.combo != shown_combo) {
                    ez2_skin_on_combo(g_skin_p[0], sc.combo);
                    shown_combo = sc.combo;
                }
                if (duo && sc2.combo != shown_combo2) {
                    ez2_skin_on_combo(g_skin_p[1], sc2.combo);
                    shown_combo2 = sc2.combo;
                }
            }
        }

        /* Keys 8/9 fire on the edge OR every tick while held half a second
         * (`st == 2 || (st == 3 && heldFor(8) >= 500)`), outside the two
         * families above. */
        /* THE DISPLAY TIME. Under the late present the frame drawn now is
         * shown at the next refresh, a few milliseconds on; drawing the
         * field for THAT moment steps it exactly one refresh per frame,
         * which is what the original's per-vblank tick did on the CRT.
         * Judgement keeps `now`; only the picture is projected. */
        /* NO LEAD IN FAITHFUL MODE: the original draws the chart at the
         * clock it reads, not at the time the picture will be shown, and
         * the port's half-frame prediction put every note and beam 3-5 px
         * ahead of the original's at the same recorded time (tools/oracle,
         * 2026-09-08). The lead is the port's own latency trim. */
        g_ready_counting = counting;
        disp = (fast || counting || ez2_faithful()) ? now : now + ezPresentEtaMs();

        {
            static double fx3_at = -1.0, fx4_at = -1.0;
            /* The same rule and the same reason as the edge arm above: the
             * descriptor the lanes came from, not the session's mode. */
            ez2_mode em = ez2_mode_from_name(gds_mode);
            int start_any = start_held[0] || (duo && start_held[1]);
            int blocked = (em == EZ2_MODE_SPACE || em == EZ2_MODE_14RADIO) ||
                          ((em == EZ2_MODE_7STREET || em == EZ2_MODE_RADIO) &&
                           !start_any);
            int c;

            for (c = 0; c < 2; c++) {
                int ch = c ? EZ_IN_EFFECT4 : EZ_IN_EFFECT3;
                double *at = c ? &fx4_at : &fx3_at;

                if (ezInputDown(ch) && !counting) {
                    if (*at < 0.0)
                        *at = now;
                    else if (!blocked && now - *at >= 500.0 && dticks > 0) {
                        int t;

                        for (t = 0; t < dticks; t++)
                            live_pct = ez2_speed_step_by(live_pct, c ? 25 : -25);
                        fx_stamp(&fx, (int)(chart.bpm + 0.5f), live_pct,
                                 ez2_scroll_bpm((int)(chart.bpm + 0.5f), live_pct));
                        fx.frame = 0;
                    }
                } else {
                    *at = -1.0;
                }
            }
        }
        last_now = now;

        tick = (int)(now * 60.0 / 1000.0);
        dticks = tick - tick_prev;
        if (dticks < 0)
            dticks = 0;
        if (dticks > 60)
            dticks = 60;
        tick_prev = tick;

        /* THE GAUGE OVER, before the end-of-song gate: a stage that dies
         * does not reach its last note. In a TWO-UP game the ramp does not
         * run at all - update2 gates it `countListA() != 2` - and the sink's
         * own raise (checkBothPlayers @0x42e83e, which the oracle checks)
         * only fires when BOTH sides are down, so the port asks for both. */
        dead_ticks += dticks;
        /* WHETHER A DEAD GAUGE ENDS THE STAGE is m420570 @0x420570's
         * decision (../../src/ez2djfinish.cpp), arm by arm: under CV2
         * always; in RubyMix only once fifty combo breaks have run up
         * since the death (the sink zeroes g_1b5f19c on every break while
         * the latch is clear, so the count starts at the death); with two
         * players never through this path; and in the FIRST element of
         * the credit (`g_elemCount == 0`) not at all - the stage plays to
         * its last note, the sink's g_1b2ea34 marks the first-stage death
         * and the session goes on to the mode intro and the next select
         * with no result (ez2/session.c). Measured against the running
         * original (tools/oracle, silent3, 2026-09-08): stage 1 played all
         * 8178 frames on a gauge dead at its 21st miss, stage 2 left 120
         * ticks after its own death. The port used to leave on either. */
        if (dead_ramp < 0 &&
            (duo ? (sc.failed && sc2.failed) : sc.failed != 0)) {
            long breaks = sc.counts[EZ2_J_MISS] + sc.counts[EZ2_J_FAIL];
            if (dead_breaks_at < 0)
                dead_breaks_at = breaks;
            if (id.mode == EZ2_MODE_CV2)
                dead_ramp = 0;
            else if (id.mode == EZ2_MODE_RUBY) {
                if (breaks - dead_breaks_at >= 50)
                    dead_ramp = 0;
            } else if (o->round == 0 && !duo)
                ;                                 /* the first stage plays on */
            else if (dead_ticks >= 50)
                dead_ramp = 0;
        }
        if (dead_ramp == 0 && dticks > 0 && snd_gaugeover) {
            ezSoundStop(snd_gaugeover);
            ezSoundPlay(snd_gaugeover, 0);
        }
        if (dead_ramp >= 0) {
            dead_ramp += dticks;
            gaugeover_frame += dticks;
        }
        if (dead_ramp > 120) {
            stage_failed = 1;
            running = 0;
        }

        if (now > end_ms) {
            /* m424830 @0x424830 -> ScrFader::m450420(2, 10): the frame
             * fades ten a tick from 0x100, 26 ticks, then the hand-over. */
            end_ramp += dticks;
            if (end_ramp >= 26)
                running = 0;
        }
        /* Behind everything, and on the chart's clock rather than the frame
         * loop's: the scene is authored against the song. */
        if (bga) {
            /* THE BACKGROUND FILLS THE CANVAS, and how is the one taste
             * decision in the layout - ../WIDESCREEN.md part 5 measured what
             * each costs. COVER scales it about the centre until it reaches
             * both edges (and crops 80px top and bottom at 854); NATIVE
             * leaves it 640x480 in the middle; BACKDROP is COVER with NATIVE
             * drawn over it, which is the only one that neither crops nor
             * zooms what you actually look at.
             *
             * The second pass is safe because ez2_bga_draw is a function of
             * the ABSOLUTE time it is handed - the video advances to a
             * timestamp, the scene picks a frame - so drawing the same
             * instant twice draws the same picture twice. */
            double at = (disp - LEAD_IN_MS) / 1000.0;
            int cw = SCREEN_W, ch = SCREEN_H, half;

            ezGetCanvas(&cw, &ch);
            half = (cw - SCREEN_W) / 2;

            if (g_layout.bga_mode == EZ2_BGA_COVER) {
                ezPushAnchor(EZ_ANCHOR_COVER);
                ez2_bga_draw(bga, at);
                ezPopAnchor();
            } else if (g_layout.bga_mode == EZ2_BGA_NATIVE || half <= 0) {
                ezPushAnchor(EZ_ANCHOR_CENTER);
                ez2_bga_draw(bga, at);
                ezPopAnchor();
            } else {
                /* BACKDROP: the scaled copy ONLY in the two gutter columns,
                 * then the native picture in the middle. The clip is what
                 * makes this work - a background is not opaque (its .str
                 * layers are alpha and additive), so an unclipped backdrop
                 * shows THROUGH the native copy and every sprite draws
                 * twice, offset and half-lit. That was the first attempt. */
                ezPushAnchor(EZ_ANCHOR_COVER);
                ezSetClipRect(0, 0, half, ch);
                ez2_bga_draw(bga, at);
                ezSetClipRect(half + SCREEN_W, 0, cw - half - SCREEN_W, ch);
                ez2_bga_draw(bga, at);
                ezClearClip();
                ezPopAnchor();

                ezPushAnchor(EZ_ANCHOR_CENTER);
                ez2_bga_draw(bga, at);
                ezPopAnchor();
            }
        }
        {
            /* The cursor, FRACTIONAL - a whole-tick cursor steps the field
             * 1.6px at a time. Then the chart's own multiplier catches up to
             * it and the live rate eases a tenth of the way, which is what
             * chaseKeysScrollRate does per panel tick. */
            now_tick = ez2_tempo_tick_at_ms_f(&g_tempo, disp - LEAD_IN_MS,
                                              g_tpm);
            /* update2 @0x4249e0: output 4 on for two thirds of every beat
             * (`f34c` = the 48-tick beat the sink's tempo query returns). */
            if (!counting)
                ez2_lights_beat(((int)now_tick % 48 + 48) % 48 < 32);
            scroll_mult_advance(now_tick);
            if (g_scroll_split)
                ez2_scroll_tick(&g_scroll[1],
                                ez2_scroll_target(live_pct2, g_chart_mult));
            ez2_scroll_tick(&g_scroll[0], ez2_scroll_target(live_pct,
                                                         g_chart_mult));
        }
        ez2_skin_set_chart_pos(g_skin, (int)now_tick, EZ2_SCROLL_BEAT);
        if (duo && g_skin_p[1])
            ez2_skin_set_chart_pos(g_skin_p[1], (int)now_tick, EZ2_SCROLL_BEAT);
        draw_playfield(lane_count, disp, now_tick, lane_down, &sc, &ini,
                       total_notes, last_judge, last_judge_at,
                       duo ? &sc2 : 0);

        /* The overlay, over the field the player is about to play on - which
         * is where BattleMode's charts draw, the director having drawn its
         * panels first. */
        if (counting) {
            ezPushAnchor(EZ_ANCHOR_CENTER);
            ez2_bga_clip_draw(ready_clip,
                              ready_frame < ready_total ? ready_frame
                                                        : ready_total - 1);
            ezPopAnchor();
        }

        /* The effector panel: the point chart draws every frame (it carries
         * the readouts), the main chart with it; while START is held the
         * charts park at frame 60 (update2's seek), otherwise the frame
         * runs on and the .str's own tail slides the panel away. */
        if (fx.main || fx.point) {
            int mf = fx.frame;

            if (start_held[0] && fx.frame >= 60)
                fx.frame = 60;
            /* CV2'S PANEL LOOPS. The ctor attaches the keys charts with 0 and
             * `icon.str` with 1 (../../src/panels.cpp:919), and icon.str is
             * ten frames: played once it vanished after ten, where the
             * original's panel is on the screen for the whole stage. */
            if (fx.cv2 && fx.main && ez2_bga_clip_period(fx.main) > 0)
                mf = fx.frame % ez2_bga_clip_period(fx.main);
            /* It is the player's own panel, so it travels with the field. */
            ezPushAnchor(g_field_anchor);
            ez2_bga_clip_draw_at(fx.point, fx.frame, fx.px, fx.py);
            ez2_bga_clip_draw_at(fx.main, mf, fx.x, fx.y);
            ezPopAnchor();
            /* IT RUNS ON THE ENTRY CLOCK, NOT THE SONG'S. The panel is the
             * director's own chart, ticked once a frame from construction,
             * so on the original it has popped up and slid away again before
             * the READY count ends: measured on play10k_hits, its 182 frames
             * are the FIRST 182 of the play screen and it never appears on
             * the chart. The port advanced it by the song's ticks, which are
             * zero until the music starts, so the panel sat frozen through
             * READY and then played out over the first 183 frames of the
             * song - on screen for three seconds of the chart the original
             * has it gone for. */
            if (fx.frame < 9999) {
                fx.frame += entry_tick - fx_prev_tick;
                fx_prev_tick = entry_tick;
            }
        }
        /* THE CREDIT PLATE, over the play screen too: the original draws
         * credits_mask + freeplay at (191.5, 439.5) on every play frame
         * (play5k_hits, chart frame 1000), the same plate the select and
         * mode screens carry. The port drew none here. */
        /* AND THE BOTH-BANK MODES PARK IT OFF THE BOTTOM, as EZ2CATCH does.
         * Two different rules, one per director:
         *
         *   the keys director's m420d90 @0x420d90 places it at 735 for mode
         *   indices 4, 5, 8 and 9 - ClubMix, SpaceMix and the two radio
         *   twins, the modes whose field spans both banks and would have the
         *   plate sitting over player two - and 435 for everything else; in
         *   CV2 the same test is against the mix STYLE (3, 4, 5 or 7)
         *   (../../src/showcreditsetup.cpp);
         *
         *   the catch and GF directors read theirs from the mode's own .gds
         *   `[ShowCredit] Coord1` (../../src/maingame.cpp:406 and :597) -
         *   664 for EZ2CATCH and 435 for ScratchMix in the shipped tree.
         *
         * setPos adds five to whichever it is, which is where the 440 the
         * plate defaults to comes from. Measured on the recordings: 740 on
         * ClubMix and SpaceMix, 668 on catch, 440 on the other seven. */
        {
            int cmi = game_mode_index(o->mode_name);
            float cy = 0.0f;                       /* 0 = the plate's 440 */

            if (catch_mode)
                cy = 669.0f;                       /* 664 + 5, from its .gds */
            else if (id.mode == EZ2_MODE_CV2)
                cy = (g_mix_style == 3 || g_mix_style == 4 ||
                      g_mix_style == 5 || g_mix_style == 7) ? 740.0f : 0.0f;
            else if (cmi == 4 || cmi == 5 || cmi == 8 || cmi == 9)
                cy = 740.0f;                       /* 735 + 5 */
            credit_plate_set_y(cy);
        }
        credit_plate_draw(root);
        /* THE OTHER SIDE'S WAIT PLATE, on the play screen: ShowCredit's
         * setup (showcreditsetup.cpp:60) raises b10 for a lone player in
         * modes 1, 2 and 3 - Ruby, Street, 7Street, the 1P layouts - and
         * ShowCredit::update @0x450040 then runs %dPLAYERWAIT.str for the
         * unseated side every frame. Measured: pleasewait at (506.5,445.5)
         * on every Ruby play frame, none in 5K. */
        if (!duo && (id.mode == EZ2_MODE_RUBY || id.mode == EZ2_MODE_STREET ||
                     id.mode == EZ2_MODE_7STREET || id.mode == EZ2_MODE_SCRATCH)) {
            /* ...and the GF director's (maingame.cpp:600): countListC() < 2. */
            static ez2_bga_clip *wait2;
            static int wait2_tried, wait2_frame;

            if (!wait2_tried) {
                char wp[2048];

                wait2_tried = 1;
                if (ez2_vfs_resolve(root, "system\\Common\\2PLAYERWait.str", wp, sizeof wp))
                    wait2 = ez2_bga_clip_open(wp);
            }
            if (wait2 && ez2_bga_clip_frames(wait2) > 0) {
                ez2_bga_clip_draw(wait2, wait2_frame % ez2_bga_clip_period(wait2));
                wait2_frame += dticks;
            }
        }
        if (duo) {
            /* Player 2's book, compact - the shared field draws once and the
             * two sides keep separate score/gauge, as BattleMode's readouts
             * (g_rate1p/g_rate2p) imply on the cabinet. */
            /* THE BATTLE METER - m41c060 @0x41c060 transcribed: the target
             * deflection is the signed square root of the score difference
             * (f14 = 1P, f18 = 2P per the banner @0x41bca0), the step is
             * re-based whenever the target moves, each tick walks one degree
             * back toward it with a two-degree jitter alternating on the
             * phase, clamped to +/-135, and the needle draws additive at
             * (270, 238). */
            /* THE DIAL, UNDER THE NEEDLE. Its third cell is the winner
             * plate - 1p, 2p or 3p for a draw - which the original latches
             * rather than redrawing, so it is stamped only when the answer
             * changes. */
            {
                int w = sc.score > sc2.score ? 0
                      : sc.score < sc2.score ? 1 : 2;

                if (bt_obj && w != bt_shown) {
                    static const char *const kWin[3] = {
                        "system\\BattleMode\\battle_1pwin.bmp",
                        "system\\BattleMode\\battle_2pwin.bmp",
                        "system\\BattleMode\\battle_3pwin.bmp"
                    };

                    ez2_bga_clip_set_texture(bt_obj, 3, 0, kWin[w]);
                    bt_shown = w;
                }
            }
            if (bt_obj && ez2_bga_clip_frames(bt_obj) > 0)
                ez2_bga_clip_draw(bt_obj,
                                  entry_tick % ez2_bga_clip_period(bt_obj));
            if (bt_needle) {
                int   bdiff = (int)(sc2.score - sc.score);
                float br = sqrtf((float)labs((long)bdiff));
                float bv = bdiff < 0 ? 0.0f - br : br, bj, bx;

                if (bv != bm_target) {
                    bm_step   = bv - bm_target;
                    bm_target = bv;
                    bm_base   = bv;
                }
                if (bm_phase) { bj =  2.0f; bm_phase = 0; }
                else          { bj = -2.0f; bm_phase = 1; }
                if (bm_step > 0.0f && bm_phase != 0) {
                    bm_step -= 1.0f;
                    bx = bm_base - bm_step;
                } else if (bm_step < 0.0f && bm_phase == 0) {
                    bm_step += 1.0f;
                    bx = bm_base - bm_step;
                } else
                    bx = bm_base;
                bx += bj;
                if (bx > 135.0f)       bx = 135.0f;
                else if (bx < -135.0f) bx = -135.0f;
                ezSetBlend(2, 2);                    /* ONE / ONE, additive */
                /* (270,238) AND NOT THE 268,236 THE RECORDING SHOWS.
                 * draw_texture_rot's origin is not draw_texture's: it turns
                 * the quad about its centre, so the corner the recorder logs
                 * is not the argument. Measured both ways - 268 put the
                 * needle 2.5 px from the original's, 270 puts it the half
                 * pixel every textured quad differs by. */
                draw_texture_rot(bt_needle, 270.0f, 238.0f, 0.0f, 0.0f,
                                 bx, 0xffffffff);
                ezSetBlend(5, 6);
            }
            /* And the sub-plate over the needle's hub. */
            if (bt_obj2 && ez2_bga_clip_frames(bt_obj2) > 0)
                ez2_bga_clip_draw(bt_obj2,
                                  entry_tick % ez2_bga_clip_period(bt_obj2));
        }

        if (gaugeover_clip && dead_ramp >= 0 &&
            ez2_bga_clip_frames(gaugeover_clip) > 0) {
            int gn = ez2_bga_clip_frames(gaugeover_clip);

            ez2_bga_clip_draw(gaugeover_clip,
                              gaugeover_frame < gn ? gaugeover_frame : gn - 1);
        }
        /* The stage fades IN over 26 ticks: the director's ctor orders
         * `m450420(1, 10)` (src/maingame.cpp:965), a ScrFader stepping +10 a
         * tick from 0 to 0x100 - from the CTOR, so over the first 26 frames
         * of the READY hold, not of the song. (Counting `tick` here, which
         * is zero until the song starts, left the whole READY count behind
         * a black screen - the owner's 2026-09-03 report.) The ending ramps
         * with the end-of-round gate above. */
        if (entry_tick < 26)
            draw_fade(entry_tick * 10 > 255 ? 255 : entry_tick * 10);
        else if (end_ramp > 0)
            draw_fade(end_ramp * 10 >= 255 ? 0 : 255 - end_ramp * 10);

        /* No "SPEED %d%%" flash: the effector panel's own digits are the
         * game's only readout (SCREEN-AUDIT.md 5.11). */
        ezEndFrame();
        /* Capture the LAST frame, not the first: at frame 1 the lead-in has
         * not elapsed and the field is empty, which looks like a broken
         * renderer rather than a working one. */
        if (shot && frame_limit > 0 && frames == frame_limit - 1)
            printf("screenshot: %s\n", ezScreenShot(shot) ? "written" : "FAILED");
        ezPresent();
        frames++;
        if (frame_limit < 0 && !fast)
            ezSleepMs(1);
    }

    ezSetLatePresent(0);

    /* The stage is over: setFlags(0) and the three unroutes, which is what
     * MainGameDirector's teardown does (src/maingame.cpp, four sites). */
    lights_off();

    printf("  ---\n");
    printf("  %d frames, %.1f s of chart on the %s clock\n",
           frames, last_now / 1000.0,
           fast ? "virtual" : (use_wall ? "wall" : "audio"));
    if (dt_n)
        printf("  presses landed %+.1f ms from their notes on average (%ld judged)\n",
               dt_sum / dt_n, dt_n);
    printf("  KOOL %ld  COOL %ld  GOOD %ld  MISS %ld\n",
           sc.counts[EZ2_J_KOOL], sc.counts[EZ2_J_COOL],
           sc.counts[EZ2_J_GOOD], sc.counts[EZ2_J_MISS]);
    {
        /* In duo, player 1's book is judged against player 1's half - the
         * full total would understate both sides. */
        long t1 = duo ? total_notes - total_p2 : total_notes;

        printf("  max combo %ld, score %ld, rate %.2f%%, rank %s, gauge %.1f\n",
               sc.max_combo, sc.score, ez2_score_rate(&sc, t1),
               ez2_score_grade_name(&sc, ez2_score_grade(&sc, t1)),
               sc.gauge);
    }
    if (duo) {
        long t1 = total_notes - total_p2;

        printf("  P1 %ld / P2 %ld  (rates %.2f%% / %.2f%%)  %s\n",
               sc.score, sc2.score,
               ez2_score_rate(&sc, t1), ez2_score_rate(&sc2, total_p2),
               sc.score > sc2.score   ? "P1 WINS"
               : sc2.score > sc.score ? "P2 WINS" : "DRAW");
    }

    /* A machine-checkable verdict. An --auto run that reached the end of the
     * chart must have judged every note KOOL and scored exactly the maximum -
     * the same invariant test_score asserts, but through the whole loop. */
    if (auto_play && sc.counts[EZ2_J_KOOL] == total_notes && total_notes > 0 &&
        sc.score == ez2_score_max_for(ez2_score_model_of(&sc), total_notes))
        printf("AUTOPLAY PERFECT\n");

    /* RESULT -> SAVE. The last step of a session, and the first one the port
     * can take without a result screen: the chart's own top five is a
     * sixty-byte file beside the sounds, and finishing a chart is what writes
     * it. See ez2/ranking.h for the four functions that read the writer's
     * rules off the original.
     *
     * The mode name goes in as ez2_mode_name spells it (`5KeyMix`), which is
     * how BOTH of the binary's own tables spell it - the shipped files say
     * `5keyMix`, so some earlier build did not. Only a chart that has never
     * been finished can notice: ez2_ranking_path resolves an existing file
     * case-insensitively and writes back to whatever spelling it found. */
    rank_key = (o->rank_key && o->rank_key[0]) ? o->rank_key : id.stem;

    if (root && id.mode != EZ2_MODE_UNKNOWN && rank_key[0]) {
        ez2_ranking table;
        int place, k;

        if (save && !o->defer_rank) {
            place = ez2_ranking_submit(root, ez2_mode_name(id.mode), rank_key,
                                       (int)id.tier, player, (int)sc.score,
                                       &table);
        } else {
            /* The table is read, sorted (@0x450690 normalises every table
             * it opens) and the score PLACED against it without writing:
             * m456870 @0x456870's go/no-go for the name entry, and the
             * PLACE plate the result shows. The write waits for the name. */
            ez2_ranking_load(root, ez2_mode_name(id.mode), rank_key,
                             (int)id.tier, &table);
            ez2_ranking_sort(&table);
            /* The PLACE is always decided - the original's result shows
             * the plate and runs the name entry whether or not anything
             * is later written; only the WRITE is the port's --save
             * business (main.c). Measured 2026-09-08: a cleared 5K stage
             * showed 1ST PLACE and ran the ranking on the original and
             * neither on the port. */
            place = ez2_ranking_place(&table, (int)sc.score);
        }
        res->place = place;
        res->table = table;
        res->have_table = 1;
        snprintf(res->rank_key, sizeof res->rank_key, "%.63s", rank_key);
        res->rank_tier = (int)id.tier;
        res->order = o->opts[0].order;
        res->auto_assist = o->opts[0].auto_assist;

        if (save) {
            printf("  ---\n");
            if (place < 0)
                printf("  %ld does not make this chart's top five\n", sc.score);
            else
                printf("  placed %d of 5 as %s\n", place + 1, player);
            for (k = 0; k < EZ2_RANK_SLOTS; k++)
                printf("   %d %-8s %8d%s\n", k + 1, table.slots[k].name,
                       table.slots[k].score, k == place ? "  <-" : "");
        }
    } else if (save) {
        fprintf(stderr, "ez2play: --save needs --root and a chart whose name "
                        "gives a mode and a song\n");
    }

    if (age_n)
        printf("  input: %lu edges, mean %.1f ms behind the frame that "
               "judged them, worst %lu\n",
               age_n, (double)age_sum / (double)age_n, age_max);
    if (!auto_play)
        printf("  keys: %d lanes down at once at most (%ld hold frames with "
               "the key up)\n", held_peak, hold_broken);

    if (bga)
        ez2_bga_close(bga);
    fx_free(&fx);
    /* AND THE PLATE GOES BACK WHERE THE OTHER SCREENS WANT IT. Its y is a
     * module-level setting, and every screen in the original places its OWN
     * ShowCredit (ezscreens.cpp calls setPos(-1, 435) on each) - so a stage
     * that moved it must put it back or the result and the ranking inherit
     * the field's 740 and draw the plate off the bottom. */
    credit_plate_set_y(0.0f);
    if (snd_gaugeover) { ezSoundStop(snd_gaugeover); ezSoundFree(snd_gaugeover); }
    ez2_bga_clip_free(gaugeover_clip);
    if (ready_clip) ez2_bga_clip_free(ready_clip);
    if (ready_a) { ezSoundStop(ready_a); ezSoundFree(ready_a); }
    if (ready_b) { ezSoundStop(ready_b); ezSoundFree(ready_b); }
    if (bt_needle) ezTextureFree(bt_needle);
    ez2_bga_clip_free(bt_obj);
    ez2_bga_clip_free(bt_obj2);
    for (i = 0; i < 3; i++)
        if (bt_win[i]) ezTextureFree(bt_win[i]);
    ez2_chart_free(&chart);
    free(chart_bytes);
    free(ini_text);
    free(ezi_text);

    if (g_skin) { ez2_skin_free(g_skin); g_skin = 0; }
    if (g_skin_p[1]) { ez2_skin_free(g_skin_p[1]); g_skin_p[1] = 0; }
    g_skin_p[0] = 0;

    /* CUT THE BACKING TRACK ON THE WAY OUT. reset_chart_state frees every
     * loaded sample, and ezSoundFree unregisters it from the mixer, so a
     * long auto-lane sample cannot outlive the stage. It was only called on
     * the way IN, so the backing kept playing under the result screen, under
     * the name entry, and on into the next song select - "forever", as
     * reported, because nothing else ever touched those handles.
     *
     * The game does the same thing at the same moment: KEZPlayer::stop
     * @0x40fad0 closes the gate, and drainQueue @0x40fd70 "drop the playing
     * flag and the gate, and stop every live target" when the walk runs off
     * the end of the chart. */
    reset_chart_state();
    res->stage_failed = stage_failed;
    res->sc          = sc;
    res->id          = id;
    res->total_notes = total_notes;
    res->quit        = quit;
    res->played      = 1;
    res->level       = ini.level;
    res->duo         = duo;
    res->sc2         = sc2;
    res->t1          = duo ? total_notes - total_p2 : total_notes;
    res->t2          = total_p2;
    return 0;
}
