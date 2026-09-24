/* A session — the mode runner, one play from mode entry to the ending.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The port could play a chart long before it could play a SESSION: pick a
 * song, play it, see a result, go round again, and be thrown out when the
 * stages run out or the gauge does. That structure is one function in the
 * original — `EZ2AC::runClubMix` @0x417670, the first of thirteen mode runners
 * and the template for the other twelve — and it is already decoded in
 * ../../wip/runclubmix.cpp. Nothing here was re-derived; read that file.
 *
 * This is a STATE MACHINE, not a loop that calls screens. The original's
 * runner calls `runSongSelect`, `runMainGame` and so on directly, which welds
 * the flow to the screens; a port wants the flow testable with no screens at
 * all. So the caller drives it:
 *
 *     ez2_session s;
 *     ez2_session_begin(&s, &rules);
 *     for (;;) {
 *         ez2_session_step st = ez2_session_next(&s);
 *         if (st == EZ2_STEP_DONE) break;
 *         ... perform the step ...
 *         ez2_session_report(&s, &outcome);
 *     }
 *
 * ---- the flow, read off @0x417670 ----------------------------------------
 *
 *     round = 0
 *     loop:
 *       song select            -> quitting ends the session
 *       main game              -> yields a `code` and a FAILED flag
 *       game over when failed and round >= threshold  -> ends the session
 *       if code == 2 (the stage finished):
 *           result screen, but only when NOT failed
 *           game over if the result screen says so
 *           ranking screen when fewer than two entries are listed and the
 *               continue flag is clear, itself gated on a suppress flag
 *           mode intro when the continue flag is set
 *       else if code == 5:     -> round--, so a retry does NOT consume a stage
 *       round++; stop at round == 3
 *
 * The `threshold` is 1 or 2 depending on `g_1b2efb4` @0x417702 — one setting
 * makes game-over arrive a whole stage earlier. Both are reproduced; which
 * setting it is has not been read, so it is a rule input rather than a name.
 *
 * ---- one original bug, deliberately NOT reproduced ------------------------
 *
 * When `code == 2` and the stage was FAILED but the round threshold was not
 * met, the original reads its `stageResult` local having never written it —
 * the result screen is skipped in exactly that case. wip/runclubmix.cpp notes
 * this ("deliberately read before it is ever written"), and it is faithful to
 * the original's `push ecx`. A port cannot reproduce indeterminate behaviour
 * usefully, so this treats an unrun result screen as "did not ask for game
 * over", which is the branch the original takes whenever the garbage happens
 * not to be 1.
 */
#ifndef EZ2_SESSION_H
#define EZ2_SESSION_H

