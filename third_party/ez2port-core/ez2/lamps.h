/* The cabinet's lamps, exactly as the original drives them.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ---- what the original does ---------------------------------------------
 *
 * There are THIRTY-TWO output bits, held in four words at `Obj40C180+0x420274`
 * (`include/bigbase.h`'s `flags[4]`), and once a tick the engine pushes them
 * at the cabinet's I/O board:
 *
 *     tick @0x40cc90 ... if (f4200f4) { _outp(0x100, flags[0]); ...
 *                                       _outp(0x103, flags[3]); }
 *
 * so channel `c` is bit `c % 8` of port `0x100 + c / 8`. Nothing else about
 * the wiring is guesswork: setOutput @0x40c780 does that division itself.
 *
 * A channel is raised two ways, and BOTH are reproduced here.
 *
 *   1. ROUTED FROM A BUTTON. Each of the 26 input slots bindButtons @0x418c90
 *      creates carries a `channel` field, and applyOutputs @0x40c940 walks the
 *      table once a tick resolving each slot's press state onto its channel:
 *      state 2 or 3 (pressed / held) DRIVES the channel and claims it so a
 *      later slot cannot touch it, state 0 or 1 (up / just released) releases
 *      it - but only while nothing has claimed it. Channel -1 is skipped.
 *      This is what makes a key lamp light under the hand with no screen code
 *      involved at all. The five routing functions (`ez2_lamps_route` below)
 *      are what hook the slots up.
 *
 *   2. SET OUTRIGHT by the screen, through setOutput @0x40c780 - the START
 *      lamps, the neon, the attract blink, the per-mode player rows.
 *
 * ---- the slot map, and why it is certain ---------------------------------
 *
 * bindButtons @0x418c90 creates slots 0x00..0x19. Which button each one is
 * falls out of three independent readings that agree:
 *
 *   - the `.gds` descriptors' own `Key=` numbers ARE slot indices (ez2/gds.h):
 *     10..14 are player one's five keys, 15/16 the scratch pair, 17 the pedal,
 *     6/7 the sixth and seventh keys, and player two's block is 18..22, 23/24,
 *     25 with 8/9 for its sixth and seventh;
 *   - the lamp routing lands on exactly those slots. m418a50 @0x418a50 maps
 *     slots 0x0a..0x10 onto channels 0x10..0x15 and gives 0x0f AND 0x10 the
 *     same channel 0x15 - two scratch directions, one turntable lamp - and
 *     m418af0 @0x418af0 repeats it for 0x12..0x18 onto 0x18..0x1d;
 *   - the game reads slots 1 and 2 as the operator's TEST and SERVICE (every
 *     test page's update2 guards on `getState(1) != 2`), and slots 4 and 5 as
 *     the two STARTs (update2 @0x4249e0 leaves a stage on `heldFor(4/5) >=
 *     5000`).
 *
 * ---- the channel map, and why it is certain ------------------------------
 *
 * The names are 2EZConfig's (`src/common/include/game_defs.h`), whose DJ
 * output tables decode the same four ports bit for bit. Every one of them is
 * confirmed by a call site in the reconstruction:
 *
 *     0..3   RED/BLUE lamp L,R   MainGameDirector clears 0,1,2,3 on entry
 *     4      NEONS               gfupdate2 / catchupdate2 / ez2djupdate2 pulse it
 *     8,9    P1/P2 START         updateStartLamps @0x44b2c0 sets 8 and 9
 *     0xa..0xd  "Effector 1..4"  m4189e0 routes slots 6..9 - which the .gds
 *                                calls keys SIX and SEVEN of each side. The
 *                                lamps are physically the effector row; the
 *                                game lights them as the extra key lamps, and
 *                                setPlayerLamps' mode 3/7 arm gives P1 0xa,0xb
 *                                and P2 0xc,0xd, which is exactly a 7-key
 *                                layout. Both readings are the same four lamps.
 *     0x10..0x14  P1 key 1..5    m418a50 / m418b90 / setPlayerLamps
 *     0x15        P1 turntable   both scratch directions route to it
 *     0x18..0x1c  P2 key 1..5    m418af0 / routeOutputs @0x418c10
 *     0x1d        P2 turntable   likewise
 *
 * Bits 6 and 7 of words 2 and 3 - channels 0x16, 0x17, 0x1e, 0x1f - are the
 * four resetInputState @0x40c820 raises and nothing else ever touches. They
 * are not in 2EZConfig's table either. `ez2_lamps_reset` reproduces them
 * rather than deciding they are dead.
 *
 * ---- what this file is not ----------------------------------------------
 *
 * It does not touch hardware. It is the MODEL: the four port words and the
 * rules that move them, with no dependency on anything, which is why it lives
 * in ez2core and is testable with no window and no device. Getting the bytes
 * to a real lamp is ez2/lampcfg.h (which output is bound to which light) and
 * the platform seam's ezLights* (which writes them).
 */
