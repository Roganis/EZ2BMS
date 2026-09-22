/* EZ2AC judgement, scoring, combo and the groove gauge.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "score.h"

#include <math.h>
#include <string.h>

const char *ez2_judgement_name(ez2_judgement j)
{
    switch (j) {
    case EZ2_J_KOOL: return "KOOL";
    case EZ2_J_COOL: return "COOL";
    case EZ2_J_GOOD: return "GOOD";
    case EZ2_J_FAIL: return "FAIL";
    case EZ2_J_MISS: return "MISS";
    default:         return "-";
    }
}

double ez2_tick_ms(double bpm)
{
    if (!(bpm > 0.0))
        bpm = 120.0;                /* what EzChart::reset @0x4109d0 seeds */
    return 60000.0 / ((double)EZ2_TICKS_PER_BEAT * bpm);
}

ez2_judgement ez2_judge(double dt_ticks, const ez2_song_ini *ini)
{
    double adt = dt_ticks < 0.0 ? -dt_ticks : dt_ticks;

    /* Nested windows, tightest first. Both sides are ticks: the original's dt
     * is a difference of two integer tick counts (@0x426500), so a fractional
     * dt here is the port's own extra precision - it timestamps the real key
     * edge where the original has only the tick the frame happened to process
     * the press in.
     *
     * The boundary is inclusive; the original scans a six-entry table per lane
     * and nothing seen so far distinguishes <= from <, so this is a choice,
     * not a finding. With integer ticks on both sides it would never show. */
    if (adt <= (double)ini->kool_ticks) return EZ2_J_KOOL;
    if (adt <= (double)ini->cool_ticks) return EZ2_J_COOL;
    if (adt <= (double)ini->good_ticks) return EZ2_J_GOOD;
    /* FAIL, not MISS - game grade 2, the +0x1cc counter. See score.h. */
    if (adt <= (double)ini->miss_ticks) return EZ2_J_FAIL;
    return EZ2_J_NONE;
}

ez2_judgement ez2_judge_ms(double dt_ms, double bpm, const ez2_song_ini *ini)
{
    return ez2_judge(dt_ms / ez2_tick_ms(bpm), ini);
}

void ez2_score_init(ez2_score *s, float gauge_start, float gauge_max)
{
    memset(s, 0, sizeof *s);
    s->gauge_max = gauge_max > 0.0f ? gauge_max : EZ2_GAUGE_MAX;
    s->gauge     = gauge_start;
    if (s->gauge > s->gauge_max)
        s->gauge = s->gauge_max;
    s->hold_threshold = 4;
}

/* THE PER-NOTE SCORE, TRANSCRIBED RATHER THAN PARAPHRASED.
 *
 * src/scorerank.cpp - matched at 0x472b40 - accumulates the theoretical
 * maximum one note at a time as
 *
 *     total += 250 - (int)((log10(i + 1.0f) * 0.2f) * -250.0f);
 *
 * The expression below is that one, unchanged, because the details are not
 * cosmetic:
 *
 *   - the cast is a C TRUNCATION toward zero, not a round. The prior RE
 *     describes the formula as round(50*log10(combo) + 250); the two diverge
 *     from the third note onward - log10(3)*50 = 23.856, so truncation gives
 *     273 and rounding gives 274 - and they keep diverging. A full-combo play
 *     scored with round() would exceed the maximum rank() divides by.
 *   - 0.2f is a FLOAT literal promoted to double (0.20000000298...), not 0.2.
 *     Writing 0.2 would drift in the last places, which is enough to move a
 *     note that lands exactly on an integer.
 *
 * The score accrued during play uses the same value with `combo` in place of
 * `i + 1`, so a full-combo play sums to exactly ez2_score_max - which is the
 * invariant the tests check. */
long ez2_catch_note_value(long combo)
{
    if (combo < 1)
        return 0;
    return 250 - (long)(int)((log10((double)combo) * 0.2f) * -250.0f);
}