#ifdef __cplusplus
extern "C" {
#endif

/* `round >= 3` @0x417824 - what runClubMix hardcodes, and the DEFAULT here.
 *
 * IT IS NOT A CONSTANT ACROSS MODES, AND THE ORIGINAL HARDCODES IT PER RUNNER.
 * Four runners - at 0x416db0, 0x417010, 0x417280 and 0x4174a0, the four Radio
 * modes - end their loop with `add esi,1; cmp esi,4; jl`, against
 * runClubMix's `cmp 3`. So a shared runner that hardcodes three plays three
 * stages of a four-stage Radio course and calls it finished.
 *
 * The port takes the number from the mode's `.gds` `MaxBaseStage` instead,
 * which agrees with all thirteen: the four Radio descriptors say 4 and the
 * other nineteen say 3. **That is a port simplification, not the original's
 * mechanism** - none of the `.gds` key names appear anywhere in the binary, in
 * any case or encoding, so the game's tokenizer cannot be matching them by
 * name and does not read `MaxBaseStage` to decide this. One data-driven rule
 * replaces thirteen hardcoded bounds and produces the same behaviour; it is
 * recorded here as a choice rather than as a reading. */
#define EZ2_SESSION_ROUNDS 3

/* What the runner wants done next. */
typedef enum ez2_session_step {
    EZ2_STEP_DONE = 0,     /* the session is over; see ez2_session_result */
    EZ2_STEP_SONG_SELECT,
    EZ2_STEP_MAIN_GAME,
    EZ2_STEP_RESULT,       /* the per-stage result screen */
    EZ2_STEP_GAME_OVER,
    EZ2_STEP_RANKING,
    EZ2_STEP_MODE_INTRO
} ez2_session_step;

/* What the main game returns. Only 2 and 5 are branched on @0x417789/0x4177f9;
 * every other value falls through to the round bump, which is why this is an
 * int rather than a closed enum. */
#define EZ2_GAME_STAGE_END 2    /* the stage finished normally */
#define EZ2_GAME_RETRY     5    /* re-run the round without consuming it */

typedef struct ez2_session_rules {
    /* Game over arrives when the player has failed AND round >= this. The
     * original picks 1 or 2 from `g_1b2efb4` @0x417702. */
    int game_over_round;
    /* (`g_1b2ea34` used to be modelled here as a "continuing" RULE. It is
     * STATE - a first-stage gauge death, see ez2_session.first_stage_death.) */
    /* `g_1b2ef70` - set suppresses the ranking screen outright. Nothing in
     * the shipped build ever raises it (SCREEN-AUDIT.md, Reachability). */
    int suppress_ranking;
    /* The four radio runners (runRadioMix @0x416d60 and its twins,
     * ../src/moderunner.cpp:1124) call runRankingScreen only when
     * `stage + 1 == stages`, once, before the ending; the standard runners
     * call it after every stage. Set for modes 6..9. */
    int rank_at_end_only;
    /* runCv2Mix @0x417a30 (src/runcv2mix.cpp): no game-over threshold, no
     * ranking, no intro; a failed round shows NO result and moves on; after
     * three rounds a fail still up runs GAME OVER instead of the ending
     * (SCREEN-AUDIT.md 9.F8). */
    int cv2;
    /* `countListA()` @0x417802 - the ranking screen only appears when fewer
     * than two entries are listed. */
    int listed_entries;
    /* How many stages this session plays - the mode's `MaxBaseStage`.
     * 0 means EZ2_SESSION_ROUNDS. */
    int rounds;
} ez2_session_rules;

/* Sensible defaults: game over from round 2, not continuing, ranking allowed. */
void ez2_session_rules_default(ez2_session_rules *r);

/* What the caller reports back after performing a step. Only the field the
 * step asked about is read. */
typedef struct ez2_session_outcome {
    /* Song select: the player backed out. Main game: the player left mid-play
     * - a PORT ADDITION, since a cabinet has no window to close and the
     * original's runMainGame has no such return. It ends the session, which is
     * neither a game over nor a cleared stage. */
    int quit;
    int game_code;      /* main game: EZ2_GAME_STAGE_END / _RETRY / other */
    int failed;         /* main game: the gauge ran out (`g_1b2ea28`) */
    /* Result screen: it asked for game over (`stageResult == 1` @0x4177bd).
     * Distinct from `quit` above - a closed window is not a game over, and
     * the port has no result screen that can ask for one yet. */
    int result_game_over;
} ez2_session_outcome;

typedef enum ez2_session_end {
    EZ2_END_RUNNING = 0,
    EZ2_END_QUIT,        /* backed out of song select - returns 0 @0x41770a */
    EZ2_END_GAME_OVER,   /* returns 1 */
    EZ2_END_STAGES_DONE  /* three rounds played - falls out to the ending */
} ez2_session_end;

typedef struct ez2_session {
    ez2_session_rules rules;
    int round;                  /* 0-based; `g_elemCount` gets this */
    /* `g_1b2ea34`: raised by the sink when the gauge hits zero with
     * `g_elemCount == 0` (../src/sink.cpp:253, gfsink.cpp:36, catchpanelgds.
     * cpp:668) - a FIRST-STAGE death - and cleared by the next song select's
     * ctor (songselectctor.cpp:225). The runners read it after the stage:
     * `countListA() < 2 && g_1b2ea34 == 0` gates the ranking, and
     * `g_1b2ea34 == 1` runs runModeIntro (moderunner.cpp:893). So a player
     * who dies on stage 1 sees no ranking and the Mode_Intro plate instead. */
    int first_stage_death;
    ez2_session_end end;
    /* Internal: where the machine is within one round. */
    int phase;
    int game_code;
    int failed;
} ez2_session;

void ez2_session_begin(ez2_session *s, const ez2_session_rules *rules);

/* The next step to perform. Returns EZ2_STEP_DONE when the session is over. */
ez2_session_step ez2_session_next(ez2_session *s);

/* Report the result of the step ez2_session_next just handed out. */
void ez2_session_report(ez2_session *s, const ez2_session_outcome *o);

/* How it ended. EZ2_END_RUNNING until it does. */
ez2_session_end ez2_session_result(const ez2_session *s);

/* The stage number a UI would print, 1-based. */
int ez2_session_stage(const ez2_session *s);

/* How many stages this session plays. */
int ez2_session_rounds(const ez2_session *s);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_SESSION_H */
