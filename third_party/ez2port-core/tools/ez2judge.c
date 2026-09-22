/* ez2judge - play a chart with synthetic input and report the result.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 *   ez2judge --exe UNPACKED.exe CHART.ez [--offset MS] [--jitter MS] [--seed N]
 *
 * No window, no audio, no input device: every note is "pressed" at its own
 * time plus an offset and a deterministic jitter, and the judge, combo, gauge
 * and grade fall out. That makes the scoring path testable on all 12,361
 * charts without a person playing them.
 *
 * WHAT IT IS FOR. Judgement and scoring are the "must be exact" column: a
 * replay of the same chart with the same inputs must produce the same numbers
 * as the original. This tool is the harness that claim will be checked with.
 * On its own it proves internal consistency (a perfect play scores exactly the
 * theoretical maximum and grades S4); against a recorded play on the real
 * cabinet it would prove equivalence.
 *
 * NOTHING IT READS MAY BE COMMITTED - it is the user's game data.
 */
#include "../ez2/chart.h"
#include "../ez2/crypt.h"
#include "../ez2/gds.h"
#include "../ez2/keytable.h"
#include "../ez2/mode.h"
#include "../ez2/noteorder.h"
#include "../ez2/ranking.h"
#include "../ez2/score.h"
#include "../ez2/songdb.h"
#include "../ez2/stageini.h"
#include "../ez2/vfs.h"
#include "../ez2/songini.h"
#include "../ez2/file.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>



/* THE WINDOWS ARE IN TICKS, SO A MILLISECOND OFFSET NEEDS THE LOCAL BPM.
 * `--offset`/`--jitter` are milliseconds because that is what an input error
 * is; the judge wants ticks of 1/192 beat, and how many milliseconds one of
 * those is depends on the BPM in effect at the note being pressed.
 *
 * The map itself lives in ez2/chart.c now - it was three copies, one per tool,
 * and two of them returned milliseconds where the third returned seconds. */
static ez2_tempo g_tempo;

/* A small deterministic PRNG so a run is reproducible from its seed - the
 * point is repeatable vectors, not statistical quality. */
static unsigned int rng_state = 1;
static double jitter_next(double amplitude_ms)
{
    rng_state = rng_state * 1664525u + 1013904223u;
    return ((double)(rng_state >> 8) / 16777216.0 * 2.0 - 1.0) * amplitude_ms;
}

/* ---- selecting by song instead of by path -------------------------------
 *
 * Everything above takes a chart PATH, which is fine for a harness and useless
 * for a person: the tree is 499 folders deep in filenames nobody memorises.
 * With the song table read (ez2/songdb.c) the tool can do what song select
 * does - name a song and a mode and get a chart.
 *
 * This is also what puts the table's own reading under load. A parser with
 * only a test behind it is a parser nobody has used. */
/* A bad --exe must not be reported as a bad chart: check it once, up front,
 * and name the thing that actually broke. */
static int check_exe(const char *exe)
{
    ez2_keytable k;
    int rc = ez2_keytable_from_exe(exe, EZ2_KEY_EZ, &k);

    if (rc == EZ2_KT_OK)
        return 1;
    fprintf(stderr,
            "%s: --exe %s: %s\n"
            "  It must point at your own UNPACKED EZ2AC executable, and a\n"
            "  relative path resolves against the CURRENT directory.\n",
            "ez2judge", exe, ez2_keytable_strerror(rc));
    return 0;
}