/* ---- CV2MIX ------------------------------------------------------------- *
 *
 * The sink @0x42e620 reads its multiplier out of a 1,500-entry float table
 * @0x4a9160. That table is game data and is not reproduced here; it is
 * COMPUTED, and the identity was checked against the real one entry by entry:
 * `(float)(1.0 + log10(c)/3.0)` for c >= 2, 1.0 below, agrees with all 1,500
 * to within one ulp of float32 (worst 5.96e-7, at c = 835).
 *
 * The clamp is the original's: `if (combo >= 1500) combo = 1499` (@0x42e7a1,
 * `cmp eax,0x5dc`). */
float ez2_cv2_multiplier(long combo)
{
    if (combo >= 1500)
        combo = 1499;
    if (combo < 2)
        return 1.0f;
    return (float)(1.0 + log10((double)combo) / 3.0);
}

/* The alternate value table, and the multiply is done in FLOAT and TRUNCATED -
 * `cvtsi2ss` / `mulss` / `cvttss2si` @0x42e7ad. Doing it in double, or
 * rounding, diverges. */
long ez2_cv2_note_value(ez2_judgement j, long combo)
{
    float base;

    switch (j) {
    case EZ2_J_KOOL: base = 170.0f; break;
    case EZ2_J_COOL: base = 100.0f; break;
    case EZ2_J_GOOD: base =  40.0f; break;
    default:         return 0;
    }
    return (long)(int)(base * ez2_cv2_multiplier(combo));
}

/* A full-combo CV2 run. Only KOOL and COOL advance the combo, and the first
 * hit after a break assigns `count - 1`, so a perfect play's combo runs
 * 0, 1, 2, ... and the note scored at combo c is the (c+1)th. */
long ez2_cv2_score_max(long notes)
{
    long total = 0;
    long i;

    for (i = 0; i < notes; i++)
        total += ez2_cv2_note_value(EZ2_J_KOOL, i);
    return total;
}

int ez2_score_game_over(const ez2_score *a, const ez2_score *b)
{
    if (!a)
        return 0;
    if (!b)
        return a->failed;          /* @0x42ea05: alone, your zero ends it */
    return a->failed && b->failed; /* @0x42e83e: together, only both do */
}

void ez2_score_set_model(ez2_score *s, ez2_score_model m)
{
    if (s)
        s->model = (int)m;
}

ez2_score_model ez2_score_model_of(const ez2_score *s)
{
    return s ? (ez2_score_model)s->model : EZ2_SCORE_KEYS;
}

long ez2_score_max_for(ez2_score_model m, long notes)
{
    if (m == EZ2_SCORE_CATCH)
        return ez2_catch_score_max(notes);
    if (m == EZ2_SCORE_CV2)
        return ez2_cv2_score_max(notes);
    /* KEYS_ALT falls through ON PURPOSE. The rank @0x42e190 divides by an
     * unconditional `notes * 300` whatever the value table was, so under the
     * hard option the achievable maximum (notes * 170) and the grading
     * denominator DIFFER - a flawless play reads 56.67% and grades 1. This
     * function returns the denominator, because that is what rate and grade
     * mean; do not "fix" it to notes * 170. */
    return ez2_score_max(notes);
}

long ez2_catch_score_max(long notes)
{
    long total = 0;
    long i;

    for (i = 0; i < notes; i++)
        total += ez2_catch_note_value(i + 1);
    return total;
}

/* THE KEYS MODES: flat, by tier. PlayerSlot::commit @0x42e620 builds this
 * table on its stack and adds table[grade] to the score - with no combo
 * multiplier at all in normal mode, which is the branch at 0x42e793. */
long ez2_score_value(ez2_judgement j)
{
    switch (j) {
    case EZ2_J_KOOL: return 300;
    case EZ2_J_COOL: return 150;
    case EZ2_J_GOOD: return 41;
    default:         return 0;   /* FAIL, MISS and a stray score nothing */
    }
}

/* THE HARD OPTION'S TABLE, and only the table: the sink @0x42e620 builds
 * {40, 100, 170} instead of {41, 150, 300} when mode 6/7 has `g_1b2ea20`
 * set (the gate at 0x42e638), and then takes every other branch exactly as
 * the keys modes do - `g_1b2eb6c` is still zero, so the addition is flat
 * and the combo arms are the keys ones. */