#ifndef EZ2_LAMPS_H
#define EZ2_LAMPS_H

#ifdef __cplusplus
extern "C" {
#endif

/* Four output words of eight bits, pushed at ports 0x100..0x103. */
#define EZ2_LAMP_PORTS    4
#define EZ2_LAMP_CHANNELS 32

/* bindButtons @0x418c90 creates 0x00..0x19. */
#define EZ2_LAMP_SLOTS    26

/* The output channels, named as 2EZConfig names them. */
enum {
    EZ2_LAMP_RED_L    = 0x00,
    EZ2_LAMP_RED_R    = 0x01,
    EZ2_LAMP_BLUE_L   = 0x02,
    EZ2_LAMP_BLUE_R   = 0x03,
    EZ2_LAMP_NEON     = 0x04,

    EZ2_LAMP_P1_START = 0x08,
    EZ2_LAMP_P2_START = 0x09,
    /* The effector row - the sixth and seventh key lamps, P1 then P2. */
    EZ2_LAMP_EFFECT1  = 0x0a,
    EZ2_LAMP_EFFECT2  = 0x0b,
    EZ2_LAMP_EFFECT3  = 0x0c,
    EZ2_LAMP_EFFECT4  = 0x0d,

    EZ2_LAMP_P1_1     = 0x10,
    EZ2_LAMP_P1_2     = 0x11,
    EZ2_LAMP_P1_3     = 0x12,
    EZ2_LAMP_P1_4     = 0x13,
    EZ2_LAMP_P1_5     = 0x14,
    EZ2_LAMP_P1_TT    = 0x15,

    EZ2_LAMP_P2_1     = 0x18,
    EZ2_LAMP_P2_2     = 0x19,
    EZ2_LAMP_P2_3     = 0x1a,
    EZ2_LAMP_P2_4     = 0x1b,
    EZ2_LAMP_P2_5     = 0x1c,
    EZ2_LAMP_P2_TT    = 0x1d
};

/* The input slots, by the numbers the `.gds` descriptors and the test pages
 * use. These are indices into the slot table, not channels. */
enum {
    EZ2_LAMP_SLOT_TEST     = 0x01,
    EZ2_LAMP_SLOT_SERVICE  = 0x02,
    EZ2_LAMP_SLOT_P1_START = 0x04,
    EZ2_LAMP_SLOT_P2_START = 0x05,
    EZ2_LAMP_SLOT_P1_KEY6  = 0x06,
    EZ2_LAMP_SLOT_P1_KEY7  = 0x07,
    EZ2_LAMP_SLOT_P2_KEY6  = 0x08,
    EZ2_LAMP_SLOT_P2_KEY7  = 0x09,
    EZ2_LAMP_SLOT_P1_KEY1  = 0x0a,
    EZ2_LAMP_SLOT_P1_KEY5  = 0x0e,
    EZ2_LAMP_SLOT_P1_TT_UP = 0x0f,
    EZ2_LAMP_SLOT_P1_TT_DN = 0x10,
    EZ2_LAMP_SLOT_P1_PEDAL = 0x11,
    EZ2_LAMP_SLOT_P2_KEY1  = 0x12,
    EZ2_LAMP_SLOT_P2_KEY5  = 0x16,
    EZ2_LAMP_SLOT_P2_TT_UP = 0x17,
    EZ2_LAMP_SLOT_P2_TT_DN = 0x18,
    EZ2_LAMP_SLOT_P2_PEDAL = 0x19
};

/* The four-state press tracker every slot runs (tick @0x40cc90, and again in
 * m40c6f0 @0x40c6f0 for the bit-addressed source). applyOutputs drives a
 * channel on PRESSED or HELD and releases it on UP or RELEASED. */
enum {
    EZ2_LAMP_UP       = 0,
    EZ2_LAMP_RELEASED = 1,
    EZ2_LAMP_PRESSED  = 2,
    EZ2_LAMP_HELD     = 3
};

/* The five routing groups, one per function in the original. Each hooks a run
 * of slots to a run of channels, or hands every slot -1 to unhook it. */
enum {
    EZ2_LAMP_ROUTE_KEY67   = 0,  /* m4189e0     @0x4189e0: slots 6..9   -> 0x0a..0x0d */
    EZ2_LAMP_ROUTE_P1      = 1,  /* m418a50     @0x418a50: slots 0xa..0x10 -> 0x10..0x15 */
    EZ2_LAMP_ROUTE_P2      = 2,  /* m418af0     @0x418af0: slots 0x12..0x18 -> 0x18..0x1d */
    EZ2_LAMP_ROUTE_P1_KEYS = 3,  /* m418b90     @0x418b90: slots 0xa..0xe -> 0x10..0x14 */
    EZ2_LAMP_ROUTE_P2_KEYS = 4,  /* routeOutputs @0x418c10: slots 0x12..0x16 -> 0x18..0x1c */
    EZ2_LAMP_ROUTE_COUNT   = 5
};

typedef struct ez2_lamps {
    int         port[EZ2_LAMP_PORTS];      /* what goes out at 0x100..0x103 */
    signed char channel[EZ2_LAMP_SLOTS];   /* slot -> channel, -1 = unrouted */
    signed char state[EZ2_LAMP_SLOTS];     /* the press tracker */
    int         blink_phase;               /* g_blinkPhase @0x37dd068 */
    int         select_phase;              /* g_37dd044, the select screen's */
    int         battle_phase;              /* BattleMode's m_f38 */
    int         title_phase;               /* TitleDirector's m_step (m_attract == 1 arm) */
} ez2_lamps;

/* ---- the model ---------------------------------------------------------- */

/* init @0x40cc30 + bindButtons @0x418c90: 26 slots, every one unrouted, every
 * tracker idle, every lamp dark. */
void ez2_lamps_init(ez2_lamps *l);

/* resetFlags @0x40c8f0 - all four words to zero, which is what the cabinet
 * gets on shutdown. */
void ez2_lamps_clear(ez2_lamps *l);

/* resetInputState @0x40c820's lamp half: clear, then raise bits 6 and 7 of
 * words 2 and 3. Called where the original takes the cabinet's current state
 * to be the rest state. */
void ez2_lamps_reset(ez2_lamps *l);

/* setOutput @0x40c780 / the read side of it. `channel` outside 0..31 is
 * ignored rather than trusted - the original divides without checking, and a
 * port that indexes off the end of `port[]` on a bad channel is worse than one
 * that does nothing. */
void ez2_lamps_set(ez2_lamps *l, int channel, int on);
int  ez2_lamps_get(const ez2_lamps *l, int channel);

/* setFlags @0x40c7d0 - every word to 7 or 0. Not "all lamps": SEVEN, so it
 * lights channels 0,1,2 / 8,9,0xa / 0x10,0x11,0x12 / 0x18,0x19,0x1a. Screens
 * call it with 0 on the way out, which is the only use the reconstruction
 * shows, but the on-shape is the original's and is reproduced. */
void ez2_lamps_set_all(ez2_lamps *l, int on);

/* Hook or unhook one routing group. */
void ez2_lamps_route(ez2_lamps *l, int group, int on);

/* Feed one slot's button level in; runs the four-state tracker. */
void ez2_lamps_track(ez2_lamps *l, int slot, int down);

/* applyOutputs @0x40c940 - resolve every routed slot onto its channel, with
 * the claim rule: a driving slot locks the channel, a releasing one does not.
 * Call once a tick, after the tracker has been fed and before reading port[]. */
void ez2_lamps_apply(ez2_lamps *l);

/* ---- what the screens do ------------------------------------------------ */

/* BattleMode::setPlayerLamps @0x41bd20 - the per-mode player rows. `mode` is
 * g_modeIndex; `p1`/`p2` say whether that seat has a player in it (the
 * original asks findListA). Modes outside the three shapes leave the lamps
 * alone, exactly as the original's fall-through does. */
void ez2_lamps_player(ez2_lamps *l, int mode, int p1, int p2, int on);

/* blinkAlternateLamps @0x44b330 - every other key lamp, on for fifteen frames
 * of thirty, for an occupied seat only, and the 0xa..0xd bank held down
 * throughout. Bumps the phase counter itself, so call it once a frame. */
void ez2_lamps_blink(ez2_lamps *l, int p1, int p2);

/* TitleDirector::tickLamps @0x44e050 (../src/titledirector.cpp), the title's
 * own program - NOT blinkAlternateLamps, which the title never calls (only
 * modeselectupdate2.cpp:74 does). With no seat taken the sixteen lamps hold
 * one still picture: the four effector lamps lit, both rows of keys dark
 * (the step counter that would walk the chase advances only on a coin-lamp
 * strobe, and nothing in the binary ever arms one). Once a seat is taken
 * (m44dec0 from the START press, m_attract = 1) every lamp flashes on an
 * eleven-frame cycle: six frames dark, five lit. */
void ez2_lamps_title(ez2_lamps *l, int seated);

/* SongSelectDirector::update2 @0x446540's blink - the SELECT screen's, and not
 * the same one: a SIXTY-tick counter with thirty on, over the three odd key
 * lamps of each row, and no shared bank.
 *
 * `both_banks` is the original's own mode test. ClubMix, SpaceMix, 10RadioMix
 * and 14RadioMix light BOTH rows whether or not each seat is occupied - they
 * are the modes where one player's field spans both banks - and every other
 * mode lights a row only for a seat with a player in it. Bumps its own phase,
 * so call it once a frame. */
void ez2_lamps_select_blink(ez2_lamps *l, int both_banks, int p1, int p2);

/* BattleMode::update2 @0x41c660's intro pulse: a sixty-tick counter with the
 * per-mode player rows lit below forty and dark from forty - which is
 * setPlayerLamps driven on and off rather than a lamp pattern of its own. The
 * original runs it only while the stage is still in its intro; once the stage
 * is ending it calls setPlayerLamps(0) outright. Bumps its own phase. */
void ez2_lamps_battle_pulse(ez2_lamps *l, int mode, int p1, int p2);

/* updateStartLamps @0x44b2c0 (and TitleDirector's copy @0x44e780, which is the
 * same rule over a different list): with enough credit in the machine a START
 * lamp lights for a seat that has NOT joined - an invitation - and goes dark
 * for one that has. Below the credit requirement both are dark. */
void ez2_lamps_start(ez2_lamps *l, int enough_credit, int p1_joined, int p2_joined);

/* ---- reading it out ----------------------------------------------------- */

/* The byte port 0x100 + `i` would receive. */
int ez2_lamps_port(const ez2_lamps *l, int i);

/* 2EZConfig's own name for a channel, or null for the eleven with no light on
 * them. `ez2_lamp_from_name` is the inverse and is case-insensitive; -1 when
 * nothing matches. These are what a lights.ini spells. */
const char *ez2_lamp_name(int channel);
int         ez2_lamp_from_name(const char *name);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_LAMPS_H */