int main(int argc, char **argv)
{
    const char *exe = 0, *chart_path = 0, *ini_path_arg = 0;
    double offset_ms = 0.0, jitter_ms = 0.0;
    char ini_path[2048];
    unsigned char *chart_bytes = 0, *ini_text = 0;
    size_t chart_n = 0, ini_n = 0;
    ez2_chart chart;
    ez2_song_ini ini;
    ez2_score sc;
    ez2_chart_id id;
    ez2_gds gds;
    const char *gds_mode;
    const char *root_arg = 0, *song_arg = 0, *mode_arg = 0, *tier_arg = 0;
    int gds_ok = 0, list_songs = 0, save = 0, list_courses = 0;
    const char *course_arg = 0;
    const char *player = "EZ2AC_FN";
    char picked[1024];
    int lanes[EZ2_MAX_LANES], lane_count = 0;
    const char *order_arg = 0;
    int order_opt = EZ2_OPT_NONE;
    unsigned order_seed = 0;
    int order_seed_set = 0;
    long total_notes = 0, holds = 0, hold_ticks = 0, backing = 0;
    int dump_notes = 0;      /* --dump-notes: one line per lane note, for tools/oracle */
    int i, t, j, rc = 1;

    for (i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--exe") == 0 && i + 1 < argc)         exe = argv[++i];
        else if (strcmp(argv[i], "--song") == 0 && i + 1 < argc)   song_arg = argv[++i];
        else if (strcmp(argv[i], "--mode") == 0 && i + 1 < argc)   mode_arg = argv[++i];
        else if (strcmp(argv[i], "--tier") == 0 && i + 1 < argc)   tier_arg = argv[++i];
        else if (strcmp(argv[i], "--list") == 0)                   list_songs = 1;
        else if (strcmp(argv[i], "--courses") == 0)                list_courses = 1;
        else if (strcmp(argv[i], "--course") == 0 && i + 1 < argc) course_arg = argv[++i];
        if (strcmp(argv[i], "--dump-notes") == 0) { dump_notes = 1; continue; }
        else if (strcmp(argv[i], "--offset") == 0 && i + 1 < argc) offset_ms = atof(argv[++i]);
        else if (strcmp(argv[i], "--jitter") == 0 && i + 1 < argc) jitter_ms = atof(argv[++i]);
        else if (strcmp(argv[i], "--seed") == 0 && i + 1 < argc)   rng_state = (unsigned)atoi(argv[++i]);
        else if (strcmp(argv[i], "--ini") == 0 && i + 1 < argc)    ini_path_arg = argv[++i];
        else if (strcmp(argv[i], "--root") == 0 && i + 1 < argc)   root_arg = argv[++i];
        else if (strcmp(argv[i], "--order") == 0 && i + 1 < argc)  order_arg = argv[++i];
        else if (strcmp(argv[i], "--order-seed") == 0 && i + 1 < argc) {
            order_seed = (unsigned)strtoul(argv[++i], 0, 0);
            order_seed_set = 1;
        }
        else if (strcmp(argv[i], "--save") == 0)                   save = 1;
        else if (strcmp(argv[i], "--name") == 0 && i + 1 < argc) { player = argv[++i]; save = 1; }
        else if (!chart_path) chart_path = argv[i];
    }
    /* THE RADIO MODES OFFER COURSES, NOT SONGS - they have no song.bin at all
     * (ez2/stageini.h). A course is four stages; this lists them, and --course
     * resolves one and hands its first stage to the ordinary play path. */
    if ((list_courses || course_arg) && root_arg && mode_arg && exe) {
        ez2_stageini si;
        int rc2 = ez2_stageini_load(root_arg, mode_arg, exe, &si);

        if (rc2 != EZ2_STAGEINI_OK) {
            fprintf(stderr, "ez2judge: %s: %s\n", mode_arg,
                    ez2_stageini_strerror(rc2));
            return 1;
        }
        if (list_courses) {
            int c;

            printf("%s: %d courses\n", mode_arg, si.count);
            for (c = 0; c < si.count; c++) {
                int k;

                printf("  %-18s lvl %-3d ", si.courses[c].key,
                       si.courses[c].level);
                for (k = 0; k < si.courses[c].stage_count; k++)
                    printf("%s%s", k ? ", " : "", si.courses[c].stage[k]);
                printf("\n");
            }
            ez2_stageini_free(&si);
            return 0;
        }
        {
            const ez2_course *co = ez2_stageini_find(&si, course_arg);
            static char first[2048];
            int k, resolved = 0;

            if (co == 0) {
                fprintf(stderr, "ez2judge: %s has no course '%s'\n", mode_arg,
                        course_arg);
                ez2_stageini_free(&si);
                return 1;
            }
            printf("%s course %s, level %d, %d stages\n", mode_arg, co->key,
                   co->level, co->stage_count);
            for (k = 0; k < co->stage_count; k++) {
                char p2[2048];

                if (ez2_stage_chart(root_arg, mode_arg, co->stage[k], 1,
                                    p2, sizeof p2)) {
                    printf("  stage %d  %-24s ok\n", k + 1, co->stage[k]);
                    if (resolved == 0)
                        snprintf(first, sizeof first, "%s", p2);
                    resolved++;
                } else {
                    printf("  stage %d  %-24s NOT ON DISK\n", k + 1,
                           co->stage[k]);
                }
            }
            printf("  %d of %d stages resolved\n", resolved, co->stage_count);
            ez2_stageini_free(&si);
            if (resolved && chart_path == 0)
                chart_path = first;      /* judge stage 1 below */
        }
    }

    /* The same environment fallbacks ez2play takes, so a ctest can name a
     * song without hard-coding a path to somebody's game. */
    if (!exe)      exe      = getenv("EZ2_EXE");
    if (!root_arg) root_arg = getenv("EZ2_ROOT");
    if (!chart_path && !song_arg && !list_courses && !course_arg)
        chart_path = getenv("EZ2_CHART");

    if (!exe && getenv("EZ2_SKIP_IF_ABSENT")) {
        fputs("SKIP: EZ2_EXE is not set\n", stdout);
        return 77;
    }
    if (!exe || (!chart_path && !song_arg && !list_songs)) {
        fputs("usage: ez2judge --exe UNPACKED.exe CHART.ez "
              "[--offset MS] [--jitter MS] [--seed N]\n"
              "       ez2judge --exe UNPACKED.exe --root ASSETS --mode MODE "
              "--song KEY [--tier nm|hd|shd|ex]\n"
              "       ez2judge --exe UNPACKED.exe --root ASSETS --mode MODE "
              "--list\n"
              "       ez2judge --exe UNPACKED.exe --root ASSETS --mode RadioMix "
              "--courses | --course KEY\n"
              "  --order OPT       note order: RANDOM SRANDOM PS FR MRANDOM "
              "HRANDOM MIRROR MIRROR_A KEY SP\n"
              "  --order-seed N    fix the shuffle's rng (default: 1, so a run "
              "is reproducible)\n", stderr);
        return 2;
    }

    if (order_arg) {
        order_opt = ez2_order_option_parse(order_arg);
        if (order_opt < 0) {
            fprintf(stderr, "ez2judge: unknown note order '%s'\n", order_arg);
            return 2;
        }
    }

    if (!check_exe(exe))
        return 1;

    /* --song / --list: go through the song table, the way select does. */
    if (song_arg || list_songs) {
        ez2_songdb db;
        const ez2_song_entry *e;
        ez2_song_chart ch[EZ2_SONGDB_STEPS];
        int k, want = -1;

        /* Exit 77 is ctest's skip code: the game is not in this repository,
         * so a machine without it must not fail the suite. */
        if (!root_arg || !mode_arg) {
            if (getenv("EZ2_SKIP_IF_ABSENT")) {
                fputs("SKIP: --song needs --root and --mode\n", stdout);
                return 77;
            }
            fputs("ez2judge: --song and --list need --root and --mode\n", stderr);
            return 2;
        }
        if (ez2_songdb_open_for_mode(root_arg, mode_arg, exe, &db) != EZ2_SONGDB_OK) {
            if (getenv("EZ2_SKIP_IF_ABSENT")) {
                fputs("SKIP: no song table for that mode\n", stdout);
                return 77;
            }
            fprintf(stderr, "ez2judge: no song table for mode '%s' under %s\n",
                    mode_arg, root_arg);
            return 1;
        }
        if (list_songs) {
            printf("%s: %d songs\n", mode_arg, db.count);
            for (i = 0; i < db.count; i++) {
                const ez2_song_entry *q = &db.entries[i];
                printf("  %-18s %-22s bpm %-7.5g levels", q->key,
                       q->name[0] ? q->name : "", q->steps[0].b);
                for (t = 0; t < EZ2_SONGDB_STEPS; t++)
                    if (q->steps[t].level > 0)
                        printf(" %s=%d", ez2_songdb_tier_name(t), q->steps[t].level);
                printf("\n");
            }
            ez2_songdb_free(&db);
            return 0;
        }
        e = ez2_songdb_find(&db, song_arg);
        if (!e) {
            fprintf(stderr, "ez2judge: '%s' is not in %s's song table "
                            "(try --list)\n", song_arg, mode_arg);
            ez2_songdb_free(&db);
            return 1;
        }
        if (tier_arg && (want = ez2_songdb_tier_from_name(tier_arg)) < 0) {
            fprintf(stderr, "ez2judge: --tier must be nm, hd, shd or ex\n");
            ez2_songdb_free(&db);
            return 1;
        }
        k = ez2_songdb_charts(root_arg, e, mode_arg, 1, ch, EZ2_SONGDB_STEPS);
        if (k == 0) {
            fprintf(stderr, "ez2judge: '%s' has no %s chart on disk\n",
                    song_arg, mode_arg);
            ez2_songdb_free(&db);
            return 1;
        }
        for (i = 0; i < k; i++)
            if (want < 0 || ch[i].tier == want) {
                snprintf(picked, sizeof picked, "%s", ch[i].path);
                chart_path = picked;
                break;
            }
        if (!chart_path) {
            fprintf(stderr, "ez2judge: '%s' has no %s chart at that tier; it "
                            "offers", song_arg, mode_arg);
            for (i = 0; i < k; i++)
                fprintf(stderr, " %s", ez2_songdb_tier_name(ch[i].tier));
            fputs("\n", stderr);
            ez2_songdb_free(&db);
            return 1;
        }
        ez2_songdb_free(&db);
    }
    chart_bytes = ez2_file_read_decrypted(chart_path, exe, EZ2_KEY_EZ, &chart_n);
    if (!chart_bytes || ez2_chart_parse(chart_bytes, chart_n, &chart) != EZ2_CHART_OK) {
        fprintf(stderr, "ez2judge: cannot read %s as a chart\n", chart_path);
        free(chart_bytes);
        return 1;
    }

    /* The judgement windows live in the sibling .ini, not in the code. */
    if (ini_path_arg) {
        snprintf(ini_path, sizeof ini_path, "%s", ini_path_arg);
    } else {
        /* Case-resolved, like the .ezi - the extension's spelling varies in
         * the shipped data even where the stem's does not. */
        if (!ez2_vfs_sibling(chart_path, "ini", ini_path, sizeof ini_path))
            snprintf(ini_path, sizeof ini_path, "%s", chart_path);
    }
    ini_text = ez2_file_read_decrypted(ini_path, exe, EZ2_KEY_INI, &ini_n);
    if (ini_text) {
        ez2_song_ini_parse((const char *)ini_text, ini_n, &ini);
    } else {
        ez2_song_ini_defaults(&ini);
        fprintf(stderr, "ez2judge: no %s - using the code defaults\n", ini_path);
    }
    /* The game never judges with the file's raw windows: @0x430793 widens all
     * four by +3 ticks (normal mode) before Judge::setWindows @0x426ea0. */
    ez2_song_ini_apply_judge_widening(&ini, 0);

    ez2_tempo_build(&chart, &g_tempo);

    /* WHICH TRACKS ARE LANES DEPENDS ON THE MODE, and the mode comes from the
     * filename. Everything not in the lane set is backing audio: judging it
     * would inflate the note count, the score maximum and therefore the rate.
     * A 5-key chart carries far more notes than it has lanes. */
    ez2_chart_id_parse(chart_path, &id);

    /* The gauge rates take the director's per-mode adjustments before anything
     * reads them - 14-key bonus, catch's GOOD zero (@0x4206e0 / @0x46c2b0,
     * PORT-DELTAS finding 15). After the id parse because it needs the mode;
     * nothing consumes the rates before this point. */
    ez2_song_ini_apply_mode_bonus(&ini, id.mode);
    ez2_song_ini_apply_measure_scale(&ini, id.mode);

    /* LANE ORDER COMES FROM THE MODE'S .gds, NOT FROM US. ez2_mode_lanes
     * derives the right SET from the library but sorts it ascending, which
     * puts the scratch in the middle of the row; the descriptor has the real
     * order (docs/gds-slots.md). The root is `<root>/sound/<song>/x.ez`, so
     * two levels up from the chart - or --root. Falling back is deliberate:
     * a wrong lane order is worse than the old behaviour, not fatal. */
    {
        const char *root = root_arg;
        char derived[2048];

        if (!root) {
            /* root/sound/<song>/<chart>.ez - three components to strip. */
            size_t k = strlen(chart_path);
            int up;

            snprintf(derived, sizeof derived, "%s", chart_path);
            k = strlen(derived);
            for (up = 0; up < 3 && k > 0; up++) {
                while (k > 0 && derived[k - 1] != '/' && derived[k - 1] != '\\')
                    k--;
                if (k > 0)
                    k--;                       /* step over the separator */
            }
            if (up == 3) {
                derived[k] = 0;
                root = derived;
            }
        }
        /* A CV2 CHART'S LAYOUT IS NOT CV2MIX'S - there is no such descriptor.
         * The song table's `kind` byte names one of ten sub-modes
         * (ez2/mode.h), and that is where the lanes come from. */
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
    }

    if (lane_count == 0)
        lane_count = ez2_mode_lanes(id.mode, lanes, EZ2_MAX_LANES);
    if (lane_count == 0) {
        fprintf(stderr, "ez2judge: no lane set for mode '%s' - judging every "
                        "track, which is wrong but at least says so\n",
                id.mode_name[0] ? id.mode_name : "?");
    }

    /* THE NOTE ORDER IS APPLIED HERE, between resolving the lanes and judging
     * anything - it rewrites which TRACK each lane's notes live in, and every
     * count below is taken after it. The lane map carries the `.gds` control
     * ids as well as the tracks, because the four mirrors and the veto go by
     * id; without a descriptor those ids are absent and the mirrors correctly
     * do nothing rather than mirroring a guess. */
    if (order_opt != EZ2_OPT_NONE) {
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
        if (!ez2_order_option_available(id.mode, (ez2_order_option)order_opt))
            printf("order: note - %s's own menu does not offer %s "
                   "(its cycler skips that value); applying it anyway\n",
                   ez2_mode_name(id.mode),
                   ez2_order_option_name((ez2_order_option)order_opt));
        ez2_rng_seed(&orng, order_seed_set ? order_seed : 1u);
        swaps = ez2_note_order_apply_option(&chart, &lm,
                                            (ez2_order_option)order_opt,
                                            id.mode, &orng);
        printf("order: %s -> %d swap%s%s\n",
               ez2_order_option_name((ez2_order_option)order_opt),
               swaps < 0 ? 0 : swaps, swaps == 1 ? "" : "s",
               gds_ok ? "" : "  (no .gds: control ids unknown, "
                             "the mirrors by id are no-ops)");
    }

    ez2_score_init(&sc, EZ2_GAUGE_MAX, EZ2_GAUGE_MAX);
    /* EZ2CATCH scores by a different model, not a different constant - see
     * ez2/score.h. Chosen from the chart's own mode. */
    if (id.mode == EZ2_MODE_CATCH)
        ez2_score_set_model(&sc, EZ2_SCORE_CATCH);
    /* AND CV2MIX IS A THIRD MODEL, not a keys mode with different constants:
     * `runCv2Mix` @0x417a3f sets the global that the sink @0x42e620 and the
     * rank @0x42e190 both branch on, which changes the note values, adds a
     * combo multiplier, drops GOOD from the combo and swaps the grade ladder.
     * See ez2/score.h. */
    else if (id.mode == EZ2_MODE_CV2)
        ez2_score_set_model(&sc, EZ2_SCORE_CV2);

    /* Every playable note in a LANE is pressed at its own time plus the offset
     * and jitter. Notes are walked track by track; within a track they are
     * already in tick order, and since each press is judged against its own
     * note the order between tracks does not change the tally. */
    for (t = 0; t < chart.track_count; t++) {
        /* JUDGE AGAINST THE LANES THAT WERE RESOLVED, not against mode.c's
         * static set. This asked ez2_mode_uses_track(id.mode, t) while
         * displaying the .gds lanes right above - so any mode whose .gds set
         * differs from the built-in one judged the wrong tracks, and CV2Mix,
         * whose built-in set is deliberately EMPTY, judged none at all: all
         * 103 of its charts scored 0 on a perfect play. ez2play had always
         * done this correctly; the two tools had drifted. */
        int is_lane = 0;

        if (lane_count > 0) {
            int L;
            for (L = 0; L < lane_count; L++)
                if (lanes[L] == t) { is_lane = 1; break; }
        } else {
            is_lane = ez2_mode_uses_track(id.mode, t);
        }

        for (j = 0; j < chart.tracks[t].note_count; j++) {
            const ez2_note *e = &chart.tracks[t].notes[j];
            double dt;
            ez2_judgement verdict;
            unsigned int hold;

            if (e->type != EZ2_NOTE_NOTE)
                continue;
            if (!is_lane) {
                backing++;          /* auto-played; never judged */
                continue;
            }
            /* The game's own count @0x42f2d0 - the head plus a hold's
             * instalments (kinds 9..12 count no head at all). */
            total_notes += ez2_note_counted(e->unknown, chart.ticks_per_measure,
                                            (unsigned)e->length, 0);

            if (dump_notes)
                printf("N %d %.3f %.3f\n", t,
                       ez2_tempo_ms(&g_tempo, e->tick, chart.ticks_per_measure),
                       ez2_note_hold_ticks(e)
                           ? ez2_tempo_ms(&g_tempo, e->tick + ez2_note_hold_ticks(e),
                                          chart.ticks_per_measure)
                             - ez2_tempo_ms(&g_tempo, e->tick, chart.ticks_per_measure)
                           : 0.0);
            dt = offset_ms + (jitter_ms > 0.0 ? jitter_next(jitter_ms) : 0.0);
            /* ms -> judge ticks, at the BPM this note is played at. */
            verdict = ez2_judge_ms(dt, ez2_tempo_bpm_at(&g_tempo, e->tick), &ini);
            /* A press outside every window consumes no note - so the note is
             * then left unhit, which is a MISS. */
            if (verdict == EZ2_J_NONE)
                verdict = EZ2_JUDGE_UNHIT;
            ez2_score_apply(&sc, verdict, &ini);

            /* A hold produces one judgement at the head and then one scored
             * instalment per step while held - a synthetic player holds to
             * the end, so every instalment pays at the head's grade (COOL
             * promoted to KOOL, as the commit does). Catch's hold payout is
             * a different function and is not modelled: its ticks are only
             * counted here. */
            hold = ez2_note_hold_ticks(e);
            if (hold && verdict != EZ2_J_MISS) {
                if (id.mode == EZ2_MODE_CATCH) {
                    long ticks = ez2_catch_hold_ticks(hold, chart.ticks_per_measure,
                                                      e->unknown);
                    holds++;
                    hold_ticks += ticks;
                } else {
                    /* What the MACHINE pays, which for kinds 4/5/6 is not
                     * what the counter above counts - the game's own
                     * disagreement, kept. Kind 6 pays only its last. */
                    long n = ez2_hold_instalments(e->unknown, chart.ticks_per_measure,
                                                  hold + 6, 0);
                    ez2_judgement g = verdict == EZ2_J_COOL ? EZ2_J_KOOL : verdict;
                    long k;

                    holds++;
                    hold_ticks += n;
                    if (e->unknown == 6) {
                        if (g == EZ2_J_KOOL)
                            ez2_score_apply(&sc, g, &ini);
                    } else {
                        for (k = 0; k < n; k++)
                            ez2_score_apply(&sc, g, &ini);
                    }
                }
            }
        }
    }

    printf("%s\n", chart_path);
    printf("  chart   \"%s\" v%d, %.2f bpm, level %d\n", chart.name,
           chart.version, chart.bpm, ini.level);
    printf("  mode    %s %s, %d lanes:", ez2_mode_name(id.mode),
           ez2_tier_name(id.tier), lane_count);
    for (i = 0; i < lane_count; i++)
        printf(" %d", lanes[i]);
    printf("   (%s)\n", gds_ok ? "lane ORDER from the mode's .gds"
                                : "SET only - no .gds found, order is a guess");
    printf("  windows KOOL %d  COOL %d  GOOD %d  MISS %d  "
           "(TICKS of 1/192 beat, from the .ini, +3 widened)\n",
           ini.kool_ticks, ini.cool_ticks, ini.good_ticks, ini.miss_ticks);
    printf("          = %.1f / %.1f / %.1f / %.1f ms at the chart's %.2f bpm "
           "- beat-relative, so tighter wherever it speeds up\n",
           ini.kool_ticks * ez2_tick_ms(chart.bpm),
           ini.cool_ticks * ez2_tick_ms(chart.bpm),
           ini.good_ticks * ez2_tick_ms(chart.bpm),
           ini.miss_ticks * ez2_tick_ms(chart.bpm), chart.bpm);
    /* Labelled by the GRADE that gets each rate, not by the .ini key it was
     * read from - the two negative ones are crossed (see ez2/score.h), and a
     * line that printed the key names beside the grade names would contradict
     * what the tally below then does. The key name is shown in brackets. */
    printf("  gauge   KOOL %+.2f  COOL %+.2f  GOOD %+.2f  "
           "FAIL %+.2f [ini Miss]  MISS %+.2f [ini Fail]\n",
           ini.gauge_kool, ini.gauge_cool, ini.gauge_good, ini.gauge_miss,
           ini.gauge_fail);
    printf("  input   offset %+.1f ms, jitter %.1f ms\n", offset_ms, jitter_ms);
    printf("  ---\n");
    printf("  notes   %ld judged incl. hold instalments  (%ld holds, %ld instalments); "
           "%ld backing notes auto-played\n",
           total_notes, holds, hold_ticks, backing);
    printf("  judge   KOOL %ld  COOL %ld  GOOD %ld  FAIL %ld  MISS %ld\n",
           sc.counts[EZ2_J_KOOL], sc.counts[EZ2_J_COOL], sc.counts[EZ2_J_GOOD],
           sc.counts[EZ2_J_FAIL], sc.counts[EZ2_J_MISS]);
    printf("  combo   max %ld\n", sc.max_combo);
    printf("  gauge   %.2f / %.0f%s\n", sc.gauge, sc.gauge_max,
           sc.failed ? "   (FAILED - the gauge reached zero)" : "");
    printf("  score   %ld of %ld max\n", sc.score,
           ez2_score_max_for(ez2_score_model_of(&sc), total_notes));
    printf("  rate    %.2f%%\n", ez2_score_rate(&sc, total_notes));
    printf("  rank    %s   (hit-percentage ladder: %d)\n",
           ez2_score_grade_name(&sc, ez2_score_grade(&sc, total_notes)),
           ez2_score_rank_hits(&sc, total_notes));

    /* RESULT -> SAVE, headless. Same call ez2play makes; see ez2/ranking.h. */
    if (save && root_arg && id.mode != EZ2_MODE_UNKNOWN && id.stem[0]) {
        ez2_ranking table;
        int place = ez2_ranking_submit(root_arg, ez2_mode_name(id.mode),
                                       id.stem, (int)id.tier, player,
                                       (int)sc.score, &table);
        int k;

        printf("  ---\n");
        printf("  place   %s\n", place < 0 ? "outside the top five"
                                           : "written to the chart's table");
        for (k = 0; k < EZ2_RANK_SLOTS; k++)
            printf("   %d %-8s %8d%s\n", k + 1, table.slots[k].name,
                   table.slots[k].score, k == place ? "  <-" : "");
    } else if (save) {
        fprintf(stderr, "ez2judge: --save needs --root and a chart whose name "
                        "gives a mode and a song\n");
    }

    rc = 0;
    ez2_chart_free(&chart);
    free(chart_bytes);
    free(ini_text);
    return rc;
}