long ez2_score_value_alt(ez2_judgement j)
{
    switch (j) {
    case EZ2_J_KOOL: return 170;
    case EZ2_J_COOL: return 100;
    case EZ2_J_GOOD: return 40;
    default:         return 0;
    }
}

/* `count * 300`, which is what the keys modes' rank @0x42e190 divides by -
 * `shl 4; sub` gives count*15 and the lea chain multiplies it by 20. A full
 * combo is exactly 100.00%, and that is the check that confirmed the model. */
long ez2_score_max(long notes)
{
    return notes * 300;
}

void ez2_score_commit(ez2_score *s, ez2_judgement j, long count, int flag,
                      const ez2_song_ini *ini)
{
    float delta = 0.0f;

    if (j <= EZ2_J_NONE || j > EZ2_J_MISS)
        return;

    /* @0x42e620 builds its note-value table and THEN returns, before touching
     * anything else, when the count is not positive. */
    if (count <= 0)
        return;

    /* ONCE PER CALL, WHATEVER `count` SAYS - and this is the asymmetry that
     * makes `count` worth modelling rather than looping over. A batch commit
     * advances the COMBO by `count` (below) but tallies one grade and scores
     * one grade's worth: @0x42e620 ends `add [this + 0x1c4 + grade*4], 1` and
     * adds `value[grade]` exactly once, with no reference to `count` on either
     * path. `SlotOwner::applyTracks` @0x422bf0 - matched, src/playerslot.cpp -
     * is the proof it happens: it sums a helper over the player's whole track
     * list and calls `m42e620(5, total, 1)` in ONE call. */
    s->counts[j]++;
    s->notes++;

    /* THE TWO NEGATIVE RATES ARE CROSSED RELATIVE TO THEIR .ini NAMES, and
     * this file had them the other way round for months on an argument that
     * turned out to be backwards. The keys modes' judgement sink @0x42e620
     * indexes the director's rate block as `director + 0x308 + grade*4`:
     *
     *     grade 1  +0x30c   the .ini's `Fail`      a note never pressed
     *     grade 2  +0x310   the .ini's `Miss`      a press in the outer band
     *     grade 3  +0x314   the .ini's `Good`
     *     grade 4  +0x318   the .ini's `Cool`
     *     grade 5  +0x31c   `Cool` again (the parser mirrors it @0x4207a0)
     *
     * and the section parser @0x4206e0 fills those four slots in the file's
     * own order - Cool, Good, Miss, Fail - reading them POSITIONALLY, with no
     * key name involved. Grades 3 and 4 landing exactly on `Good` and `Cool`
     * is what pins the alignment; the other two then follow.
     *
     * So the .ini's names are consistent with its own JudgmentDelta section -
     * `Miss` is the OUTERMOST WINDOW there, and `Miss` here is what a press
     * inside it costs - and it is the port's grade NAMES that are crossed.
     * Which also makes the game sane: not touching a note costs more (-4.2 on
     * the reference chart) than mistiming one (-1.8). The old comment argued
     * the opposite from Catch's commit @0x472fc0, which is a different
     * director with a different layout. */
    switch (j) {
    case EZ2_J_KOOL: delta = ini->gauge_kool; break;   /* == cool, mirrored */
    case EZ2_J_COOL: delta = ini->gauge_cool; break;
    case EZ2_J_GOOD: delta = ini->gauge_good; break;
    case EZ2_J_FAIL: delta = ini->gauge_miss; break;   /* grade 2 <- `Miss`  */
    case EZ2_J_MISS: delta = ini->gauge_fail; break;   /* grade 1 <- `Fail`  */
    default: break;
    }

    if (j == EZ2_J_KOOL || j == EZ2_J_COOL || j == EZ2_J_GOOD) {
        /* CV2MIX DOES NOT COUNT A GOOD TOWARD THE COMBO. @0x42e6a7 sends only
         * grades 5 and 4 to the increment arm; grade 3 falls through to a
         * block that changes nothing unless the director's fd18 is set. The
         * other eleven keys modes send 5, 4 AND 3 (@0x42e747). */
        int builds = (s->model != EZ2_SCORE_CV2) || j != EZ2_J_GOOD;

        /* `flag` GATES THE COMBO AND NOTHING ELSE. Every combo effect in
         * @0x42e620 - both increment arms, the CV2 latch and the reset - sits
         * under `if (flag != 0)`, while the score, the gauge and the per-grade
         * counter are all outside it. So a zero-flag event still scores and
         * still moves the gauge; it just does not touch the combo. The keys
         * commit @0x42fd90 is what uses it - its two sites 0x43026c/0x4304d8
         * are the only ones that pass a variable flag (zero on the release
         * path); every other site passes a constant 1. */
        if (builds && flag) {
            if (s->model == EZ2_SCORE_CV2 && !s->cv2_started) {
                /* @0x42e736: the first hit after a break ASSIGNS count-1. */
                s->cv2_started = 1;
                s->combo = count - 1;
            } else {
                s->combo += count;
            }
            if (s->combo > s->max_combo)
                s->max_combo = s->combo;
        }
        /* By TIER for the keys modes, by COMBO for the other two. The value
         * must be taken AFTER the increment for catch, or a full-combo play
         * misses ez2_catch_score_max by one note's worth.
         *
         * CV2 reads the same post-update combo; its off-by-one lives in the
         * counter itself (the latch above), not in the lookup. The oracle's
         * sink arm is what separated the two - compensating here matched the
         * score and left the DISPLAYED combo one too high. */
        if (s->model == EZ2_SCORE_CATCH)
            s->score += ez2_catch_note_value(s->combo);
        else if (s->model == EZ2_SCORE_CV2)
            s->score += ez2_cv2_note_value(j, s->combo);
        else if (s->model == EZ2_SCORE_KEYS_ALT)
            s->score += ez2_score_value_alt(j);
        else
            s->score += ez2_score_value(j);
    } else if (flag) {
        /* GRADE 2 BREAKS THE COMBO TOO, and this file used to say it did not.
         * The keys modes' sink @0x42e747 groups grades 5, 4 and 3 into the
         * combo-INCREMENT arm and grades 2 and 1 into the RESET arm - both
         * reach @0x42e6fa, which zeroes +0x1dc and +0x1c0, and only grade 1
         * additionally bumps the global miss tally at 0x1b2e704. The earlier
         * reading came from Catch's commit @0x472fc0, whose arm really does
         * reset for grade 1 only; the keys modes are not Catch.
         *
         * Under `flag` for the same reason the increment arms are: @0x42e6fa
         * is reached only from inside the two `if (flag != 0)` tests. */
        s->combo = 0;
        s->cv2_started = 0;         /* @0x42e6df/@0x42e702 clear f1c0 too */
    }

    /* The difficulty scale the original multiplies each delta by
     * (difficulty_scale[GameLevel][judgment], @0x49e3c8) is ALL 1.0 for every
     * level the table actually has - it is 4 levels x 6 grades, and the two
     * "rows" past that are other data - so the multiply is present in the
     * binary and neutral in effect. Not modelled; if another build ever ships
     * a non-trivial table it belongs here. */

    /* AND A DEAD GAUGE STAYS DEAD. @0x42e7e6 tests `gauge > 0` BEFORE adding
     * anything, so once it reaches zero no later note lifts it - the sink
     * simply stops touching it. Clamping to zero here rather than letting it
     * go negative as the original does is the same behaviour by construction,
     * since the guard can never pass again either way, and it keeps the number
     * displayable. The top clamp is 100.0 (@0x48dbfc), which is also the value
     * the ScoreKeeper's reset seeds it with. */
    if (s->gauge > 0.0f) {
        s->gauge += delta;
        if (s->gauge > s->gauge_max)
            s->gauge = s->gauge_max;
        if (s->gauge <= 0.0f) {
            s->gauge = 0.0f;
            s->failed = 1;
        }
    }
}

