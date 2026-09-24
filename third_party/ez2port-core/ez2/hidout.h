/* HID output reports: what a device's lights are, and how to write them.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ---- why this exists ----------------------------------------------------
 *
 * A light binding is a pair: a device, and WHICH output on it. 2EZConfig
 * numbers those outputs by asking Windows to parse the device's HID report
 * descriptor and then flattening the answer:
 *
 *     HidP_GetButtonCaps(HidP_Output, ...)   -> the on/off outputs, in order,
 *                                               each usage range expanded
 *     HidP_GetValueCaps (HidP_Output, ...)   -> the ranged outputs, after them
 *
 *     outputIdx <  buttonCount  ->  buttonOutputStates[outputIdx]
 *     outputIdx >= buttonCount  ->  valueOutputStates[outputIdx - buttonCount]
 *
 * (`src/libs/input/input_manager.cpp`, `InputManager::setLight`). That flat
 * index is what ends up in a saved binding, so a port that numbers its outputs
 * any other way would give the same device a different numbering and every
 * binding a person already has would point at the wrong lamp.
 *
 * There is no `HidP_` on Linux. So this parses the report descriptor itself
 * and produces the SAME flat order: every OUTPUT main item in the order the
 * descriptor declares it, bit-sized-1 items as buttons, everything else as
 * values, ranges expanded, constant padding skipped - which is what the
 * Windows parser reports. The point is not to be a general HID stack; it is to
 * agree with 2EZConfig about what "output 3" means.
 *
 * ---- and it builds the report too ---------------------------------------
 *
 * Knowing the outputs is half of it: something has to turn "output 3 is on"
 * into the bytes an interrupt-out endpoint wants. So each entry also carries
 * its report ID, its bit offset within that report and its bit width, and
 * `ez2_hid_out_report` serialises one report from the current values - the job
 * `deviceWriteOutput` does with HidP_SetButtons / HidP_SetUsageValue.
 *
 * No libraries, no device access, no SDL: a descriptor is a byte string, so
 * this is testable against a canned one with nothing plugged in. The code that
 * opens a real device is the platform seam's ezLights* (platform/platform.h).
 */
#ifndef EZ2_HIDOUT_H
#define EZ2_HIDOUT_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Generous for a lighting board: the biggest EZ2/IIDX-style I/O boards declare
 * a couple of dozen lamps. A descriptor with more outputs than this parses
 * fine, it is just truncated - and says so. */
#define EZ2_HID_MAX_OUT     128
#define EZ2_HID_MAX_REPORTS 8
#define EZ2_HID_MAX_REPORT_BYTES 64

/* One addressable output. */
typedef struct ez2_hid_out {
    unsigned short usage_page;
    unsigned short usage;
    unsigned char  report_id;   /* 0 when the descriptor declares no IDs */
    unsigned char  is_button;   /* 1 = one bit, 0 = a ranged value */
    unsigned short bit_offset;  /* within the report PAYLOAD, ID byte excluded */
    unsigned char  bit_size;
    int            logical_min;
    int            logical_max;
} ez2_hid_out;

/* One output report the device accepts. */
typedef struct ez2_hid_report {
    unsigned char  id;          /* 0 when the descriptor declares no IDs */
    unsigned short bits;        /* payload bits, ID byte excluded */
} ez2_hid_report;

typedef struct ez2_hid_outputs {
    ez2_hid_out    out[EZ2_HID_MAX_OUT];
    float          value[EZ2_HID_MAX_OUT];   /* 0..1, the live state */
    int            count;          /* buttons first, then values */
    int            button_count;   /* where the value half starts */
    int            truncated;      /* 1 if the descriptor had more than we hold */

    ez2_hid_report report[EZ2_HID_MAX_REPORTS];
    int            report_count;
    int            uses_ids;       /* 1 when a Report ID item was seen */
} ez2_hid_outputs;

/* Parse `desc` (`n` bytes, a raw HID report descriptor) into `out`.
 *
 * Returns the number of outputs found, or a negative ez2_hid_err. Zero is not
 * an error: most devices have no outputs at all, which is exactly what a
 * binding UI needs to be told so it can leave them off the list. */
int ez2_hid_parse(const unsigned char *desc, size_t n, ez2_hid_outputs *out);

/* Set one output, by 2EZConfig's flat index. `value` is clamped to 0..1; a
 * button is on above 0.5, matching setLight's own `value > 0.5f`. Returns 1
 * when the index existed. */
int ez2_hid_out_set(ez2_hid_outputs *o, int index, float value);

/* Every output back to zero. What a clean shutdown owes the cabinet - the
 * original's resetFlags @0x40c8f0 pushes zeros at the board on the way out. */
void ez2_hid_out_clear(ez2_hid_outputs *o);

/* Serialise report `slot` (0..report_count-1) into `buf`.
 *
 * The buffer gets the report ID first when the descriptor uses IDs, then the
 * payload, which is what a write to an hidraw/hidapi handle expects. Returns
 * the number of bytes written, or 0 if `slot` or `n` will not do. */
int ez2_hid_out_report(const ez2_hid_outputs *o, int slot,
                       unsigned char *buf, size_t n);

/* A short human label for an output, written into `buf`: the usage's name when
 * this file knows one ("Button 3", "LED Generic Indicator"), else the numbers.
 * For the binding UI's list. Returns `buf`. */
const char *ez2_hid_out_label(const ez2_hid_outputs *o, int index,
                              char *buf, size_t n);

enum ez2_hid_err {
    EZ2_HID_ERR_ARG  = -1,
    EZ2_HID_ERR_DESC = -2    /* malformed: an item runs off the end */
};

#ifdef __cplusplus
}
#endif

#endif /* EZ2_HIDOUT_H */
