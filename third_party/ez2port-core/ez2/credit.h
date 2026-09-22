/* The machine's credit counter - Obj40C180's `have` and `need`.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * WHY A FREE-PLAY PORT NEEDS ONE. "Free play" in the original is not "no
 * credit model"; it is `need == 0`, and everything else still reads the
 * counter:
 *
 *   - the title polls START only in the `have != 0` arm of update2
 *     @0x44f4d0 (../../src/titleupdate.cpp:130-155), so a cabinet whose
 *     counter has never been bumped ignores START even in free play;
 *   - a START seats a side only if `consume()` @0x418890 says yes
 *     (../../src/titleseat.cpp, ../../src/modeselect.cpp), which is how the
 *     SECOND side joins from the title or the mode select;
 *   - the press-start prompts have an insert-coin variant picked on
 *     `have >= need` (update @0x4491b0), the START lamps light on the same
 *     test (updateTitleStartLamps @0x44e780), and every menu screen carries
 *     the ShowCredit plate that spells the count out (update @0x450040);
 *   - test mode zeroes it on entry (TestModeDirector ctor @0x4766e0).
 *
 * What bumps it - serviceCoins @0x418760 (../../src/titledirector.cpp:477):
 * the coin input (cabinet slot 3, which on a keyboard is the original's own
 * F3) while `testMode2`, SERVICE (slot 2) while `testMode1`, the coin
 * mech's `pending()` count, and once at boot the bookkeeping file's
 * "Coins". Nothing ever deducts at `need == 0`, so under free play the
 * counter is a latch: one pulse in the machine's life and START works for
 * ever after. That is the cabinet's rule and it is kept here as it is.
 *
 * This is a pure model: no input, no drawing. The screens feed it and read
 * it. */
#ifndef EZ2_CREDIT_H
#define EZ2_CREDIT_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct ez2_credit {
    int have;          /* Obj40C180 +0x??: coins in the machine */
    int need;          /* CreditCoins: coins per credit, 0 = free play */
    int shown;         /* g_shownCredits - what the plate last showed */
    int coin_counts;   /* testMode2: the coin input counts (0 in test mode) */
    int service_counts;/* testMode1: SERVICE counts (0 in test mode) */
    int inserted;      /* g_coinInserted: a coin landed since the last take */
    int total_coin;    /* g_totalCoin - every coin pulse (bookkeeping) */
    int service_coin;  /* g_serviceCoin - every SERVICE press */
    int total_play;    /* g_totalPlay - every mode run (runGame @0x417e90) */
} ez2_credit;

/* `need` is the operator's CreditCoins; `have` the bookkeeping file's
 * "Coins" (readBookkeeping @0x415070), 0 when there is none. */
void ez2_credit_init(ez2_credit *c, int need, int have);

/* One pulse of the coin input (slot 3 / the mech). Counts only while
 * `coin_counts`. */
void ez2_credit_coin(ez2_credit *c);

/* One SERVICE press. Counts only while `service_counts`. The original also
 * bumps g_serviceCoin for the bookkeeping; not modelled. */
void ez2_credit_service(ez2_credit *c);

/* consume @0x418890: 1 and `have -= need` when there is a credit, 0 when
 * there is not; always 1 at need == 0 and nothing is deducted. */
int ez2_credit_consume(ez2_credit *c);

/* `have >= need`: the START-lamp rule @0x44e780 and the prompt rule
 * @0x4491b0 (press-start vs insert-coin). Always true at need == 0. */
int ez2_credit_enough(const ez2_credit *c);

/* The whole credits the plate shows: have / need, 0 in free play. */
int ez2_credit_count(const ez2_credit *c);

/* ShowCredit::update2 @0x44fb40, once a frame: compares `have` with what
 * was shown last and returns 0 (nothing new), 1 (a coin that did not
 * complete a credit: coin0.wav) or 2 (one that did: coin1.wav); sweeps the
 * counter to zero at nineteen credits. Returns 0 in free play. */
int ez2_credit_tick(ez2_credit *c);

/* g_coinInserted, read-and-clear: the title restarts Common\Coin.str on it. */
int ez2_credit_take_inserted(ez2_credit *c);

/* TestModeDirector's entry (@0x4766e0): the count is cleared and neither
 * input counts; its exit (@0x4761e0) lets both count again. */
void ez2_credit_enter_test(ez2_credit *c);
void ez2_credit_leave_test(ez2_credit *c);

#ifdef __cplusplus
}
#endif

#endif