void ez2_score_apply(ez2_score *s, ez2_judgement j, const ez2_song_ini *ini)
{
    ez2_score_commit(s, j, 1, 1, ini);
}

double ez2_score_rate(const ez2_score *s, long notes)
{
    /* Against the SAME model the score accrued under, or a catch play reads
     * as a percentage of a maximum it was never scoring towards. */
    long max = ez2_score_max_for(ez2_score_model_of(s), notes);
    if (max <= 0)
        return 0.0;
    return (double)s->score / (double)max * 100.0;
}

/* The ladders are the matched rank()'s, in its own order. */
int ez2_score_rank(double rate_pct)
{
    if (rate_pct >= 100.0) return 10;
    if (rate_pct >=  98.0) return 9;
    if (rate_pct >=  95.0) return 8;
    if (rate_pct >=  93.0) return 7;
    if (rate_pct >=  90.0) return 6;
    if (rate_pct >=  85.0) return 5;
    if (rate_pct >=  80.0) return 4;
    if (rate_pct >=  70.0) return 3;
    if (rate_pct >=  60.0) return 2;
    if (rate_pct >=  50.0) return 1;
    return 0;
}

int ez2_score_rank_hits(const ez2_score *s, long notes)
{
    double pct;

    if (notes <= 0)
        return 0;
    /* rank() reads `r->f18 + r->f14`, and commit @0x472d10 folds m_1d8 into
     * f18 and m_1d4 into f14, so those two are the top two tiers - the counter
     * block at +0x1c8..+0x1d8 runs MISS, FAIL, GOOD, COOL, KOOL, worst-first.
     * That ordering used to be derived from agreement; it is now READ: the
     * score commit @0x472fc0 ends with `add [this + 0x1c4 + grade*4], 1`, so
     * the grade is the index and worst-first is the construction. */
    pct = (double)(s->counts[EZ2_J_KOOL] + s->counts[EZ2_J_COOL]) /
          (double)notes * 100.0;

    if (pct >= 95.0) return 6;
    if (pct >= 90.0) return 5;
    if (pct >= 80.0) return 4;
    if (pct >= 70.0) return 3;
    if (pct >= 60.0) return 2;
    if (pct >= 50.0) return 1;
    return 0;
}

