/* The operator TEST MENU's page model - SystemMenu @0x4747a0.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The cabinet has a test menu behind its TEST button, and this is its page
 * widget: a title, up to 32 rows, and a cursor. A row is a LABEL, and where
 * it is a setting rather than a caption it also carries the list of values it
 * cycles through. `SystemMenu` in ../../include/systemmenu.h is the class;
 * everything below is read off it.
 *
 * ---- why the port wants one ----------------------------------------------
 *
 * It is the only place in the game's own shape where a machine-level setting
 * belongs, and the port has settings the cabinet never had - the key map
 * first among them. Putting those on a play key would be exactly the kind of
 * invention this project keeps removing; putting them behind the TEST button,
 * on their own page, is where an operator would look and costs the game's
 * own screens nothing.
 *
 * ---- the model, from the class -------------------------------------------
 *
 *   m_index      the selected row
 *   m_rowCount   how many rows are in use; setLabel opens a row the first
 *                time an index is written and bumps the count
 *   m_rowPitch   0x20 - the row spacing the page draws at
 *   m_choiceX    0x118 - where a row's VALUE is drawn, its label at the left
 *   m_language   0 or 1; every label, choice and title is stored per language
 *
 * and two navigation steps, which are the whole of its input vocabulary:
 *
 *   nextRow    @0x4744c0   `do { ++i; if (i >= n) i = 0; }
 *                           while (!rows[i].enabled);`
 *                          - so a caption row (one with no choices, marked
 *                            not-enabled) is SKIPPED, and the wrap is at the
 *                            row count rather than at 32.
 *   prevChoice @0x474490   `if (--value < 0) value = choiceCount - 1;`
 *                          - the value steps DOWN and wraps to the LAST
 *                            choice; update2 @0x474660 calls it on EFFECT 4.
 *   (inline in update2)    `value++; if (value >= choiceCount) value = 0;`
 *                          - the value UP, on TEST or EFFECT 1, and the
 *                            cursor UP on 1P START (`m_index--`, wrapping
 *                            to the last enabled row).
 *
 * ---- what the owner hears ------------------------------------------------
 *
 * The page reports through its sink as `onMenu(what, item, value)`, and
 * TestModeSink::onMenu @0x4763e0 shows the two cases: `what == 1` is "row
 * `item`'s value changed" and `what == 0` is "row `item` was activated",
 * which is what opens a sub-page. A page closing reports `what == 2`.
 *
 * ---- what the cabinet's buttons do ---------------------------------------
 *
 * Read off the pages' own update2:
 *
 *   input 1  TEST      enters, and leaves any page
 *                      (`getState(1) != 2` guards every page's body)
 *   input 6  FX1       also leaves a page (TestVideo @0x4771a0); on the
 *                      input-test page it is 6 AND 8 held together
 *   inputs 2/4/5       service and the two starts - step within a page
 *                      (TestVideo cycles its own index on any of them)
 *
 * ---- and what the PORT's pages do with them ------------------------------
 *
 * The same five buttons, split so that every job has one behind the coin door
 * and one on the panel, and so that the cursor can go both ways:
 *
 *   SERVICE, P2 START   the cursor DOWN a row (captions skipped) - nextRow
 *   P1 START            the cursor UP - update2's own 1P START block
 *   FX1, TEST           step the selected row's value UP (update2's arm)
 *   FX4                 step it DOWN - prevChoice
 *   TEST                ...and on a row with NO values, open it: a key map,
 *                       a sub-page, BACK, EXIT
 *
 * The divergence is deliberate and small: the cabinet's own pages step one
 * way and use TEST only to leave, which is fine for four rows of read-only
 * hardware tests and poor for a settings page of eleven.
 *
 * NO CAPTIONS ARE TRANSCRIBED HERE. The menu's labels are .rdata in the
 * original and the decomp carries only their addresses; the port writes its
 * own English.
 */
#ifndef EZ2_TESTMENU_H
#define EZ2_TESTMENU_H

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_MENU_ROWS     32    /* SystemMenu::m_rows[32] */
#define EZ2_MENU_CHOICES  16    /* the class allows 112; nothing needs them */
#define EZ2_MENU_TEXT     64    /* char[0x40], as the class stores them */
#define EZ2_MENU_PITCH    0x20  /* m_rowPitch */
#define EZ2_MENU_CHOICE_X 0x118 /* m_choiceX */

typedef struct ez2_menu_row {
    int  open;                              /* setLabel has been called */
    int  enabled;                           /* the cursor may land here */
    int  choice_count;
    int  value;                             /* which choice is selected */
    char label[EZ2_MENU_TEXT];
    char choices[EZ2_MENU_CHOICES][EZ2_MENU_TEXT];
} ez2_menu_row;

typedef struct ez2_menu {
    char          title[EZ2_MENU_TEXT];
    int           index;                    /* m_index */
    int           row_count;                /* m_rowCount */
    ez2_menu_row  rows[EZ2_MENU_ROWS];
} ez2_menu;

void ez2_menu_init(ez2_menu *m, const char *title);

/* Open row `index` with a label. A row with NO choices is a caption: the
 * cursor skips it, which is `enabled` in the class. */
void ez2_menu_label(ez2_menu *m, int index, const char *label);
/* One of a row's values. Adding the first makes the row selectable. */
void ez2_menu_choice(ez2_menu *m, int index, int slot, const char *text);
/* Label plus every choice in one call - addEntry @0x474600. `choices` may be
 * NULL for a caption row. */
void ez2_menu_entry(ez2_menu *m, int index, const char *label,
                    const char *const *choices, int count);

/* nextRow @0x4744c0 - the cursor to the next ENABLED row, wrapping. Does
 * nothing when no row is selectable, rather than spinning forever. */
void ez2_menu_next_row(ez2_menu *m);
/* update2 @0x474660's 1P START block - the cursor to the previous ENABLED
 * row, wrapping to the last. */
void ez2_menu_prev_row(ez2_menu *m);
/* update2's TEST / EFFECT 1 arm - the selected row's value up one, wrapping
 * to the first. */
void ez2_menu_next_choice(ez2_menu *m);
/* prevChoice @0x474490 (EFFECT 4) - the selected row's value down one,
 * wrapping to its last choice. */
void ez2_menu_prev_choice(ez2_menu *m);

/* The selected row's current choice text, or "" when it has none. */
const char *ez2_menu_value(const ez2_menu *m, int index);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_TESTMENU_H */
