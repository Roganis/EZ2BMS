/* EZ2AC oracle-trace format - the record stream the capture hook writes and
 * the replay tool reads.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Design: ../../docs/oracle-trace.md. The hook (not yet written; it needs the
 * 2EZConfig sources and a cabinet) detours the judgement sink
 * `PlayerSlot::commit` @0x42e620 and the stage teardown @0x42e360 in the
 * RUNNING game and records, per sink call, the inputs `(grade, count, flag)`
 * and the slot's state before and after; per stage, the director's parsed
 * rate block and the model globals. The replay side feeds the recorded
 * inputs through `ez2_score_commit` and diffs every field at every event.
 *
 * THIS FILE IS THE CONTRACT BETWEEN THE TWO. The writer half is plain C so
 * the future MSVC hook can lift trace.c verbatim; the reader parses byte-wise
 * (never a struct overlay - the project rule), little-endian on the wire
 * because the recording machine is x86 and the reader must not care what it
 * itself is.
 *
 * A TRACE IS GAME-DERIVED DATA. The stage snapshot carries gauge rates the
 * game parsed out of chart `.ini` files. port/.gitignore covers `*.trace`
 * and `traces/`; generate locally, never commit one.
 *
 * Wire format, version 1:
 *
 *     header:  "EZ2T"  u32 version
 *     records: u32 tag  u32 payload_size  payload
 *
 * Unknown tags are skipped by size, so the format can grow without breaking
 * an old reader. Two tags exist:
 *
 *     "STAG"   a stage began - snapshot of the director block and globals
 *     "EVNT"   one sink call
 */
#ifndef EZ2_TRACE_H
#define EZ2_TRACE_H

#include <stddef.h>
#include <stdio.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_TRACE_MAGIC   "EZ2T"
#define EZ2_TRACE_VERSION 1u

/* Version-1 wire sizes, header + payload per record. Exposed so a test can
 * address a field inside a written file without re-deriving the layout -
 * which is how the first version of the self-test perturbed the wrong
 * field. The reader itself never needs these beyond trace.c. */
#define EZ2_TRACE_HEADER_WIRE 8u
#define EZ2_TRACE_STATE_WIRE  (4u * 3 + 4u + 4u * 5 + 4u + 4u)
#define EZ2_TRACE_STAGE_WIRE  (8u + 4u * 2 + 4u * 5 + 4u * 5 + 4u * 3 + 4u * 6)
#define EZ2_TRACE_EVENT_WIRE  (8u + 4u * 7 + 2u * EZ2_TRACE_STATE_WIRE)

/* The slot state around one sink call - the fields @0x42e620 can touch.
 * `counts` is indexed by the GAME's grade numbering (1..5 = MISS, FAIL,
 * GOOD, COOL, KOOL - the counter block at +0x1c8..+0x1d8); [0] is unused.
 * `f1c0` is CV2's combo latch and `audience` the meter at +0x21c - both
 * recorded for attribution, neither asserted on by the replay (the port
 * models the latch as `cv2_started`, a bool, and the audience meter is
 * explicitly record-only per the design's section 5). */
typedef struct ez2_trace_state {
    long  combo;
    long  max_combo;
    long  score;
    float gauge;          /* the ORIGINAL's value - may go negative on the
                           * killing blow, where the port clamps to 0 */
    long  counts[6];
    long  f1c0;
    float audience;
} ez2_trace_state;

/* Snapshot at a stage's first event. `rate`/`audience_rate` are the director
 * block as the sink indexes it - `director + 0x308 + grade*4`, so [g] is what
 * game grade g does to the gauge; [0] unused. That positional read is the
 * whole point: these are the rates the GAME parsed, which is the live check
 * on songini.c's positional `.ini` reading. */
typedef struct ez2_trace_stage {
    unsigned long stage_id;
    unsigned long slot;            /* the original `this` - identifies 1P/2P */
    float         rate[6];
    float         audience_rate[6];
    float         f794;            /* director +0x794 */
    unsigned long fd18;            /* director +0xd18 - CV2 good-breaks-combo */
    unsigned long note_count;      /* +0xe105bc */
    unsigned long cv2_flag;        /* g_1b2eb6c - selects the CV2 model */
    unsigned long mode;            /* g_modeIndex */
    unsigned long alt_values;      /* g_1b2ea20 - the hard option's value table */
    unsigned long use_audience;    /* g_useAudiencePanel */
    unsigned long g_1b2e7d4;
    unsigned long elem_count;      /* g_elemCount */
} ez2_trace_stage;

/* One sink call. `ret_addr` is `_ReturnAddress()` inside the detour - the
 * address AFTER the 5-byte call, so site + 5. Attribute it with
 * ez2_trace_caller_name(), by enclosing-function range, never by comparing
 * against call-site constants. */
typedef struct ez2_trace_event {
    unsigned long   seq;
    unsigned long   stage_id;
    unsigned long   slot;
    unsigned long   ret_addr;
    long            grade;         /* game numbering, 1..5 */
    long            count;
    long            flag;
    ez2_trace_state before;
    ez2_trace_state after;
} ez2_trace_event;

/* ---- reading ------------------------------------------------------------- */

typedef struct ez2_trace_reader {
    const unsigned char *p;
    const unsigned char *end;
} ez2_trace_reader;

enum {
    EZ2_TRACE_END   = 0,      /* clean end of stream */
    EZ2_TRACE_STAGE = 1,      /* *stage was filled */
    EZ2_TRACE_EVENT = 2,      /* *event was filled */
    EZ2_TRACE_ERR   = -1      /* malformed - truncated record or bad header */
};

/* Validate the header. Returns 0 on success, EZ2_TRACE_ERR on a bad magic,
 * an unsupported version or a short buffer. The buffer must outlive the
 * reader; nothing is copied. */
int ez2_trace_reader_init(ez2_trace_reader *r, const void *buf, size_t n);

/* Step to the next record. Returns one of the enum values above; a record
 * with an unknown tag is skipped silently (forward compatibility). */
int ez2_trace_next(ez2_trace_reader *r, ez2_trace_stage *stage,
                   ez2_trace_event *event);

/* ---- writing ------------------------------------------------------------- *
 *
 * Used by the self-test's synthetic generator today and by the capture hook
 * when it exists. Byte-wise little-endian writes - portable, and safe for
 * the hook to buffer-and-flush. Each returns 0 on success, -1 on a short
 * write. */
int ez2_trace_write_header(FILE *f);
int ez2_trace_write_stage(FILE *f, const ez2_trace_stage *s);
int ez2_trace_write_event(FILE *f, const ez2_trace_event *e);

/* ---- attribution --------------------------------------------------------- *
 *
 * The sink's twelve call sites sit in four functions (disassembly-verified
 * 2026-08-10 - docs/oracle-trace.md section 0b):
 *
 *     0x42f4e0..0x42f873   an UNREAD function - five sites
 *     0x42f880..0x42fbe2   the hold sustain pump - four sites
 *     0x42fd90..0x4304fc   the keys commit - two sites (0x430271 = normal
 *                          path, 0x4304dd = the lane-swap variant, as
 *                          return addresses)
 *     0x422c6a exactly     SlotOwner::applyTracks @0x422bf0 (matched)
 *
 * Takes the RETURN address (site + 5). Returns a static string; never NULL. */
const char *ez2_trace_caller_name(unsigned long ret_addr);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_TRACE_H */