/* THE LADDER IS THE MODEL'S, and CV2Mix's is a different one with a different
 * INPUT. The keys rank @0x42e190 computes both quantities up front - the score
 * percentage in xmm0 and (KOOL+COOL)/notes in xmm1 - and then branches on
 * g_1b2eb6c (@0x42e1ef) to decide which one to walk a ladder with. Normal
 * takes the score over eleven steps; CV2 takes the hit rate over seven.
 *
 * A caller that wants "the grade for this play" must therefore not call
 * ez2_score_rank(ez2_score_rate(...)) directly - that is right for two of the
 * three models and wrong for CV2 in both the input and the number of steps. */
int ez2_score_grade(const ez2_score *s, long notes)
{
    if (!s)
        return 0;
    if (ez2_score_model_of(s) == EZ2_SCORE_CV2)
        return ez2_score_rank_hits(s, notes);
    /* KEYS_ALT takes this branch too: @0x42e1ef selects the ladder on
     * `g_1b2eb6c` alone, which the hard option does not touch. */
    return ez2_score_rank(ez2_score_rate(s, notes));
}

/* And the NAME depends on the ladder too: CV2's seven steps are not the top
 * seven of the eleven, they are their own set. Without a sprite table read for
 * it the port shows the step number rather than inventing a letter. */
const char *ez2_score_grade_name(const ez2_score *s, int grade)
{
    static const char *const cv2[7] = { "F", "E", "D", "C", "B", "A", "S" };

    if (s && ez2_score_model_of(s) == EZ2_SCORE_CV2)
        return (grade >= 0 && grade < 7) ? cv2[grade] : "?";
    return ez2_rank_name(grade);
}

const char *ez2_rank_name(int rank)
{
    /* The sprite tables @0x4ae1f8 / @0x4ae240 index 0..10 in this order. */
    static const char *const names[11] = {
        "F", "E", "D", "C", "B", "A", "S", "S1", "S2", "S3", "S4"
    };
    if (rank < 0 || rank > 10)
        return "?";
    return names[rank];
}

