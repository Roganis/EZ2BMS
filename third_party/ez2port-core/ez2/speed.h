/* The speed modifier - how fast the notes scroll.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * THERE ARE TWO MODELS, not one with two ranges, and which applies depends on
 * the mode.
 *
 * CORRECTED 2026-08-30 - THIS FILE HAD THE TWO SWAPPED. It used to say "the
 * twelve normal modes: an INDEX" and "CV2Mix: a PERCENT". It is the other way
 * round, and the gate is the CV2 flag `g_1b2eb6c` @0x1b2eb6c.
 * `EZ2DJMainGameDirector::m422f20` @0x422f20 (../../src/ez2djkeys.cpp:60) is
 * the effector's key sink:
 *
 *     if (key == 9) {                        // speed up
 *         if (g_1b2eb6c == 0) {              // NOT CV2
 *             g_speedPercent += 25; if (>= 999) = 999; return;
 *         }
 *         g_1b2e914 += 1;                    // CV2: the index
 *         if (g_mixStyle != 7) clamp 20; else clamp 3;   // StreetMix1st
 *     }
 *
 * `g_1b2eb6c == 1` is CV2Mix, proved on the other side of the tree by
 * ../../src/songselectctor.cpp, which takes `system\CV2Mix\SongName\%s.bmp`
 * on that flag and `system\songname\%s.bmp` otherwise. The scratch and catch
 * copies (../../src/gfkeys.cpp, ../../src/catchkeys.cpp) split the same way,
 * and so do the three panels that actually move the notes - see below.
 *
 * ---- the twelve normal modes: a PERCENT -----------------------------------
 *
 * `g_speedPercent` @0x1b2e890 runs **50..999 in steps of 25** (@0x422f4d and
 * @0x422fe3), so 0.50x to 9.99x. Its step DOWN from the ceiling is 24 rather
 * than 25, which is what keeps the sequence on multiples of 25 after a clamp.
 * The effector prints it as three digits (../../src/effectorupdate.cpp:89).
 *
 * ---- CV2Mix: an INDEX -----------------------------------------------------
 *
 * `g_1b2e914` @0x1b2e914 runs 0..20 and indexes a table of 21 floats at
 * **0x48e6c8**: 0.25 to 5.25 in steps of 0.25, matching the twenty-one
 * `Effector_Speed_%02d` textures the effector loads. Stepping is clamped to
 * 20 (@0x422f8a) and to **3** when the CV2 sub-mode is StreetMix1st
 * (`g_mixStyle == 7`, @0x422f96) - that layout offers only four speeds.
 *
 * ---- where the number actually goes --------------------------------------
 *
 * Each panel's update2 picks the same way and eases the result:
 *
 *     Panel::update2       @0x429dd0   ../../src/gamepanels.cpp:6204
 *     GFPanel::update2     @0x462af0   ../../src/gamepanels.cpp:6079
 *     CatchPanel::update2  @0x471590   ../../src/gamepanels.cpp:5962
 *
 *         if (g_1b2eb6c == 0) target = (g_speedPercent * 0.01f) * g_1b2e708;
 *         else                target = g_panelRateLadder[slot->f4e0] * g_1b2e708;
 *         // then 10% of the remaining gap per tick, then setScrollRate()
 *
 * **CORRECTED 2026-08-31. THE CV2 ARM READS NEITHER THE INDEX NOR THE TABLE
 * THIS FILE DESCRIBES ABOVE.** It used to say `ladder[slot->speedIndex]`,
 * meaning the 0x48e6c8 table indexed by `g_1b2e914`. Both halves are wrong,
 * and the port's CV2 scroll is built on them - see GAMEPLAY-AUDIT.md's
 * finding 27. In short:
 *
 *   - the INDEX is `slot->f4e0`, a PER-PLAYER counter moved only by the
 *     in-game option table (`PlayerSlot::m42ebf0` @0x42ebf0, options 9/10 in
 *     CV2 and 0x13/0x14 elsewhere) and seeded per stage from `opts[13].b`.
 *     The effector's speed keys never touch it: `g_1b2e914` has eleven reads
 *     in the whole of .text and not one is in a panel.
 *   - the LADDER is `g_panelRateLadder` @0x490228, twenty-one floats that go
 *     **1, 1.5, 2, then quarter steps to 6, then 10, then 99** - not the
 *     0.25-to-5.25 run at 0x48e6c8. Different shape, different floor: index 0
 *     is 1.0x on the cabinet where this file's table says 0.25x.
 *
 * `g_1b2e914` drives the EFFECTOR'S OWN readout (`m_speedIndex` at +0x28
 * picks a texture, ../../src/panels.cpp:958) and is carried between screens
 * through `g_1b2f06c`, which has exactly ONE read in .text, at 0x43585a in
 * song select.
 *
 * AND ALL THREE PANELS AGREE. GFPanel::update2 @0x462af0 takes
 * `g_gfSpeedLadder[slot->f2f0]` @0x49a268 and CatchPanel::update2 @0x471590
 * takes `g_catchSpeedLadder[slot->f474]` @0x49df40 - and those two tables are
 * identical to `g_panelRateLadder` to the float. There are only TWO ladders
 * in the game, each stored more than once: the DIAL (0.25..5.25, even quarter
 * steps, at 0x48e6c8 and 0x4901a0) which is display only, and the SCROLL
 * (1, 1.5, 2, quarter steps to 6, then 10, 99, at 0x490228 / 0x49a268 /
 * 0x49df40) which moves the notes. One table, three copies, one per panel
 * class.
 *
 * Nothing here is fixed yet, because fixing it needs the option table
 * (audit finding 6) and swapping the ladder alone would drive the right
 * curve from the wrong variable. Documented so the next reader is not
 * misled the way this header was.
 *
 * PARKED BY THE OWNER'S DECISION, 2026-09-03 (NEEDS-OWNER.md, item C):
 * the in-game option panel is not being built for now, so CV2Mix keeps
 * the effector's own index and ladder - wrong in exactly the way described
 * above, and only in CV2Mix. The per-player option set (ez2/playeropts.h)
 * already carries every option the panel would set, so building the panel
 * later is UI and input work, not a session-model change.
 *
 * `g_1b2e708` is the CHART's own scroll multiplier (see ez2/chart.h, on-disk
 * record type 6), 1.0 unless the chart says otherwise. The eased result
 * multiplies the lane's base rate, which is the .gds MeasureScale - so the
 * final geometry is in ez2/scroll.h, not here. This file is only the dial.
 *
 * ---- the readout ----------------------------------------------------------
 *
 * The effector shows a BPM, not a multiplier, and it has two spellings
 * (../../src/effectorinput.cpp:99):
 *
 *     modes 0,1,2,3,4,5,10,11:  songBpm * percent / 100     (integer)
 *     everything else:          g_1b2eae0 * 0.625 * (percent * songBpm) * 0.01
 *
 * and 1.6 * 0.625 == 1.0, so the two AGREE wherever `g_1b2eae0` is the forced
 * 1.6. They differ only in the course modes 6..9, where it is the file's own
 * MeasureScale (@0x420640). A 150 BPM chart at 250% scrolls as if it were 375.
 *
 * ---- what is NOT established ----------------------------------------------
 *
 * The DEFAULTS. @0x4241b3 (index 5) and @0x448a41 (index 7) are index seeds;
 * `g_speedPercent` is a plain zero-initialised int in ../../src/panels.cpp and
 * whatever seeds it is not in reconstructed code. EZ2_SPEED_PCT_DEFAULT below
 * is the port's choice, not the cabinet's - flagged rather than asserted.
 */
