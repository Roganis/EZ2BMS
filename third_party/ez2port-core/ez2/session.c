/* The mode runner as a state machine. See session.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "session.h"

#include <string.h>

/* Where we are inside one round. The original expresses this as straight-line
 * code between calls; a driver that hands control back needs it named. */
enum {
    PH_SELECT = 0,
    PH_GAME,
    PH_RESULT,
    PH_GAME_OVER,
    PH_RANKING,
    PH_INTRO,
    PH_ROUND_END
};

void ez2_session_rules_default(ez2_session_rules *r)
{
    if (!r)
        return;
    memset(r, 0, sizeof *r);
    r->game_over_round = 2;
    r->suppress_ranking = 0;
    r->listed_entries = 0;
    r->rounds = EZ2_SESSION_ROUNDS;
}

void ez2_session_begin(ez2_session *s, const ez2_session_rules *rules)
{
    if (!s)
        return;
    memset(s, 0, sizeof *s);
    if (rules)
        s->rules = *rules;
    else
        ez2_session_rules_default(&s->rules);
    if (s->rules.rounds <= 0)
        s->rules.rounds = EZ2_SESSION_ROUNDS;   /* a caller that filled a
                                                 * rules struct by hand */
    s->round = 0;
    s->first_stage_death = 0;
    s->phase = PH_SELECT;
    s->end = EZ2_END_RUNNING;
}

ez2_session_end ez2_session_result(const ez2_session *s)
{
    return s ? s->end : EZ2_END_RUNNING;
}

int ez2_session_stage(const ez2_session *s)
{
    return s ? s->round + 1 : 0;
}

int ez2_session_rounds(const ez2_session *s)
{
    return s ? s->rules.rounds : 0;
}

/* Advance past any phase that has nothing to do, so `next` only ever returns a
 * step the caller must actually perform. */
static void settle(ez2_session *s)
{
    for (;;) {
        if (s->end != EZ2_END_RUNNING) {
            s->phase = PH_ROUND_END;
            return;
        }

        switch (s->phase) {
        case PH_RESULT:
            /* The result screen runs only when the stage was NOT failed
             * (`if (c == 0)` @0x4177a5). Skipping it is the case where the
             * original then reads its uninitialized local - see session.h. */
            if (s->failed) {
                s->phase = PH_RANKING;
                continue;
            }
            return;

        case PH_RANKING:
            /* `countListA() < 2 && g_1b2ea34 == 0`, then `g_1b2ef70 == 0`. */
            if (s->rules.listed_entries >= 2 || s->first_stage_death ||
                s->rules.suppress_ranking) {
                s->phase = PH_INTRO;
                continue;
            }
            /* The radio runners' `stage + 1 == stages`. */
            if (s->rules.rank_at_end_only &&
                s->round + 1 < s->rules.rounds) {
                s->phase = PH_INTRO;
                continue;
            }
            return;

        case PH_INTRO:
            if (!s->first_stage_death) {
                s->phase = PH_ROUND_END;
                continue;
            }
            return;

        case PH_ROUND_END: {
            /* `round++` then `if (round >= 3) break`. A retry has already
             * decremented, so it does not consume a stage. */
            s->round++;
            if (s->round >= s->rules.rounds) {
                s->end = EZ2_END_STAGES_DONE;
                return;
            }
            s->first_stage_death = 0;    /* songselectctor.cpp:225 */
            s->phase = PH_SELECT;
            continue;
        }

        default:
            return;                       /* SELECT, GAME, GAME_OVER */
        }
    }
}

ez2_session_step ez2_session_next(ez2_session *s)
{
    if (!s)
        return EZ2_STEP_DONE;

    settle(s);
    if (s->end != EZ2_END_RUNNING)
        return EZ2_STEP_DONE;

    switch (s->phase) {
    case PH_SELECT:    return EZ2_STEP_SONG_SELECT;
    case PH_GAME:      return EZ2_STEP_MAIN_GAME;
    case PH_RESULT:    return EZ2_STEP_RESULT;
    case PH_GAME_OVER: return EZ2_STEP_GAME_OVER;
    case PH_RANKING:   return EZ2_STEP_RANKING;
    case PH_INTRO:     return EZ2_STEP_MODE_INTRO;
    default:           return EZ2_STEP_DONE;
    }
}

void ez2_session_report(ez2_session *s, const ez2_session_outcome *o)
{
    ez2_session_outcome zero;

    if (!s || s->end != EZ2_END_RUNNING)
        return;
    if (!o) {
        memset(&zero, 0, sizeof zero);
        o = &zero;
    }

    switch (s->phase) {
    case PH_SELECT:
        if (o->quit) {
            s->end = EZ2_END_QUIT;
            return;
        }
        s->phase = PH_GAME;
        return;

    case PH_GAME:
        /* A PORT ADDITION, not the original's. The cabinet has no window to
         * close, so runMainGame has no "the player left" return; a desktop
         * build does. Ending the session is the only honest reading - it is
         * not a game over, and it is not a cleared stage. */
        if (o->quit) {
            s->end = EZ2_END_QUIT;
            return;
        }
        s->game_code = o->game_code;
        s->failed = o->failed ? 1 : 0;
        if (s->failed && s->round == 0) {
            /* The sink raises g_1b2ea34 on a first-stage death, and the
             * panel latches g_1b2efb4 in the same breath (gamepanels.cpp:
             * 2729 and 2943: `g_elemCount == 0 -> g_1b2efb4 = 1`, outside
             * CV2), which moves the runners' game-over test from
             * `round >= 2` to `round >= 1` for the rest of the credit
             * (@0x417702). Where g_1b2efb4 drops again is not in
             * reconstructed code; the title's ctor clears it. */
            s->first_stage_death = 1;
            s->rules.game_over_round = 1;
        }

        if (s->rules.cv2) {
            /* runCv2Mix: `if (g_1b2ea28 == 1) g_stageLevels[round] = 0;
             * else runResult` - no threshold, straight to the next round. */
            s->phase = s->failed ? PH_ROUND_END : PH_RESULT;
            return;
        }
        /* Game over is tested BEFORE the code is looked at, so a failed stage
         * ends the session whatever the game returned. */
        if (s->failed && s->round >= s->rules.game_over_round) {
            s->phase = PH_GAME_OVER;
            return;
        }
        if (s->game_code == EZ2_GAME_STAGE_END) {
            s->phase = PH_RESULT;
            return;
        }
        if (s->game_code == EZ2_GAME_RETRY) {
            /* `round--` before the shared `round++`: the round is replayed. */
            s->round--;
        }
        s->phase = PH_ROUND_END;
        return;

    case PH_RESULT:
        /* Same port addition as the main game: closing the window is a quit,
         * not the result screen asking for game over. Conflating them made
         * `ez2play` report GAME OVER for someone who simply shut the lid. */
        if (o->quit) {
            s->end = EZ2_END_QUIT;
            return;
        }
        if (o->result_game_over) {
            s->phase = PH_GAME_OVER;
            return;
        }
        s->phase = s->rules.cv2 ? PH_ROUND_END : PH_RANKING;
        return;

    case PH_GAME_OVER:
        s->end = EZ2_END_GAME_OVER;
        return;

    case PH_RANKING:
        s->phase = PH_INTRO;
        return;

    case PH_INTRO:
        s->phase = PH_ROUND_END;
        return;

    default:
        return;
    }
}