/* ---- EZ2CATCH's hold table -------------------------------------------- */

int ez2_catch_hold_divisor(int kind)
{
    /* @0x473660 selects by kind: /2, /6, >>3, >>4, /0x18 for 1..5, and a
     * default of >>2 for everything else. Catch only - the keys ladder is
     * ez2_hold_step below. */
    switch (kind) {
    case 1:  return 2;
    case 2:  return 6;
    case 3:  return 8;
    case 4:  return 16;
    case 5:  return 24;
    default: return 4;
    }
}

long ez2_catch_hold_ticks(unsigned int hold_ticks, unsigned int ticks_per_measure,
                          int kind)
{
    unsigned int per_beat = (ticks_per_measure ? ticks_per_measure : 192) / 4;
    int div = ez2_catch_hold_divisor(kind);
    unsigned int grid = per_beat / (unsigned int)div;

    if (grid == 0)
        return 0;
    return (long)(hold_ticks / grid);
}

/* ---- the keys hold state machine. See score.h. -------------------------- */

#define HOLD_LANES ((int)(sizeof ((ez2_score *)0)->holds / \
                          sizeof ((ez2_score *)0)->holds[0]))

/* Grades in the game's numbering, which is what the state machine compares
 * against (t178 >= 3 is "GOOD or better", 5 is KOOL). */
static int game_grade(ez2_judgement j)
{
    switch (j) {
    case EZ2_J_KOOL: return 5;
    case EZ2_J_COOL: return 4;
    case EZ2_J_GOOD: return 3;
    case EZ2_J_FAIL: return 2;
    case EZ2_J_MISS: return 1;
    default:         return 0;
    }
}

static ez2_judgement port_grade(int g);

ez2_judgement ez2_score_judgement_of(int g)
{
    return port_grade(g);
}

static ez2_judgement port_grade(int g)
{
    switch (g) {
    case 5:  return EZ2_J_KOOL;
    case 4:  return EZ2_J_COOL;
    case 3:  return EZ2_J_GOOD;
    case 2:  return EZ2_J_FAIL;
    case 1:  return EZ2_J_MISS;
    default: return EZ2_J_NONE;
    }
}

unsigned ez2_hold_step(int kind, unsigned ticks_per_measure, unsigned raw_len)
{
    /* @0x42fbf0: `buf[2]` of Obj422DD0's slot-8 query is the BEAT (48 in a
     * 192-per-measure chart - pinned by the trace, see score.h), and the
     * ladder divides it. Kinds 4 and 5 fall through to the note's own length;
     * 7..12 latch the kind and do nothing else. */
    unsigned beat = (ticks_per_measure ? ticks_per_measure : 192) / 4;

    if (kind >= 7 && kind <= 12)
        return 0;
    switch (kind) {
    case 1:  return beat / 2;
    case 2:  return beat / 8;
    case 3:  return beat / 16;
    case 4:
    case 5:  return raw_len;
    default: return beat / 4;          /* 0, 6, 13+ */
    }
}

long ez2_hold_instalments(int kind, unsigned ticks_per_measure,
                          unsigned raw_len, int flags)
{
    unsigned step = ez2_hold_step(kind, ticks_per_measure, raw_len);
    long n;

    if (step == 0)
        return 0;
    n = (long)(raw_len / step);
    /* @0x42fbf0: mix style 7 takes the plain quotient; otherwise the -1
     * applies unless the note is kind 6 - and with the option negative the
     * count is only ever WRITTEN for kind 6 (the others keep whatever the
     * lane held before, which after a reset is 0 and clamps to 1). */
    if (flags & EZ2_HOLD_MIXSTYLE7)
        ;
    else if (!(flags & EZ2_HOLD_OPTION_NEG))
        n -= (kind != 6);
    else if (kind != 6)
        n = 0;
    if (n <= 0)
        n = 1;
    return n;
}