#ifndef EZ2_SPEED_H
#define EZ2_SPEED_H

#ifdef __cplusplus
extern "C" {
#endif

/* CV2Mix's index model. */
#define EZ2_SPEED_STEPS        21    /* the table at 0x48e6c8 */
#define EZ2_SPEED_DEFAULT      5     /* 1.5x, @0x4241b3 */
#define EZ2_SPEED_MAX_1ST      3     /* StreetMix1st stops here, @0x422f96 */

/* The twelve normal modes' percent model. */
#define EZ2_SPEED_PCT_MIN      50    /* @0x422ffb */
#define EZ2_SPEED_PCT_MAX      999   /* @0x422f62 */
#define EZ2_SPEED_PCT_STEP     25
#define EZ2_SPEED_PCT_DEFAULT  250   /* the PORT's choice - see the header */

/* Which model this mode's speed dial uses. 1 = the 0..20 index (CV2Mix
 * only), 0 = the 50..999 percent (everything else). The gate is the CV2
 * flag, and every site that reads a speed tests it. */
int   ez2_speed_uses_index(int mode);

/* The multiplier for an index, or 0 outside 0..20. */
float ez2_speed_multiplier(int index);

/* The same as the percent the scroll formula wants: 0.25x is 25. Exact,
 * because every step is a multiple of 0.25. */
int   ez2_speed_percent(int index);

/* THE ONE PER-SONG RULE. m422f20's step-DOWN arm, inside the CV2 branch:
 *
 *     g_1b2e914 -= 1;
 *     if (_stricmp(g_songInfoName, "11ambit") == 0) { if (< 2) = 2; }
 *     else if (g_1b2e914 < 0) g_1b2e914 = 0;
 *
 * so on **11ambit** the index cannot be taken below 2. One song, one
 * constant, and it is in the INDEX branch - it applies to CV2Mix, which is
 * where 11ambit has six of its charts. It is also the song carrying the most
 * extreme scroll-multiplier events in the library (24 charts have any; eleven
 * of 11ambit's do), which is presumably why: below index 2 they would stop
 * being readable. Returns the floor for a song key, matched ignoring case. */
int   ez2_speed_min_index(const char *song_key);

/* Step an index up or down by `delta`, clamped. `max_index` is
 * EZ2_SPEED_STEPS - 1 normally and EZ2_SPEED_MAX_1ST for StreetMix1st; the
 * floor is ez2_speed_min_index's, 0 for every song but one. */
int   ez2_speed_step(int index, int delta, int max_index);

/* The same with the per-song floor applied. */
int   ez2_speed_step_song(int index, int delta, int max_index,
                          const char *song_key);

/* Step a CV2 percent, clamped to 50..999. The original's step DOWN from the
 * ceiling is 24 rather than 25 (@0x422fe3), which is what keeps the sequence
 * on multiples of 25 after a clamp to 999. */
int   ez2_speed_step_percent(int percent, int delta);

/* The general step out of the effector sink @0x422f20: the dial is +/-1
 * (commands 0x22/0x23), START+keys 4/2 are +/-10 (0x24/0x25), and the
 * effector pair's +/-25 lives above. Any negative step bigger than one
 * takes one less from the 999 ceiling. Clamped to [50, 999]. */
int   ez2_speed_step_by(int percent, int delta);

/* What the effector's readout shows: `songBpm * percent / 100`, truncating,
 * exactly as @0x41e76e does it. This is the PLAIN spelling, right for modes
 * 0,1,2,3,4,5,10,11. */
int   ez2_scroll_bpm(int song_bpm, int percent);

/* The same readout with the MeasureScale spelling the other modes take
 * (Effector6thStyle::update2 @0x41e620,
 * ../../src/effectorinput.cpp:104):
 *
 *     (int)(measure_scale * 0.625 * (percent * songBpm) * 0.01)
 *
 * Pass the published scale - 1.6 outside modes 6..9, the .gds value inside
 * them (ez2_song_ini_apply_measure_scale). At 1.6 this equals the plain
 * form, which is why the split is invisible outside the course modes. */
int   ez2_scroll_bpm_scaled(int song_bpm, int percent, float measure_scale);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_SPEED_H */
