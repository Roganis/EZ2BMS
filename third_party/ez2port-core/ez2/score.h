/* EZ2AC judgement, scoring, combo and the groove gauge.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ALL OF THIS IS IN THE "MUST BE EXACT" COLUMN (../../docs/PORTING.md 4d). A
 * port may draw a note anywhere and mix it any way it likes, but a replay of
 * the same chart with the same inputs has to produce the same tally, the same
 * combo curve, the same gauge and the same grade.
 *
 * Sources, in order of authority:
 *   ../../src/scorerank.cpp   ScoreKeeper::rank @0x472b40 - MATCHED. The grade
 *                             ladders AND the per-note score formula.
 *   ../../wip/scorekeeper.cpp ScoreKeeper::commit @0x472d10 - decoded. Which
 *                             counter is which.
 *   ../../docs/judge-timing.md  what a "press time" is, and what unit the
 *                             windows are in. Read it before touching
 *                             ez2_judge().
 *   the per-chart .ini        the judgement windows and gauge rates - DATA,
 *                             not code. See songini.h.
 *   ../../../EZ2REWRITE/bible/behavior/judgment-scoring.md - the prior RE,
 *                             which usefully separates what was read from the
 *                             binary from what its own fork merely chose.
 *                             Only the former is followed here.
 */
#ifndef EZ2_SCORE_H
#define EZ2_SCORE_H

#include "songini.h"