long ez2_note_counted(int kind, unsigned ticks_per_measure, unsigned raw_len,
                      int flags)
{
    unsigned beat = (ticks_per_measure ? ticks_per_measure : 192) / 4;
    long n = 0;
    unsigned step;
    long q;

    /* @0x42f33d: kinds 9..12 do not count a head at all. */
    if (!(kind >= 9 && kind <= 12))
        n = 1;
    /* @0x42f348: kinds 7..12 add no instalments. */
    if (kind >= 7 && kind <= 12)
        return n;
    /* @0x42f354..0x42f376 -> 0x42f443: mix style 7, a negative option, or
     * kind 6: one instalment for a kind-6 hold, nothing otherwise. */
    if ((flags & (EZ2_HOLD_MIXSTYLE7 | EZ2_HOLD_OPTION_NEG)) || kind == 6)
        return n + (raw_len > 6 && kind == 6 ? 1 : 0);
    if (raw_len <= 6)
        return n;
    /* @0x42f388..: the counter's own ladder - in the game's SONG ticks
     * (four to the chart tick), because beat/32 is 6 of those and 1.5 of
     * ours, and the integer division has to happen where the game does it. */
    beat *= 4;
    switch (kind) {
    case 1:  step = beat / 2;  break;
    case 2:  step = beat / 8;  break;
    case 3:  step = beat / 16; break;
    case 4:  step = beat / 32; break;
    default: step = beat / 4;  break;    /* 0, 5, 13+ */
    }
    if (step == 0)
        return n;
    q = (long)((raw_len * 4) / step) - 1;
    if (q <= 0)
        q = 1;
    return n + q;
}

void ez2_score_hold_press(ez2_score *s, int lane, ez2_judgement j,
                          unsigned raw_len, unsigned start_tick, int kind,
                          unsigned ticks_per_measure, const ez2_song_ini *ini)
{
    int g;

    if (s == 0 || j <= EZ2_J_NONE || j > EZ2_J_MISS)
        return;

    /* THE HEAD IS PAID EITHER WAY. @0x42fd90 clears `pay` only on the
     * above-threshold branch (0x42fe73) and sets it back once the sound is
     * booked (0x42ff4d, gated on the option being non-negative); the
     * below-threshold branch at 0x42ff5a never clears it. So under the
     * default option a hold's head commits like a tap - what differs is only
     * whether the release is later judged, which this port does not do.
     *
     * AND A MISSED HEAD IS A HEAD. The Judge's expiry scan @0x426ab0 sends a
     * note nobody pressed through the same commit as `(sound, 1, 1)` -
     * grade 1, flag 1, the PRESS path - so a hold whose head was never hit
     * starts its hold at MISS: the tick then pays every instalment as MISS
     * while the key is up, and holding the key late lets the pump restore
     * the lane to GOOD. */
    ez2_score_commit(s, j, 1, 1, ini);

    if (lane < 0 || lane >= HOLD_LANES)
        return;
    if (kind >= 7 && kind <= 12) {
        s->holds[lane].kind = kind;        /* latched, and that is all */
        return;
    }
    if (ez2_hold_step(kind, ticks_per_measure, raw_len) == 0)
        return;

    g = game_grade(j);
    if (!(s->hold_flags & EZ2_HOLD_OPTION_NEG) && kind != 6) {
        /* The option arm: COOL is promoted to KOOL before the hold starts. */
        if (g == 4)
            g = 5;
    } else {
        /* The third arm (kind 6, or the option negative - the @0x1b2efa4
         * arm between them is not modelled): only a KOOL head starts a
         * hold at all, COOL counting as one. */
        if (g == 4)
            g = 5;
        if (g != 5)
            return;
    }

    s->holds[lane].active = 1;
    s->holds[lane].held   = 1;
    s->holds[lane].kind   = kind;
    s->holds[lane].grade  = g;
    s->holds[lane].owed   = ez2_hold_instalments(kind, ticks_per_measure,
                                                 raw_len, s->hold_flags);
    s->holds[lane].due    = start_tick;
    s->holds[lane].step   = ez2_hold_step(kind, ticks_per_measure, raw_len);
}

void ez2_score_hold_set_held(ez2_score *s, int lane, int held)
{
    if (s == 0 || lane < 0 || lane >= HOLD_LANES)
        return;
    s->holds[lane].held = held != 0;
}

