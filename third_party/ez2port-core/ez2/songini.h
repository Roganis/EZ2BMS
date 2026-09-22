/* EZ2AC per-chart `.ini` - the judgement and gauge constants.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * THE JUDGEMENT WINDOWS ARE DATA, NOT CODE. Every chart ships its own, in a
 * sibling `.ini` encrypted with the same table as `EZ2AC.ini`:
 *
 *     [General]            Level, MeasureScale
 *     [JudgmentDelta]      Kool, Cool, Good, Miss   - CHART TICKS, 1/192 beat
 *     [GaugeUpDownRate]    Cool, Good, Miss, Fail   - gauge units
 *
 * That is the single most important fact about porting the scoring: a clone
 * that hardcodes one global set of windows is not playing the same game, and
 * the values differ per chart. 12,520 of these ship.
 *
 * AND THE UNIT IS THE TICK, NOT THE MILLISECOND (../../docs/judge-timing.md).
 * The judge's clock is `KEZPlayer.f7258`, which counts chart ticks - and the
 * tick it counts is 1/192 beat, not the `.ez` file's 1/48: the director's
 * chart-load @0x423c18 reads the file's rate, multiplies it by 4, rescales
 * every record time to it and logs `m_nTPB = 192`. So a window is
 * BEAT-RELATIVE and the same number is a different number of milliseconds on
 * every chart - see ez2_tick_ms() in score.h. EZ2REWRITE's bible reads these
 * values as milliseconds; that is the one thing in it to distrust here.
 *
 * Defaults, for a MISSING file, come from the keys loader @0x423790's
 * missing-file branch (prior RE, read from Final EX): windows 72/36/24/6 in
 * Miss/Good/Cool/Kool order and Level 99; gauge COOL +0.2 (@0x487bf0),
 * GOOD +0.1 (@0x487be8), MISS -1.8 (@0x48f96c), FAIL -4.8 (@0x48f968).
 *
 * A subtlety recorded by the same RE: the original does NOT pre-initialise
 * these fields, so a file that exists but omits a section would read
 * uninitialised memory. Every shipped `.ini` has both sections, so that path
 * never fires on real data - and this parser defines it as "use the defaults",
 * which is what the reference implementations settled on.
 */
#ifndef EZ2_SONGINI_H
#define EZ2_SONGINI_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct ez2_song_ini {
    int   level;              /* [General] Level; 99 when the file is missing */
    /* [General] MeasureScale. READ POSITIONALLY - which is why the key string
     * appears nowhere in the binary (the old note here reasoned from that
     * absence to "unused", and was wrong). The [General] reader
     * `EZ2DJMainGameDirector::m420640` @0x420640 (../../src/gaugerates.cpp,
     * 100%) reads an int then a float from the section: Level, MeasureScale.
     * It then mostly throws the value away - see
     * ez2_song_ini_apply_measure_scale(). */
    float measure_scale;

    /* [JudgmentDelta], in CHART TICKS of 1/192 beat. `miss` is the OUTER
     * bound: a press further out than this consumes no note at all.
     *
     * These are the file's raw numbers. The game does not judge with them
     * directly - see ez2_song_ini_apply_judge_widening(). */
    int   kool_ticks;
    int   cool_ticks;
    int   good_ticks;
    int   miss_ticks;

    /* [GaugeUpDownRate]. KOOL has no entry of its own - the original's section
     * parser @0x4206e0 mirrors COOL into the KOOL slot at +0x31c. */
    float gauge_kool;
    float gauge_cool;
    float gauge_good;
    float gauge_miss;
    float gauge_fail;

    int   had_general;        /* which sections were actually present */
    int   had_judgment;
    int   had_gauge;
} ez2_song_ini;

/* Fill `out` with the documented defaults. Always call this first; the parser
 * does it for you. */
void ez2_song_ini_defaults(ez2_song_ini *out);

/* Parse decrypted `.ini` text. Returns 0 on success. Missing keys keep their
 * default, so a partial file is never worse than no file. */
int  ez2_song_ini_parse(const char *text, size_t n, ez2_song_ini *out);

/* Per-mode gauge adjustments the three directors' [GaugeUpDownRate] readers
 * make between reading the file and letting anything see the values. All three
 * are byte-matched in ../../src/gaugerates.cpp (PORT-DELTAS finding 15):
 *
 *   - the two 14-key modes, SpaceMix (5) and 14RadioMix (9), get COOL +0.05
 *     and GOOD +0.02, and the KOOL mirror is taken AFTER the bonus
 *     (EZ2DJMainGameDirector::m4206e0 @0x4206e0);
 *   - EZ2CATCH (10) ZEROES the GOOD delta outright - a GOOD earns no gauge
 *     whatever the file says (CatchMainGameDirector::m46c2b0 @0x46c2b0).
 *
 * Applied separately because it depends on the mode, not the file. */
void ez2_song_ini_apply_mode_bonus(ez2_song_ini *ini, int mode);

/* The course-gauge option doubles the MISS and FAIL drains. The flag is
 * `g_1b2e89c`: SongSelectDirector::toggleOption @0x434f70 flips it on option
 * button 0 ONLY in the four radio/course modes (6..9), TitleDirector's ctor
 * clears it, and all three [GaugeUpDownRate] readers apply the doubling from
 * copies saved before the mode bonus (../../src/gaugerates.cpp). Default off;
 * outside modes 6..9 the game offers no way to set it. */
void ez2_song_ini_apply_hard_gauge(ez2_song_ini *ini);

/* MeasureScale mostly does not survive the file (@0x420640, PORT-DELTAS
 * finding 16): the FIELD is forced to 1.6 unless the mode is 6, 7, 8, 9 or
 * 12, and the PUBLISHED value (the global at 0x1b2eae0) is the file's scale
 * only in the four course modes 6..9 - mode 12 keeps its own field value but
 * still publishes 1.6. Mutates ini->measure_scale to the surviving field
 * value and returns the published one. Call once, alongside the other
 * modifiers. */
float ez2_song_ini_apply_measure_scale(ez2_song_ini *ini, int mode);

/* THE GAME NEVER JUDGES WITH THE FILE'S NUMBERS. The call site @0x430793 adds
 * +3 ticks to all four before handing them to Judge::setWindows @0x426ea0 - or
 * +1 when the alternate-mode flag at 0x1b2eb6c is set. Defaults 6/24/36/72
 * therefore judge as 9/27/39/75.
 *
 * Call this ONCE, at chart setup, alongside the mode bonus and hard gauge; it
 * is not idempotent, for the same reason those are not.
 *
 * (The original keeps TWO six-entry tables per lane, one for early presses and
 * one for late, so asymmetric windows are expressible. The shipped call sets
 * both from the same four numbers, which is why one set is modelled here.) */
void ez2_song_ini_apply_judge_widening(ez2_song_ini *ini, int alternate_mode);

enum ez2_song_ini_err {
    EZ2_SONG_INI_OK     =  0,
    EZ2_SONG_INI_ERR_ARG = -1
};

#ifdef __cplusplus
}
#endif

#endif /* EZ2_SONGINI_H */