#ifdef __cplusplus
extern "C" {
#endif

/* THE PORT NUMBERS THESE BEST-FIRST; THE GAME NUMBERS THEM WORST-FIRST.
 *
 * Read from the score commit @0x472fc0, which ends with
 *
 *     add dword [this + 0x1c4 + grade*4], 1
 *
 * so the game's grade IS the index of its counter, and the block at
 * +0x1c8..+0x1d8 runs grade 1..5. `wip/scorekeeper.cpp` had already derived
 * that the top two tiers live at +0x1d8 and +0x1d4; this is the same ordering
 * read directly instead. The two numberings are exact reverses:
 *
 *     game grade   5 KOOL   4 COOL   3 GOOD   2 FAIL   1 MISS
 *     ez2_judgement 1        2        3        4        5
 *     -> game = 6 - ez2_judgement, and the judge itself never emits 1.
 */
typedef enum ez2_judgement {
    EZ2_J_NONE = 0,   /* the press was outside every window: a stray */
    EZ2_J_KOOL = 1,   /* game grade 5 */
    EZ2_J_COOL = 2,   /* game grade 4 */
    EZ2_J_GOOD = 3,   /* game grade 3 */
    EZ2_J_FAIL = 4,   /* game grade 2 - the mash band, and it IS reachable */
    EZ2_J_MISS = 5    /* game grade 1 - only ever a note that was not pressed */
} ez2_judgement;

/* The game's own numbering, for anything that has to speak to the original's
 * tables (the per-grade counters, and the gauge rates the director indexes at
 * +0x314 + grade*4). */
#define EZ2_GAME_GRADE(j) (6 - (int)(j))

const char *ez2_judgement_name(ez2_judgement j);

/* ---- the clock ---------------------------------------------------------- *
 *
 * THE JUDGE COUNTS TICKS, NOT MILLISECONDS, AND THE TICK IS 1/192 BEAT.
 * `KEZPlayer.f7258` is the judge's clock: it starts at 1 in play() @0x40fa00
 * and the pump thread advances it by one per step @0x40fd70, a step being
 * `60000 / ((i88/4) * bpm)` ms with i88 = 192. The `.ez` file's own grid is
 * 1/48 beat; the director's chart-load @0x423c18 rescales every record by 4 to
 * this one and logs `m_nTPB = 192`. See ../../docs/judge-timing.md.
 *
 * The consequence for a port is not cosmetic: judgement windows are
 * BEAT-RELATIVE. The same `.ini` numbers are a third as wide in milliseconds
 * at 200 BPM as they are at 66, so a port that judges in milliseconds is
 * playing a different game on every chart but one.
 *
 * 192 is a constant here because it is one in the data: swept over the whole
 * shipped library, 12,359 of 12,359 parseable charts carry 192 ticks per
 * measure (= 48 per beat, x4 at load) and no other value. If a chart ever
 * turned up with a different rate this would have to become
 * `chart.ticks_per_measure`, and so would ez2play's tick_ms(). */
#define EZ2_TICKS_PER_BEAT 192

/* Milliseconds per judge tick at `bpm` - 312.5/bpm. 2.60 ms at 120 BPM, 1.56
 * at 200. Use it to convert a press delta into the judge's unit; with a tempo
 * map, use the BPM in effect AT THE NOTE. */
double ez2_tick_ms(double bpm);

/* The original's fixed input-latency compensation: the press timestamp is
 * `max(clock - 5, 1)` (KEZPlayer vtable slot 22 @0x40f450), taken when the
 * frame PROCESSES the press rather than when the key went down.
 *
 * The port does not apply it, and that is a decision rather than an omission.
 * The 5 ticks are there to cancel the mean of the original's 0..1 frame
 * sampling delay (~8 ms; the compensation is ~10 ms at 150 BPM), and the port
 * has no such delay - it timestamps the real edge (PORTING.md 15). Applying
 * both the true edge time and the compensation would bias every press early by
 * the full 10 ms; applying neither reproduces the original's NET timing to
 * within a couple of milliseconds. This constant exists so that a port that
 * ever goes back to frame-sampled input has the number written down. */
#define EZ2_PRESS_COMP_TICKS 5

/* ---- judging ------------------------------------------------------------ */

/* Grade a press against a note.
 *
 * `dt_ticks` is press-time minus note-time IN JUDGE TICKS (see above); only its
 * magnitude matters. The windows are NESTED, and the outermost - `miss_ticks` -
 * is the point at which the press stops belonging to the note at all:
 *
 *     |dt| <= kool  -> KOOL      |dt| <= good  -> GOOD
 *     |dt| <= cool  -> COOL      |dt| <= miss  -> FAIL   (consumes the note)
 *     otherwise     -> NONE      (a stray; the note stays unjudged)
 *
 * THE BAND BETWEEN GOOD AND MISS IS **FAIL**, NOT MISS - corrected 2026-08-09.
 * The judge core @0x426500 emits game grade 2 there, and grade 2 is the +0x1cc
 * counter; game grade 1 (the +0x1c8 counter) is emitted only for a note that
 * was never pressed. That part stands.
 *
 * WHAT THAT ENTRY THEN SAID ABOUT THE CONSEQUENCES WAS WRONG IN BOTH HALVES,
 * corrected 2026-08-10 against the KEYS MODES' sink @0x42e620. It had been
 * read off `ScoreKeeper::commit` @0x472fc0, which is **EZ2CATCH's** - a
 * different director with a different layout, the same trap this file's own
 * closing note in the roadmap warns about. For the twelve keys modes:
 *
 *   - a press in that band drains the .ini's `Miss` rate (-1.8 by default),
 *     NOT its `Fail` rate (-4.2/-4.8). The sink indexes
 *     `director + 0x308 + grade*4` and the section parser @0x4206e0 fills
 *     those slots in file order (Cool, Good, Miss, Fail), so grade 1 - the
 *     unpressed note - is the one that takes `Fail`. It is the SOFTER
 *     outcome, and the .ini's names line up with its own JudgmentDelta
 *     section once you read them that way: `Miss` is the outermost WINDOW
 *     there and the cost of a press inside it here.
 *   - and it DOES break the combo. @0x42e747 puts grades 5, 4 and 3 in the
 *     increment arm and grades 2 and 1 in the reset arm; only grade 1 also
 *     bumps the global tally at 0x1b2e704.
 *
 * So mashing costs both, and costs less gauge than ignoring the note - which
 * is what the binary does and the opposite of what this header claimed.
 *
 * `ini` must already have been through ez2_song_ini_apply_judge_widening() -
 * the game judges with the file's numbers plus 3, never with the raw ones.
 */
ez2_judgement ez2_judge(double dt_ticks, const ez2_song_ini *ini);

/* The same thing for a caller holding a millisecond delta and the BPM in
 * effect at the note. Convenience only - it is ez2_judge(dt_ms /
 * ez2_tick_ms(bpm), ini), and a caller with a tempo map should keep the tick
 * size it already computed rather than re-deriving it per press. */
ez2_judgement ez2_judge_ms(double dt_ms, double bpm, const ez2_song_ini *ini);

/* A note that was never pressed. Separate from ez2_judge so a caller cannot
 * accidentally get a MISS out of a stray press.
 *
 * VERIFIED against the reconstructed expiry scan, 2026-08-29 - Judge::tick
 * @0x426ab0 is now real code (../../src/judge.cpp), and it agrees with this
 * model on every load-bearing point: a note expires once `now >= start +
 * miss_window + 1`, so the last pressable tick is dt == miss (the same
 * boundary as ez2_judge's `|dt| <= miss`); the expired note goes through the
 * PRESS commit at game grade 1 (so a missed hold head starts its hold at
 * MISS); an autoplay lane (kind 1, from g_1b5f2e0) grades 5 at the note's
 * start instead; and the flag-0 hold-tail commit at `start + width - 1` is
 * emitted and then dropped by the commit - inert, deliberately not modelled.
 *
 * One option is NOT modelled: with `g_1b2ef1c > 0` the game expires against
 * the KOOL window instead of the miss window (`windows[1][5] + 1` against
 * `windows[1][2] + 1`), so an unhit note misses almost immediately. Default
 * off, writer untraced; recorded so its discovery is not mistaken for a
 * timing bug here. */
#define EZ2_JUDGE_UNHIT EZ2_J_MISS

typedef struct ez2_score {
    long  counts[6];      /* indexed by ez2_judgement */
    long  notes;          /* notes resolved so far */
    /* ONE combo counter. This file used to keep two - a scoring combo and a
     * display combo that a hold's ticks advanced - on the argument that a
     * perfect play could only rate exactly 100% if hold ticks stayed out of
     * the score. The live trace settled it the other way (2026-08-16,
     * oracle-30912708.trace: 242 heads + 309 hold instalments, every one a
     * `commit(grade, 1, 1)` through the sink @0x42e620): a hold's
     * instalments ARE scored notes - combo, score, gauge and the per-grade
     * counters all move - and the game's own note total (+0xe105bc, 551 in
     * that stage) counts them. So the earlier 101.02% came from counting the
     * ticks in the combo and not in the total, not from the ticks. */
    long  combo;
    long  max_combo;
    long  score;
    float gauge;
    float gauge_max;
    int   failed;         /* the gauge reached zero at least once */
    int   model;          /* an ez2_score_model; KEYS unless set */
    /* CV2's combo LATCH - `f1c0` @0x42e72e. The first scoring hit after a
     * break ASSIGNS `count - 1` where every later one adds, so CV2's combo
     * runs one behind: 0 on the first note, 1 on the second. Modelled rather
     * than compensated for in the score, because the counter is also what the
     * display and max_combo read - which is how the oracle's sink arm found
     * it, with the score already agreeing to the point. */
    int   cv2_started;

    /* The keys hold state machine - see ez2_score_hold_press. Sized for the
     * widest layout in the game (AndromedaMix, 18 lanes) with room over. Kept
     * in CHART TICKS, like the game keeps it in song ticks. */
    struct {
        int      active;   /* PlayerSlot t58: the sustain is running */
        int      held;     /* the key is down - decides pump vs tick */
        int      kind;     /* the note record's kind byte, latched */
        int      grade;    /* t178: the ez2_judgement each instalment pays */
        long     owed;     /* ta0: instalments still to pay */
        unsigned due;      /* te8: the next instalment falls due after this */
        unsigned step;     /* the division, in chart ticks */
    } holds[24];
    /* The two rules the game reads out of globals - EZ2_HOLD_* bits, all
     * off by default, which is what ModeSelectDirector's ctor @0x44b8f0
     * seeds (`g_1b5f300[player] = 7`, `g_mixStyle != 7`). */
    int   hold_flags;
    /* Panel+0x38 - the grade a hold's head must reach before the commit
     * @0x42fd90 books the sound in `snd[lane]` (which is what suppresses a
     * release judgement). 4 unless the panel's .gds says 3 (@0x428450 /
     * @0x428760: `f38 = f1588 != 0 ? 3 : 4`). Recorded for the release
     * path; the hold itself starts either way. */
    int   hold_threshold;
    /* The grade the most recent hold instalment paid, and how many have
     * been paid in total - for a HUD that flashes the judgement per
     * instalment the way the pump's effect draw (@0x42d370, trailing 1)
     * does. EZ2_J_NONE until one pays. */
    ez2_judgement last_hold_grade;
    long  hold_paid;
} ez2_score;

/* The cabinet's ceiling is 100.0 (@0x48dbfc) and play starts full. */
#define EZ2_GAUGE_MAX 100.0f

void ez2_score_init(ez2_score *s, float gauge_start, float gauge_max);

/* THE SINK'S OWN SHAPE - `PlayerSlot::commit` @0x42e620, matched at 100%.
 *
 * `ez2_score_apply` below is this with both extra parameters pinned at 1, which
 * is what this file offered until 2026-08-10. Pinning them hid two behaviours
 * the original really has, and a player notices both:
 *
 *   `count`  advances the COMBO by count while tallying ONE grade and scoring
 *            ONE grade's worth. Not a loop - the counter bump and the score add
 *            never mention `count`. `SlotOwner::applyTracks` @0x422bf0 (matched,
 *            src/playerslot.cpp) sums a helper over the player's whole track
 *            list and commits `m42e620(5, total, 1)` in a single call, so this
 *            is real gameplay rather than a reachable-in-principle path.
 *
 *   `flag`   gates the combo AND NOTHING ELSE. Zero still scores and still
 *            moves the gauge - it simply does not touch the combo. Only the
 *            keys commit @0x42fd90 passes it variable (its two sites
 *            0x43026c/0x4304d8, zero on the release path); every other site
 *            passes 1. (Site attribution corrected 2026-08-10; 0x42f66e is
 *            in the hold tick @0x42f4e0, not the hold pump, and passes
 *            a constant 1.)
 *
 * Prefer this in anything replaying the original's own event stream; prefer
 * `ez2_score_apply` for an ordinary judged note. */
void ez2_score_commit(ez2_score *s, ez2_judgement j, long count, int flag,
                      const ez2_song_ini *ini);

/* The game's grade numbering (5 KOOL .. 1 MISS) as an ez2_judgement. The
 * hold state's `grade` field is a GAME grade, because that is what the pump
 * hands the sink; anything that DISPLAYS it has to come through here first.
 * Getting that wrong shows KOOL as MISS, since EZ2_J_MISS is 5. */
ez2_judgement ez2_score_judgement_of(int game_grade);

/* Apply one resolved judgement: tally, combo, score and gauge. */
void ez2_score_apply(ez2_score *s, ez2_judgement j, const ez2_song_ini *ini);

/* ---- what a note is worth ------------------------------------------------
 *
 * THE KEYS MODES SCORE BY TIER, NOT BY COMBO, AND THE MAXIMUM IS FLAT.
 * Corrected 2026-08-09; see the end of ../../docs/judge-timing.md.
 *
 * `PlayerSlot::commit` @0x42e620 builds a six-entry table on its stack and
 * adds `table[grade]` to the score at +0x1e4. In normal mode - the global at
 * 0x1b2eb6c being zero, which is the branch at 0x42e793 - it adds it FLAT,
 * with no combo multiplier at all:
 *
 *     KOOL 300   COOL 150   GOOD 41   FAIL 0   MISS 0
 *
 * and the keys modes' rank @0x42e190 divides the score by `count * 300`
 * (`shl 4; sub` for count*15, then *5 *2 *2). A full combo is therefore
 * exactly 100.00%, which is what confirms the reading.
 *
 * THE ALTERNATE MODE IS CV2MIX, and it is now modelled - see EZ2_SCORE_CV2.
 * `g_1b2eb6c` is set to 1 by `runCv2Mix` @0x417a3f and by nothing else, so
 * every branch in the sink that tests it is CV2 against the other twelve. Its
 * table is {GOOD 40, COOL 100, KOOL 170} and it IS multiplied by the combo.
 *
 * The alternate table is also used by 5RadioMix and RadioMix (modes 6 and 7)
 * whenever `g_1b2ea20` is set (@0x42e638) - two modes that otherwise score
 * normally. That gate IS read now: it is a player-toggleable HARD option on
 * the mode-select screen - the two-position selector at director +0x95f4,
 * confirmed @0x44d802, which sets `g_1b2ea20` and `g_1b2e89c` together (the
 * latter makes the section parser DOUBLE every gauge rate, @0x4207af). The
 * scoring side is EZ2_SCORE_KEYS_ALT below; the gauge doubling is a
 * parse-time transform on the .ini rates and belongs to whoever loads them. */
long ez2_score_value(ez2_judgement j);

/* The same table under the hard option: {GOOD 40, COOL 100, KOOL 170},
 * still added FLAT - the multiplier branch @0x42e793 tests `g_1b2eb6c`
 * (CV2), not this. */
long ez2_score_value_alt(ez2_judgement j);

/* The theoretical maximum over `notes` notes: `notes * 300`, flat. */
long ez2_score_max(long notes);

/* ---- and EZ2CATCH's, which is a different model entirely -----------------
 *
 * `ScoreKeeper::rank` @0x472b40 - matched, ../../src/scorerank.cpp - belongs
 * to EZ2CATCH: the only thing that calls it is `ScoreKeeper::commit`
 * @0x472d10, whose one caller is `CatchMainGameDirector::m46c7e0`. It scores
 * by COMBO and its maximum is a logarithmic sum:
 *
 *     250 - (int)((log10(combo) * 0.2f) * -250.0f)
 *
 * i.e. 250 + 50*log10(combo) TRUNCATED, not rounded - the prior RE's
 * `round()` diverges as early as the third note, 273 against 274.
 *
 * Kept because ez2catch is one of the thirteen modes `ez2/mode.c` maps, and
 * because port/oracle checks these two against the original's own compiled
 * code. The GRADE LADDERS below are shared by both models - the keys modes'
 * rank @0x42e190 uses the identical thresholds - so only the value and the
 * maximum are mode-specific. */
long ez2_catch_note_value(long combo);
long ez2_catch_score_max(long notes);

/* WHICH OF THE TWO MODELS A CHART SCORES BY. They are not variants of one
 * formula: the keys modes add a flat per-tier value (PlayerSlot::commit
 * @0x42e620) while EZ2CATCH adds a logarithmic per-note value that grows with
 * the combo (ScoreKeeper::rank @0x472b40). Picking the wrong one does not
 * scale the score, it computes a different number.
 *
 * This existed as two unconnected pairs of functions until EZ2CATCH became
 * playable, at which point catch charts were silently scored as keys. */
typedef enum ez2_score_model {
    EZ2_SCORE_KEYS = 0,     /* eleven of the thirteen modes */
    EZ2_SCORE_CATCH,        /* EZ2CATCH only */
    EZ2_SCORE_CV2,          /* CV2Mix only - see below */
    EZ2_SCORE_KEYS_ALT      /* 5RadioMix/RadioMix under the hard option */
} ez2_score_model;

/* ---- KEYS_ALT, the fourth state -----------------------------------------
 *
 * Modes 6 and 7 with `g_1b2ea20` set - the mode-select hard option. The sink
 * @0x42e620 gives them the ALTERNATE value table (its gate at 0x42e638:
 * `g_1b2eb6c == 0 && (mode == 6 || mode == 7)` reads `g_1b2ea20`), and
 * NOTHING ELSE changes: `g_1b2eb6c` is still zero, so the combo rules stay
 * the keys ones (GOOD advances it, grades 2 and 1 break it), the value is
 * added flat with no multiplier, and the rank @0x42e190 still walks the
 * eleven-step score ladder against an unconditional `notes * 300`.
 *
 * The consequence is real and byte-verified end to end: a FLAWLESS play
 * scores notes*170 against notes*300 = 56.67%, which on that ladder is
 * grade 1. If that looks like a bug in the game, it may be one; what it is
 * not is a gap in the reading (PORT-ROADMAP.md Block 1). */

/* ---- CV2MIX, the third model --------------------------------------------
 *
 * Read out of the sink @0x42e620 and the keys rank @0x42e190, both of which
 * branch on `g_1b2eb6c`. CV2Mix differs from the other keys modes in four
 * places at once, which is why it is a model and not a constant:
 *
 *   value        {GOOD 40, COOL 100, KOOL 170}, not {41, 150, 300}
 *   multiplier   the value is scaled by the COMBO and TRUNCATED:
 *                  score += (int)((float)value * mult[min(combo, 1499)])
 *                where mult[c] = 1 + log10(c)/3 and mult[0] = mult[1] = 1.
 *                The original reads that from a 1,500-entry table @0x4a9160;
 *                the port COMPUTES it, because the table is the game's data
 *                and reproducing it to one ulp is both possible and required.
 *   combo        only KOOL and COOL advance it - a GOOD scores and does not -
 *                and the first hit after a break ASSIGNS `count - 1` where
 *                every later one adds (the `f1c0` latch @0x42e72e), so the
 *                combo reads one behind: 0 on the first note, 1 on the second.
 *   grade        NOT the score percentage. @0x42e1ef selects the (KOOL+COOL)
 *                over notes ladder, which has seven steps instead of eleven -
 *                ez2_score_rank_hits, which already existed for Catch's arm
 *                and which nothing selected until now.
 *
 * One CV2 rule is read but not modelled: a GOOD BREAKS the combo when the
 * director's `fd18` is set (@0x42e6c9). Nothing in the port sets that flag and
 * what sets it in the game has not been read, so the port takes the branch
 * that does nothing - which is what happens with the flag clear. */

/* mult[c] for the CV2 model - `1 + log10(c)/3`, in float, clamped at c=1499. */
float ez2_cv2_multiplier(long combo);
/* (int)((float)value * mult[combo]), which is the truncation the original's
 * `cvttss2si` performs. */
long  ez2_cv2_note_value(ez2_judgement j, long combo);
/* A full-combo CV2 score: the same accumulation, run over `notes` notes. */
long  ez2_cv2_score_max(long notes);

/* THE GAME-OVER RULE, and it depends on the player COUNT. Read off the
 * sink's two clamp helpers: with one player (@0x42ea05) a zero gauge raises
 * game over on its own; with two (@0x42e83e) each player is clamped
 * independently on EVERY commit by EITHER player, the down flags are sticky,
 * and game over is raised only when BOTH are down - a run where one player
 * dies plays on to the end of the stage. Pass NULL for `b` in a one-player
 * session. `failed` is already sticky (a dead gauge stays dead), which is
 * what makes this a pure function of the two states. */
int ez2_score_game_over(const ez2_score *a, const ez2_score *b);

/* Defaults to EZ2_SCORE_KEYS at init. Set it before the first judgement. */
void ez2_score_set_model(ez2_score *s, ez2_score_model m);
ez2_score_model ez2_score_model_of(const ez2_score *s);

/* The theoretical maximum under whichever model. */
long ez2_score_max_for(ez2_score_model m, long notes);

/* The result-screen rate, as a percentage: score / max * 100. */
double ez2_score_rate(const ez2_score *s, long notes);

/* The 0..10 grade from the score percentage (F E D C B A S S1 S2 S3 S4). */
int ez2_score_rank(double rate_pct);

/* The 0..6 grade from the (KOOL+COOL) percentage, used when the mode flag at
 * 0x1b2eb6c is set - i.e. by CV2Mix. */
int ez2_score_rank_hits(const ez2_score *s, long notes);

/* THE GRADE FOR THIS PLAY, under whichever model - use this rather than
 * ez2_score_rank(ez2_score_rate(...)), which is right for two models of three.
 * The keys rank @0x42e190 computes the score percentage AND the hit rate and
 * then branches (@0x42e1ef) on which ladder to walk; CV2Mix takes the hit rate
 * over seven steps where everything else takes the score over eleven. */
int ez2_score_grade(const ez2_score *s, long notes);

/* Its display name. CV2's seven steps are their own set, not the top seven of
 * the eleven; no sprite table has been read for them, so the letters below F..S
 * are the port's own presentation choice rather than a reading. */
const char *ez2_score_grade_name(const ez2_score *s, int grade);

const char *ez2_rank_name(int rank);

/* ---- THE KEYS HOLD STATE MACHINE ---------------------------------------
 *
 * Four functions the original lays out back to back, all read and
 * reconstructed in ../../src/holdtick.cpp (2026-08-16), and one live trace
 * that pins the arithmetic - see the note on `combo` above:
 *
 *     0x42fbf0  start a hold      latch the kind, set the debt and the due time
 *     0x42f880  the PUMP          runs while the key is HELD
 *     0x42f4e0  the TICK          runs while the key is UP with instalments owed
 *     0x42fd90  the keys commit   the head press (and the release, which pays
 *                                 nothing for a hold whose head was booked)
 *
 * The step: kind 1 = beat/2, kind 2 = beat/8, kind 3 = beat/16, kinds
 * 0/6/13+ = beat/4 (a sixteenth note: 12 chart ticks at 192 to the measure -
 * `Obj422DD0`'s slot-8 query reports the BEAT, 48, which the trace settles:
 * 31 holds of raw length 48/96/144/192 paid 3/7/11/15 instalments), kinds
 * 4/5 = the note's own length (one instalment), kinds 7..12 = nothing at all.
 * The length the game divides is the RECORD's length, biased by 6 like every
 * hold length in the .ez - so `raw_len` here is `ez2_note_hold_ticks() + 6`,
 * or the record's `length` field as read.
 *
 * The count is `raw_len / step - 1`, clamped up to 1 - one FEWER than the
 * plain quotient. Under mix style 7 the plain quotient; kind 6 the plain
 * quotient too. The first instalment falls due one step after the note's
 * START (not after the press), and each one advances the due time by a step;
 * a payment happens the first frame `now > due`.
 *
 * WHAT AN INSTALMENT PAYS is `commit(grade, 1, 1)` - a full scored note:
 *
 *   PUMP (held): the head's grade, with COOL promoted to KOOL at the head
 *   (@0x42fd90 promotes 4 -> 5 before starting the hold when the option at
 *   0x1b5f300 is not negative, which it is by default). A lane whose grade
 *   has fallen BELOW GOOD is not paid - it is RESTORED to GOOD, and that is
 *   all the pump does on that call. Kind 6 pays only its LAST instalment, and
 *   only if the grade is still KOOL.
 *
 *   TICK (released with instalments owed): a grade of GOOD or better is
 *   knocked down to FAIL first, and every remaining instalment then pays
 *   FAIL as it falls due - the .ini's `Miss` rate each, and the combo breaks
 *   on the first. Re-holding lets the pump restore the lane to GOOD.
 *   Kind 6 on the tick is GRADED instead: with one or two instalments left a
 *   KOOL lane pays COOL/GOOD (last) or GOOD/FAIL (last but one) by whether
 *   the tick landed within a sixty-fourth of a beat of the due time, and
 *   any other lane pays GOOD; with more owed it pays one FAIL - and either
 *   way the hold ends there.
 *
 * WHICH ONE RUNS: the input poller @0x41fb20 calls the tick on a lane whose
 * key state did not change since the last frame and the event handler
 * @0x430970 (which reaches the pump for a held state) on one that did. Read
 * literally that would run the tick during a steady hold too; the trace
 * shows 309 pump payments and not one tick payment across 31 holds held to
 * the end, so in practice the pump owns the held frames and the tick the
 * released ones, and that is what this models. The −5-tick press
 * compensation the game's clock carries (EZ2_PRESS_COMP_TICKS) is not
 * applied to the hold clock here.
 *
 * NOT MODELLED, on purpose: the counter at PlayerSlot+0xc that COOL/KOOL
 * instalments bump (no consumer found), the KOOL-override state/option pair
 * @0x1b5f2e0/@0x1b2efa4 (autoplay-flavoured; every instalment KOOL), the
 * chord table @0x37dcdc0 (nothing reads its result), and the release-time
 * average of head and tail grades, which the commit computes and then
 * discards (`pay = 0` on that branch, before the sink).
 *
 * Nor the END-OF-HOLD tail commit: the Judge's expiry scan @0x426ab0 sends
 * `(sound, 5, flag 0)` through the commit when a hold whose head was not
 * booked (GOOD or MISS at the head, under the default threshold 4) reaches
 * `start + width - 1`. The commit forces that grade to 0 unless the player
 * byte at +0xe105b8 is set - which @0x42e17c sets only for mode "RadioMix"
 * WITH the audience panel on - and a grade-0 sink call moves nothing:
 * value[0] = 0, no combo arm, and the director's rate[0] slot is 0.0 in
 * every traced stage. So outside RadioMix-with-audience the tail is a
 * no-op, which is what this port does; inside it, a GOOD- or MISS-headed
 * hold would collect one KOOL's score and gauge without combo at its end.
 * Unmodelled until a trace of that mode exists. */

enum {
    EZ2_HOLD_MIXSTYLE7  = 1,   /* g_mixStyle == 7: count = raw / step, no -1 */
    EZ2_HOLD_OPTION_NEG = 2    /* g_1b5f300[player] < 0: no COOL->KOOL at the
                                  head, no restore-to-GOOD in the pump, and
                                  count = raw / step for kind 6 only */
};

/* The instalment step in chart ticks for a hold of `kind` and record length
 * `raw_len` in a chart of `ticks_per_measure`; 0 for kinds 7..12. */
unsigned ez2_hold_step(int kind, unsigned ticks_per_measure, unsigned raw_len);

/* How many instalments such a hold pays - what the game adds to its note
 * total per hold. `flags` are EZ2_HOLD_* bits. 0 for kinds 7..12. */
long ez2_hold_instalments(int kind, unsigned ticks_per_measure,
                          unsigned raw_len, int flags);

/* WHAT THE GAME COUNTS A NOTE AS, for the total that the maximum and the
 * rate divide by: `PlayerSlot::m42f2d0` @0x42f2d0, summed over the player's
 * tracks by `sumTracks` @0x42f480 into `noteCount` (+0xe105bc, and x300 into
 * +0x3c8 = the maximum). Per type-1 record: the head, unless its kind is
 * 9..12; plus, for a hold (record length > 6) of kind outside 7..12,
 * `raw_len / step - 1` clamped up to 1 with the COUNTER's own ladder - which
 * is NOT quite the machine's: kind 4 is beat/32 here (the machine pays one
 * instalment), kind 5 the quarter (the machine pays one), and under mix
 * style 7 or a negative option only a kind-6 hold adds anything (exactly
 * 1). Kind 6 adds 1 either way. So the total and the payout can disagree by
 * design on kinds 4/5/6; the traced stage (kind 0 throughout) agrees to the
 * note. Returns the head + instalments this record contributes. */
long ez2_note_counted(int kind, unsigned ticks_per_measure, unsigned raw_len,
                      int flags);

/* The head of a hold note, judged `j` - by a press, or MISS when it aged out
 * unpressed (the game's expiry scan @0x426ab0 sends that through the same
 * commit, and the hold then starts at MISS; see score.c). Pays the head
 * through the sink like any note, then starts the hold: `raw_len` is the
 * record's biased length, `start_tick` the note's own time in chart ticks,
 * `kind` the record's kind byte. The lane counts as HELD from here until
 * ez2_score_hold_set_held says otherwise - so a caller starting a MISSED
 * hold should follow with _set_held(lane, 0) unless the key really is down. */
void ez2_score_hold_press(ez2_score *s, int lane, ez2_judgement j,
                          unsigned raw_len, unsigned start_tick, int kind,
                          unsigned ticks_per_measure, const ez2_song_ini *ini);

/* The key state, once per frame per lane - the poller's job. */
void ez2_score_hold_set_held(ez2_score *s, int lane, int held);

/* Once per frame, with the song position in chart ticks: the pump on every
 * held lane, the tick on every released one. */
void ez2_score_hold_advance(ez2_score *s, unsigned now_tick,
                            const ez2_song_ini *ini);

/* How many instalments are registered but not yet paid, across all lanes.
 * Diagnostics and tests. */
long ez2_score_hold_pending(const ez2_score *s);

/* ---- EZ2CATCH's hold table - a DIFFERENT function ------------------------
 *
 * @0x473660 is the CATCH hold tick, and its ladder is {2, 6, 8, 16, 24} for
 * kinds 1..5 with 4 for everything else - genuinely /6 and /24 by magic
 * multiply. It is not the keys ladder above, and how catch pays its ticks
 * out (through its own commit @0x472fc0) is not modelled here; these two are
 * kept only so a catch caller can COUNT them. */
int  ez2_catch_hold_divisor(int kind);
long ez2_catch_hold_ticks(unsigned int hold_ticks, unsigned int ticks_per_measure,
                          int kind);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_SCORE_H */