/* One sink call for one instalment, at a game grade. */
static void pay(ez2_score *s, int g, const ez2_song_ini *ini)
{
    ez2_score_commit(s, port_grade(g), 1, 1, ini);
    s->last_hold_grade = port_grade(g);
    s->hold_paid++;
}

/* @0x42f880 - the pump, one lane, one frame. */
static void hold_pump(ez2_score *s, int lane, unsigned now,
                      const ez2_song_ini *ini)
{
    unsigned due;
    int kind = s->holds[lane].kind;

    if (s->holds[lane].grade < 3) {
        /* Restored to GOOD, and nothing else this call - not even the due
         * time moves. */
        if (!(s->hold_flags & EZ2_HOLD_OPTION_NEG))
            s->holds[lane].grade = 3;
        return;
    }
    due = s->holds[lane].due + s->holds[lane].step;
    if (now <= due)
        return;
    s->holds[lane].due = due;
    if (kind == 6) {
        /* Nothing until the last instalment, and then only if still KOOL. */
        if (s->holds[lane].owed == 1 && s->holds[lane].grade == 5)
            pay(s, 5, ini);
    } else {
        pay(s, s->holds[lane].grade, ini);
        /* grade > 3 also bumps PlayerSlot+0xc here; no consumer traced. */
    }
    s->holds[lane].owed -= 1;
}

/* @0x42f4e0 - the tick, one lane, one frame. */
static void hold_tick(ez2_score *s, int lane, unsigned now,
                      const ez2_song_ini *ini)
{
    unsigned due = s->holds[lane].due + s->holds[lane].step;
    int kind = s->holds[lane].kind;

    if (now <= due)
        return;
    s->holds[lane].due = due;

    if (kind == 6) {
        long owed = s->holds[lane].owed;
        int g;

        if (owed >= 1 && owed <= 2) {
            if (s->holds[lane].grade == 5) {
                /* Graded by how far past the due time the tick landed:
                 * `late < beat >> 6` in the game's song ticks, which are
                 * four to the chart tick (the .ez's 48 a beat is rescaled
                 * to 192 at load) - so both sides are scaled up here rather
                 * than let the window round to zero. */
                unsigned late = (now - due) * 4;
                unsigned window = (s->holds[lane].step * 4 * 4) >> 6;
                if (owed == 1)
                    g = late < window ? 3 : 4;
                else
                    g = late < window ? 2 : 3;
            } else {
                g = 3;
            }
        } else {
            g = 2;
        }
        s->holds[lane].grade = g;
        pay(s, g, ini);
        s->holds[lane].owed = 0;           /* `ta0 = 1` then the decrement */
        return;
    }

    /* GOOD or better is knocked down to FAIL, and it stays there until the
     * pump restores it. */
    if (s->holds[lane].grade >= 3)
        s->holds[lane].grade = 2;
    pay(s, s->holds[lane].grade, ini);
    s->holds[lane].owed -= 1;
}

void ez2_score_hold_advance(ez2_score *s, unsigned now_tick,
                            const ez2_song_ini *ini)
{
    int lane;

    if (s == 0)
        return;

    for (lane = 0; lane < HOLD_LANES; lane++) {
        if (!s->holds[lane].active)
            continue;
        /* Both functions open the same way: nothing owed ends the sustain. */
        if (s->holds[lane].owed <= 0) {
            s->holds[lane].active = 0;
            s->holds[lane].owed = 0;
            continue;
        }
        if (s->holds[lane].kind >= 7 && s->holds[lane].kind <= 12)
            continue;
        if (s->holds[lane].held)
            hold_pump(s, lane, now_tick, ini);
        else
            hold_tick(s, lane, now_tick, ini);
        if (s->holds[lane].owed <= 0) {
            s->holds[lane].active = 0;
            s->holds[lane].owed = 0;
        }
    }
}

long ez2_score_hold_pending(const ez2_score *s)
{
    long n = 0;
    int lane;

    if (s == 0)
        return 0;
    for (lane = 0; lane < HOLD_LANES; lane++)
        if (s->holds[lane].active)
            n += s->holds[lane].owed;
    return n;
}
