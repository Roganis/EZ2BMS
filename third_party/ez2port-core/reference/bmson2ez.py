#!/usr/bin/env python3
"""bmson2ez - turn a bmson song folder into a route-3 package for the EZ2AC port.

SPDX-License-Identifier: GPL-3.0-or-later
Part of the EZ2DECOMP port. See ../LICENSE.

WHAT COMES OUT (see ../BMSON.md, section 7): one folder per song under --out,
named by the song KEY, holding everything the port needs and nothing ciphered:

    <key>/
      song.ini                         the table entry: title, artist, the
                                       charts per mode and tier, the assets
      <mode>1p-<key>[-hd|-shd|-ex].ez  plaintext EZFF (version 8 records)
      <same>.ezi                       plaintext keysound index
      <same>.ini                       [General] / [JudgmentDelta] / [GaugeUpDownRate]
      *.ssf                            the samples, 16-bit PCM under the 18-byte header
      disc.abm  songname.abm  eyecatch.abm   the wheel's art (Final EX .abm)
      preview.ssf                      the wheel's snippet
      <bga file>                       the movie, copied (or --link)

Every layout here mirrors a reader in ../ez2: chart.c (EZFF), ezi.c, ssf.c,
songini.c, abm.c. If one of those changes, this file is where the writer
lives. The lane-to-track map is NOT hardcoded: it is read from the game's own
plaintext `system/<mode>/<mode>.gds`, which is why --root is required.

WHAT IS LOST, and said out loud in the report: bmson stops become gaps (exact
in time, but the notes keep scrolling); mines, release notes and invisible
notes are dropped; a chart needing more than 2048 keysound slots is fine for
the port and flagged as too many for the original; `total` does not map to
EZ2's gauge (the defaults are written), `judge_rank` scales the windows.

Deps: Python 3.8+, ffmpeg on PATH (audio decode), Pillow (art) and numpy
(audio) - each step degrades to a warning if its dependency is missing.
"""
import argparse
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
from collections import OrderedDict

# ---- constants that mirror ../ez2 ---------------------------------------------

TICKS_PER_QUARTER = 48        # 192 per 4/4 measure, chart.c / songini.h
EZFF_VERSION = 8              # wide records: 13 bytes (chart.c record_size)
TRACK_COUNT = 64              # "64 in every modern chart"
KEYSOUND_SLOTS = 0x800        # ezi.c: the ORIGINAL's table; the port may raise it
HOLD_BIAS = 6                 # chart.c ez2_note_hold_ticks
NAME_LEN = 64

# abm.c kXor[5]: Final EX. {dataStart, width, height, bpp}
ABM_XOR = (0x109A, 0xCFA1, 0x51AE, 0xB18F)

# songini.h: the missing-file defaults and the shipped norm
JUDGE_DEFAULT = {"Kool": 9, "Cool": 27, "Good": 53, "Miss": 73}
GAUGE_DEFAULT = {"Cool": 0.2, "Good": 0.1, "Miss": -1.8, "Fail": -4.8}

# gds.h: the input slots. bmson x (rizu's canonical ez2 numbering) -> slot.
CANON_X_TO_SLOT = {
    1: 15, 2: 23,               # 1P / 2P scratch (15/16 and 23/24 share a lane)
    10: 17, 20: 25,             # 1P / 2P pedal
    11: 10, 12: 11, 13: 12, 14: 13, 15: 14,      # 1P keys 1-5
    21: 18, 22: 19, 23: 20, 24: 21, 25: 22,      # 2P keys 1-5
    31: 6, 32: 7, 33: 8, 34: 9,                  # effectors EF1-4 = keys 6-9
}

# rizu ChartDecoder.lua: ez2-* hint -> (port mode name, gds folder / file prefix)
MODES = OrderedDict([
    ("ez2-5k-only",    ("5KeyMix",    "5keymix")),
    ("ez2-5k-scratch", ("ScratchMix", "scratchmix")),
    ("ez2-ruby",       ("RubyMix",    "rubymix")),
    ("ez2-5k",         ("StreetMix",  "streetmix")),
    ("ez2-7k",         ("7StreetMix", "7streetmix")),
    ("ez2-10k",        ("ClubMix",    "clubmix")),
    ("ez2-14k",        ("SpaceMix",   "spacemix")),
])
PLAIN_HINTS = {"beat-5k": "ez2-5k", "beat-7k": "ez2-7k",
               "beat-10k": "ez2-10k", "beat-14k": "ez2-14k",
               "beat-5k-fp": "ez2-5k", "beat-10k-fp": "ez2-10k"}

# rizu's legacy BMS-style numbering, per hint: x -> column name
LEGACY_X = {
    "ez2-5k-only": {1: "key1", 2: "key2", 3: "key3", 4: "key4", 5: "key5"},
    "ez2-ruby": {1: "key1", 2: "key2", 3: "key3", 4: "key4", 5: "key5",
                 7: "pedal1", 8: "scratch1"},
    "ez2-5k": {1: "key1", 2: "key2", 3: "key3", 4: "key4", 5: "key5",
               7: "pedal1", 8: "scratch1"},
    "ez2-7k": {1: "key1", 2: "key2", 3: "key3", 4: "key4", 5: "key5",
               6: "key6", 7: "key7", 8: "scratch1", 9: "pedal1"},
    "ez2-10k": {1: "key1", 2: "key2", 3: "key3", 4: "key4", 5: "key5",
                7: "pedal1", 8: "scratch1",
                11: "key6", 12: "key7", 13: "key8", 14: "key9", 15: "key10",
                16: "scratch2"},
    "ez2-14k": {1: "key1", 2: "key2", 3: "key3", 4: "key4", 5: "key5",
                6: "key6", 7: "key7", 8: "scratch1",
                9: "key8", 10: "key9", 11: "key10", 12: "key11", 13: "key12",
                14: "key13", 15: "key14", 16: "scratch2"},
}
LEGACY_X["ez2-5k-scratch"] = {1: "key1", 2: "key2", 3: "key3", 4: "key4",
                              5: "key5", 8: "scratch1"}
# the foot-pedal variants put the pedal on x6 / x14
LEGACY_FP = {
    "beat-5k-fp": {1: "key1", 2: "key2", 3: "key3", 4: "key4", 5: "key5",
                   6: "pedal1", 8: "scratch1"},
    "beat-10k-fp": {1: "key1", 2: "key2", 3: "key3", 4: "key4", 5: "key5",
                    6: "pedal1", 8: "scratch1",
                    9: "key6", 10: "key7", 11: "key8", 12: "key9", 13: "key10",
                    14: "pedal1", 16: "scratch2"},
}


def column_to_slot(col, hint):
    """rizu column name -> gds input slot, per mode."""
    if col == "scratch1":
        return 15
    if col == "scratch2":
        return 23
    if col == "pedal1":
        return 17
    m = re.match(r"key(\d+)$", col)
    if not m:
        return None
    k = int(m.group(1))
    if 1 <= k <= 5:
        return 9 + k
    if hint in ("ez2-7k", "ez2-14k") and 6 <= k <= 9:
        return k                      # slots 6..9 are the effector keys
    if hint == "ez2-10k" and 6 <= k <= 10:
        return 12 + k                 # 2P keys 1-5 = slots 18..22
    if hint == "ez2-14k" and 10 <= k <= 14:
        return 8 + k
    return None


# ---- the .gds: slot -> SongTrack ------------------------------------------------

def find_ci(directory, name):
    """A child of `directory` matching `name` case-insensitively, or None."""
    if not os.path.isdir(directory):
        return None
    low = name.lower()
    for e in os.listdir(directory):
        if e.lower() == low:
            return os.path.join(directory, e)
    return None


def load_gds_tracks(root, gds_folder):
    """{input slot: song track} from `system/<mode>/<mode>.gds`'s [Slot1]."""
    sysdir = find_ci(root, "system")
    mdir = find_ci(sysdir, gds_folder) if sysdir else None
    gds = find_ci(mdir, gds_folder + ".gds") if mdir else None
    if not gds:
        raise SystemExit("cannot find system/%s/%s.gds under %s"
                         % (gds_folder, gds_folder, root))
    slot_to_track = {}
    in_slot1 = False
    keys = None
    with open(gds, "r", encoding="latin-1") as f:
        for raw in f:
            line = raw.strip()
            if line.startswith("["):
                in_slot1 = line.lower() == "[slot1]"
                continue
            if not in_slot1:
                continue
            m = re.match(r"Key\s*=\s*(-?\d+)\s*,\s*(-?\d+)", line)
            if m:
                keys = [int(m.group(1)), int(m.group(2))]
                continue
            m = re.match(r"SongTrack\s*=\s*(\d+)", line)
            if m and keys is not None:
                for k in keys:
                    if k >= 0:
                        slot_to_track[k] = int(m.group(1))
                keys = None
    if not slot_to_track:
        raise SystemExit("no [Slot1] tracks in %s" % gds)
    return slot_to_track


# ---- bmson reading --------------------------------------------------------------

def detect_hint(info, path):
    """rizu's rule: chart_name keywords first, then mode_hint."""
    name = (str(info.get("chart_name") or "") + " " +
            os.path.basename(path)).lower()
    kw = [("7street", "ez2-7k"), ("7radio", "ez2-7k"), ("space", "ez2-14k"),
          ("club", "ez2-10k"), ("10radio", "ez2-10k"), ("ruby", "ez2-ruby"),
          ("5radio", "ez2-5k"), ("street", "ez2-5k"), ("scratch", "ez2-5k-scratch"),
          ("5key", "ez2-5k-only")]
    hint = str(info.get("mode_hint") or "").lower()
    for k, h in kw:
        if k in name:
            return h, "chart_name"
    if hint in MODES:
        return hint, "mode_hint"
    if hint in PLAIN_HINTS:
        return PLAIN_HINTS[hint], "mode_hint(legacy)"
    return None, None


def detect_tier(info, path):
    """NM / HD / SHD / EX from the file name or chart_name; NM by default."""
    text = (os.path.basename(path) + " " + str(info.get("chart_name") or "")).lower()
    for tier, pat in (("SHD", r"(^|[^a-z])s\.?hd([^a-z]|$)"),
                      ("HD", r"(^|[^a-z])hd([^a-z]|$)"),
                      ("EX", r"(^|[^a-z])ex([^a-z]|$)"),
                      ("NM", r"(^|[^a-z])nm([^a-z]|$)")):
        if re.search(pat, text):
            return tier
    return "NM"


def lane_map_for(hint, info):
    """x -> gds slot for this chart: canonical unless the notes say legacy."""
    mode_hint = str(info.get("mode_hint") or "").lower()
    if mode_hint in LEGACY_FP:
        cols = LEGACY_FP[mode_hint]
        return {x: column_to_slot(c, hint) for x, c in cols.items()}, "legacy-fp"
    if mode_hint.startswith("beat-"):
        cols = LEGACY_X[hint]
        return {x: column_to_slot(c, hint) for x, c in cols.items()}, "legacy"
    return dict(CANON_X_TO_SLOT), "canonical"


class Timeline(object):
    """bmson pulses -> EZ ticks, with stops folded in as gaps.

    A stop of d pulses at pulse y delays everything after y by d pulses of
    time at the BPM in force at y. Inserting d pulses into the timeline at y
    - shifting every later event by d - is the same delay to the tick, since
    those inserted pulses are traversed at that same BPM. The notes keep
    scrolling through the gap where the original would have frozen them;
    that is the one visible difference, and it is reported."""

    def __init__(self, resolution, stops):
        self.res = float(resolution)
        self.stops = sorted(((int(s["y"]), int(s.get("duration", 0))) for s in stops),
                            key=lambda s: s[0])
        self.worst_err = 0.0        # in ticks

    def shift(self, y):
        d = 0
        for sy, sd in self.stops:
            if sy < y:
                d += sd
            else:
                break
        return y + d

    def tick(self, y):
        exact = self.shift(y) * TICKS_PER_QUARTER / self.res
        t = int(math.floor(exact + 0.5))
        self.worst_err = max(self.worst_err, abs(exact - t))
        return t

    def ticks(self, pulses):
        exact = pulses * TICKS_PER_QUARTER / self.res
        return int(math.floor(exact + 0.5))


class Tempo(object):
    """tick -> seconds, from the (shifted) BPM points. Mirrors ez2_tempo_seconds."""

    def __init__(self, init_bpm, points):
        pts = [(0, float(init_bpm) if init_bpm else 120.0)]
        for t, b in sorted(points):
            if b > 0:
                pts.append((t, float(b)))
        self.points = pts

    def seconds(self, tick):
        sec = 0.0
        for i, (t, b) in enumerate(self.points):
            nxt = self.points[i + 1][0] if i + 1 < len(self.points) else None
            if nxt is None or tick < nxt:
                return sec + max(0, tick - t) * 60.0 / (b * TICKS_PER_QUARTER)
            sec += (nxt - t) * 60.0 / (b * TICKS_PER_QUARTER)
        return sec


# ---- audio ----------------------------------------------------------------------

RATE = 44100
CHANNELS = 2


class AudioBank(object):
    """Decoded samples, sliced on demand, written as .ssf."""

    def __init__(self, src_dir, out_dir, report):
        self.src_dir = src_dir
        self.out_dir = out_dir
        self.report = report
        self.cache = {}
        self.written = {}
        try:
            import numpy
            self.np = numpy
        except ImportError:
            self.np = None
            report.warn("numpy missing: samples are NOT converted")

    def decode(self, name):
        if name in self.cache:
            return self.cache[name]
        path = find_ci(self.src_dir, name)
        if path is None:
            # bmson names may carry the wrong extension (.wav for an .ogg)
            stem = os.path.splitext(name)[0]
            for ext in (".ogg", ".wav", ".flac", ".mp3"):
                path = find_ci(self.src_dir, stem + ext)
                if path:
                    break
        pcm = None
        if path and self.np is not None:
            try:
                raw = subprocess.run(
                    ["ffmpeg", "-v", "error", "-i", path, "-f", "s16le",
                     "-ac", str(CHANNELS), "-ar", str(RATE), "-"],
                    check=True, stdout=subprocess.PIPE).stdout
                pcm = self.np.frombuffer(raw, dtype=self.np.int16).reshape(-1, CHANNELS)
            except (OSError, subprocess.CalledProcessError) as e:
                self.report.warn("ffmpeg failed on %s: %s" % (name, e))
        elif path is None:
            self.report.warn("sample missing: %s" % name)
        self.cache[name] = pcm
        return pcm

    def slice_file(self, name, start_s, end_s):
        """The .ssf (base name) holding [start_s, end_s) of `name`; end None = rest."""
        if not name:
            # a channel with no file: the notes are real, the sound is silence
            if "silence.wav" not in self.written.values():
                write_ssf(os.path.join(self.out_dir, "silence.ssf"), b"\0" * (CHANNELS * 2 * 64))
                self.written[("", 0, None)] = "silence.wav"
            return "silence.wav"
        key = (name, round(start_s * 1000), None if end_s is None else round(end_s * 1000))
        if key in self.written:
            return self.written[key]
        stem = re.sub(r"[^A-Za-z0-9_\-]", "_", os.path.splitext(name)[0])[:40]
        if key[1] == 0 and key[2] is None:
            base = stem
        else:
            base = "%s_%d_%s" % (stem, key[1], "end" if key[2] is None else key[2])
        pcm = self.decode(name)
        if pcm is not None:
            a = int(start_s * RATE)
            b = len(pcm) if end_s is None else min(len(pcm), int(end_s * RATE))
            seg = pcm[a:b] if a < b else pcm[0:0]
            write_ssf(os.path.join(self.out_dir, base + ".ssf"), seg.tobytes())
        self.written[key] = base + ".wav"      # the .ezi spells .wav; ez2_ezi_resolve swaps
        return base + ".wav"


def write_ssf(path, pcm_bytes, channels=CHANNELS, rate=RATE, bits=16):
    """ssf.c: channels u16, rate u32, byte_rate u32, block_align u16, bits u16,
    data_bytes u32, then the PCM. No magic; the fields must agree."""
    align = channels * bits // 8
    hdr = struct.pack("<HIIHHI", channels, rate, rate * align, align, bits, len(pcm_bytes))
    with open(path, "wb") as f:
        f.write(hdr)
        f.write(pcm_bytes)


# ---- EZFF writing ---------------------------------------------------------------

def name_field(s):
    b = s.encode("latin-1", "replace")[:NAME_LEN - 1]
    return b + b"\0" * (NAME_LEN - len(b))


def note_record(tick, key_index, hold_ticks):
    length = hold_ticks + HOLD_BIAS if hold_ticks > 0 else 0
    # tick u32, type, key u16, velocity, pan, kind, length u16 = 12 bytes; the
    # version-8 record is 5 + 8 = 13 (chart.c record_size), one pad byte.
    return struct.pack("<IBHBBBH", tick, 1, key_index, 127, 64, 0, length) + b"\0"


def bpm_record(tick, bpm):
    return struct.pack("<IBf", tick, 3, bpm) + b"\0" * 4


def write_ezff(path, title, bpm, tracks, total_ticks):
    """chart.c's layout, inverted: 0x96 header, then per track a 0x4e header
    ("EZTR", name at +6, ticks u32 at +0x46, bytes u32 at +0x4a) and the
    fixed-width records."""
    hdr = bytearray(0x96)
    hdr[0:4] = b"EZFF"
    hdr[5] = EZFF_VERSION
    hdr[0x06:0x46] = name_field(title)
    hdr[0x46:0x86] = name_field("")
    struct.pack_into("<H", hdr, 0x86, 4 * TICKS_PER_QUARTER)
    struct.pack_into("<f", hdr, 0x88, float(bpm))
    struct.pack_into("<H", hdr, 0x8c, TRACK_COUNT)
    struct.pack_into("<I", hdr, 0x8e, total_ticks)
    struct.pack_into("<f", hdr, 0x92, float(bpm))
    with open(path, "wb") as f:
        f.write(hdr)
        for t in range(TRACK_COUNT):
            recs = tracks.get(t, [])
            recs.sort(key=lambda r: r[0])
            body = b"".join(r[1] for r in recs)
            last = recs[-1][0] if recs else 0
            th = bytearray(0x4e)
            th[0:4] = b"EZTR"
            th[0x06:0x46] = name_field("track%02d" % t)
            struct.pack_into("<I", th, 0x46, last)
            struct.pack_into("<I", th, 0x4a, len(body))
            f.write(th)
            f.write(body)


# ---- art -------------------------------------------------------------------------

def write_abm(path, image):
    """A 24-bit bottom-up BMP with "AW" for "BM" and the four header fields
    XORed with the Final EX masks (abm.c kXor[5], OFF_DATASTART/WIDTH/HEIGHT/BPP)."""
    w, h = image.size
    rgb = image.convert("RGB")
    row = w * 3
    pad = (4 - row % 4) % 4
    pixels = bytearray()
    px = rgb.load()
    for y in range(h - 1, -1, -1):
        for x in range(w):
            r, g, b = px[x, y]
            pixels += bytes((b, g, r))
        pixels += b"\0" * pad
    data_start = 0x36
    hdr = bytearray(0x36)
    hdr[0:2] = b"AW"
    struct.pack_into("<I", hdr, 2, data_start + len(pixels))
    struct.pack_into("<I", hdr, 0x0a, data_start ^ ABM_XOR[0])
    struct.pack_into("<I", hdr, 0x0e, 40)
    struct.pack_into("<I", hdr, 0x12, w ^ ABM_XOR[1])
    struct.pack_into("<I", hdr, 0x16, h ^ ABM_XOR[2])
    struct.pack_into("<H", hdr, 0x1a, 1)
    struct.pack_into("<I", hdr, 0x1c, 24 ^ ABM_XOR[3])
    struct.pack_into("<I", hdr, 0x22, len(pixels))
    with open(path, "wb") as f:
        f.write(hdr)
        f.write(pixels)


def round_disc(img):
    """The wheel's disc is a CIRCLE: every shipped `system/disc/*.abm` is a
    256x256 square whose art fills a radius-125 circle and whose corners are
    the key colour, exact black, which the engine drops (abm.c). Pure black
    inside the circle would be dropped too, so the art's own black is lifted
    to (1,1,1) - opaque under an exact key, invisible to the eye."""
    px = img.load()
    w, h = img.size
    cx, cy, r = (w - 1) / 2.0, (h - 1) / 2.0, 125.0
    for y in range(h):
        for x in range(w):
            if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                px[x, y] = (0, 0, 0)
            elif px[x, y] == (0, 0, 0):
                px[x, y] = (1, 1, 1)
    return img


def make_art(src_dir, info, out_dir, report):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        report.warn("Pillow missing: no disc / songname / eyecatch art")
        return {}
    made = {}

    def load(name):
        if not name:
            return None
        p = find_ci(src_dir, name)
        if not p:
            report.warn("image missing: %s" % name)
            return None
        try:
            return Image.open(p).convert("RGB")
        except OSError as e:
            report.warn("cannot read %s: %s" % (name, e))
            return None

    # bmson's eyecatch_image is the BMS stagefile - the jacket - and its
    # title_image the title card; the wheel's disc wants the jacket.
    jacket = load(info.get("eyecatch_image")) or load(info.get("title_image")) \
        or load(info.get("back_image"))
    if jacket:
        # the wheel's disc is 256x256; centre-crop to square, then fit
        w, h = jacket.size
        s = min(w, h)
        disc = jacket.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
        write_abm(os.path.join(out_dir, "disc.abm"), round_disc(disc.resize((256, 256), Image.LANCZOS)))
        made["Disc"] = "disc.abm"
        eye = load(info.get("title_image")) or load(info.get("back_image")) or jacket
        write_abm(os.path.join(out_dir, "eyecatch.abm"), eye.resize((1024, 512), Image.LANCZOS))
        made["Eyecatch"] = "eyecatch.abm"
    # the title PLATE is art the wheel draws, not a string. The shipped ones
    # are a bold sans, white, antialiased, RIGHT-aligned with the ink ending
    # at x=246, nine-pixel capitals on a baseline at row 23 - so: the closest
    # bold sans on the machine (EZ2_TITLE_FONT names one), sized by its
    # capital height, squeezed to fit a long title. Black is the colour key.
    plate = Image.new("RGB", (256, 32), (0, 0, 0))
    draw = ImageDraw.Draw(plate)
    font = None
    cands = [os.environ.get("EZ2_TITLE_FONT", "")] + [
        "/usr/share/fonts/TTF/Roboto-Bold.ttf", "/usr/share/fonts/roboto/Roboto-Bold.ttf",
        "/usr/share/fonts/truetype/roboto/unhinted/Roboto-Bold.ttf",
        "/usr/share/fonts/TTF/OpenSans-Bold.ttf", "/usr/share/fonts/truetype/open-sans/OpenSans-Bold.ttf",
        "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf", "C:\\Windows\\Fonts\\segoeuib.ttf"]
    title = str(info.get("title") or "")
    for cand in cands:
        if cand and os.path.exists(cand):
            # size for a nine-pixel capital
            probe = ImageFont.truetype(cand, 40)
            hb = probe.getbbox("H")
            cap40 = (hb[3] - hb[1]) if hb else 28
            size = max(6, int(round(40 * 9.0 / cap40)))
            font = ImageFont.truetype(cand, size)
            while font.getlength(title) > 242 and size > 6:
                size -= 1
                font = ImageFont.truetype(cand, size)
            break
    if font is None:
        font = ImageFont.load_default()
    width = font.getlength(title) if hasattr(font, "getlength") else 100
    draw.text((246 - width, 23), title, fill=(255, 255, 255), font=font, anchor="ls")
    write_abm(os.path.join(out_dir, "songname.abm"), plate)
    made["Songname"] = "songname.abm"
    return made


# ---- the report -----------------------------------------------------------------

class Report(object):
    def __init__(self):
        self.lines = []
        self.warnings = []

    def say(self, s):
        self.lines.append(s)
        print(s)

    def warn(self, s):
        self.warnings.append(s)
        print("  ! " + s)


# ---- one chart ------------------------------------------------------------------

def convert_chart(path, root, key, out_dir, bank, report, judge_scale):
    with open(path, "r", encoding="utf-8-sig") as f:
        d = json.load(f)
    info = d.get("info", {})
    hint, how = detect_hint(info, path)
    if hint is None:
        report.warn("%s: no EZ2 mode in chart_name or mode_hint (%r) - skipped"
                    % (os.path.basename(path), info.get("mode_hint")))
        return None
    mode_name, folder = MODES[hint]
    tier = detect_tier(info, path)
    slot_to_track = load_gds_tracks(root, folder)
    x_to_slot, numbering = lane_map_for(hint, info)
    report.say("  %s -> %s %s (%s, %s lanes)" % (os.path.basename(path), mode_name, tier, how, numbering))

    res = int(info.get("resolution") or 240)
    tl = Timeline(res, d.get("stop_events") or [])
    if tl.stops:
        report.warn("%d stop(s) converted to gaps: timing kept, the scroll does not freeze"
                    % len(tl.stops))

    # tempo points on the shifted tick grid
    bpm_points = [(tl.tick(int(e["y"])), float(e["bpm"])) for e in d.get("bpm_events") or []]
    init_bpm = float(info.get("init_bpm") or 120.0)
    tempo = Tempo(init_bpm, bpm_points)

    # tracks: key lanes from the .gds, everything else is an auto track
    used = set(slot_to_track.values())
    auto_tracks = [t for t in range(20, TRACK_COUNT) if t not in used] + \
                  [t for t in range(0, 20) if t not in used]
    tracks = {}
    auto_busy = {}          # tick -> set of auto tracks holding a note there
    keysounds = OrderedDict()   # .wav name -> slot index (1-based)
    dropped = {"mine": 0, "up": 0, "invisible": 0, "unmapped": 0}
    stats = {"notes": 0, "holds": 0, "auto": 0, "slices": 0}
    unmapped_x = set()

    def slot_for(name):
        if name not in keysounds:
            keysounds[name] = len(keysounds) + 1
        return keysounds[name]

    for ch in d.get("sound_channels") or []:
        name = ch.get("name") or ""
        notes = sorted(ch.get("notes") or [], key=lambda n: int(n["y"]))
        # each note plays [offset, next note's time) of the sample: offset 0 for
        # a fresh hit, the elapsed time since the last fresh hit for `c: true`
        times = [tempo.seconds(tl.tick(int(n["y"]))) for n in notes]
        notes = [n for n in notes if not n.get("up")]
        dropped["up"] += len(ch.get("notes") or []) - len(notes)
        times = [tempo.seconds(tl.tick(int(n["y"]))) for n in notes]
        # WHICH SLICE A NOTE PLAYS. bmson: a note plays its channel's sample
        # from 0 (fresh) or from where the previous playback had got to
        # (`c`), until the channel's next note. In the engine a retrigger of
        # the same file cuts the previous copy by itself, so a fresh hit
        # followed by another fresh hit is the whole file, unsliced. A cut is
        # only needed where the NEXT note continues (it is a different file,
        # so the previous copy would ring on), and a continuation is always
        # its own [offset, next) slice.
        last_fresh = None
        for i, n in enumerate(notes):
            x = int(n.get("x") or 0)
            t_now = times[i]
            if n.get("c") and last_fresh is not None:
                start = t_now - last_fresh
            else:
                start = 0.0
                last_fresh = t_now
            nxt_cont = i + 1 < len(notes) and bool(notes[i + 1].get("c"))
            if start == 0.0 and not nxt_cont:
                fname = bank.slice_file(name, 0.0, None)
            else:
                end = None
                if i + 1 < len(notes):
                    end = max(start + 0.0005, start + (times[i + 1] - t_now))
                fname = bank.slice_file(name, start, end)
                stats["slices"] += 1
            idx = slot_for(fname)
            tick = tl.tick(int(n["y"]))
            hold = tl.ticks(int(n.get("l") or 0))
            if x == 0:
                track = None
                for t in auto_tracks:
                    if tick not in auto_busy.get(t, ()):
                        track = t
                        break
                if track is None:
                    track = auto_tracks[0]
                auto_busy.setdefault(track, set()).add(tick)
                stats["auto"] += 1
                tracks.setdefault(track, []).append((tick, note_record(tick, idx, 0)))
                continue
            slot = x_to_slot.get(x)
            track = slot_to_track.get(slot) if slot is not None else None
            if track is None:
                dropped["unmapped"] += 1
                unmapped_x.add(x)
                # keep the sound: it plays as an auto note
                t2 = auto_tracks[0]
                tracks.setdefault(t2, []).append((tick, note_record(tick, idx, 0)))
                continue
            stats["notes"] += 1
            if hold > 0:
                stats["holds"] += 1
            tracks.setdefault(track, []).append((tick, note_record(tick, idx, hold)))

    for _ in d.get("mine_channels") or []:
        dropped["mine"] += 1
    for _ in d.get("key_channels") or []:
        dropped["invisible"] += 1

    for tick, bpm in bpm_points:
        tracks.setdefault(0, []).append((tick, bpm_record(tick, bpm)))

    total = 0
    for recs in tracks.values():
        for tick, _ in recs:
            total = max(total, tick)
    suffix = {"NM": "", "HD": "-hd", "SHD": "-shd", "EX": "-ex"}[tier]
    stem = "%s1p-%s%s" % (folder, key, suffix)
    write_ezff(os.path.join(out_dir, stem + ".ez"), str(info.get("title") or key),
               init_bpm, tracks, total + TICKS_PER_QUARTER)

    with open(os.path.join(out_dir, stem + ".ezi"), "w", encoding="latin-1", errors="replace") as f:
        for name, idx in keysounds.items():
            f.write("%d 1 %s\n" % (idx, name))

    level = int(info.get("level") or 0)
    jr = float(info.get("judge_rank") or 100.0) / 100.0 * judge_scale
    with open(os.path.join(out_dir, stem + ".ini"), "w") as f:
        f.write("[General]\nLevel = %d\nMeasureScale = 1.6\n\n" % level)
        f.write("[JudgmentDelta]\n")
        for k in ("Kool", "Cool", "Good", "Miss"):
            f.write("%s = %d\n" % (k, max(1, int(round(JUDGE_DEFAULT[k] * jr)))))
        f.write("\n[GaugeUpDownRate]\n")
        for k in ("Cool", "Good", "Miss", "Fail"):
            f.write("%s = %g\n" % (k, GAUGE_DEFAULT[k]))

    report.say("    notes %d (holds %d), auto %d, keysound slots %d, worst rounding %.3f tick"
               % (stats["notes"], stats["holds"], stats["auto"], len(keysounds), tl.worst_err))
    if len(keysounds) > KEYSOUND_SLOTS:
        report.warn("%d keysound slots: over the original's 0x800 (the port can be raised)"
                    % len(keysounds))
    if unmapped_x:
        report.warn("%d note(s) on lanes this mode does not have (x=%s) play as auto notes"
                    % (dropped["unmapped"], sorted(unmapped_x)))
    for k in ("mine", "up", "invisible"):
        if dropped[k]:
            report.warn("%d %s note(s) dropped: EZ2AC has none" % (dropped[k], k))
    if info.get("total") not in (None, "", 100, 100.0):
        report.warn("bmson total=%s ignored: EZ2's gauge starts full and fails at zero, "
                    "the defaults are written" % info.get("total"))
    return {"mode": mode_name, "tier": tier, "level": level, "stem": stem,
            "info": info, "bga": d.get("bga") or {}, "tempo": tempo, "tl": tl, "bmson": d}


# ---- the song -------------------------------------------------------------------

def song_key_for(folder, override):
    if override:
        k = override
    else:
        k = re.sub(r"[^a-z0-9]", "", os.path.basename(os.path.normpath(folder)).lower())
    if not k:
        raise SystemExit("cannot derive a song key from %r; pass --key" % folder)
    return k[:15]


PREVIEW_SECONDS = 20.0        # the shipped system/preview/*.ssf run 18-20 s
PREVIEW_FADE = 1.0            # rizu KeysoundPreview.fadeTime
PREROLL_MIN = 20.0            # rizu prerollThreshold: a sample this long is background


def channel_events(d, tl, tempo):
    """Every note of every sound channel as (t, name, start, end): the sample
    offset it plays from and where it is cut (None = plays out). The same
    rule convert_chart uses for its slices, restated over seconds."""
    out = []
    for ch in d.get("sound_channels") or []:
        name = ch.get("name") or ""
        if not name:
            continue
        notes = sorted((n for n in (ch.get("notes") or []) if not n.get("up")),
                       key=lambda n: int(n["y"]))
        times = [tempo.seconds(tl.tick(int(n["y"]))) for n in notes]
        last_fresh = None
        for i, n in enumerate(notes):
            t = times[i]
            if n.get("c") and last_fresh is not None:
                start = t - last_fresh
            else:
                start = 0.0
                last_fresh = t
            end = None
            if i + 1 < len(notes):
                end = start + max(0.0005, times[i + 1] - t)
            out.append((t, name, start, end))
    out.sort(key=lambda e: e[0])
    return out


def make_preview(charts, bank, out_dir, src_dir, info, report):
    """`preview_music` if it exists; else a mixdown built the way rizu's
    KeysoundPreview plays a chart in its song select (sphere/ui/keysound_plan.lua):
    EVERY note's sound, playable and backing alike, over a window that starts a
    quarter of the way into the song (aligned to the next note), with long
    background samples that were already sounding at the window start seeked
    in as prerolls, and a one-second fade at both edges."""
    pm = info.get("preview_music")
    if pm and find_ci(src_dir, pm):
        pcm = bank.decode(pm)
        if pcm is not None:
            write_ssf(os.path.join(out_dir, "preview.ssf"), pcm[:int(RATE * 30)].tobytes())
            return "preview.ssf"
    if bank.np is None or not charts:
        return None
    np = bank.np
    c = charts[0]
    events = channel_events(c["bmson"], c["tl"], c["tempo"])
    if not events:
        return None
    first_t, last_t = events[0][0], events[-1][0]
    want = first_t + (last_t - first_t) * 0.25
    win_start = next((e[0] for e in events if e[0] >= want), first_t)
    win_end = win_start + PREVIEW_SECONDS
    frames = int(RATE * PREVIEW_SECONDS)
    mix = np.zeros((frames, CHANNELS), dtype=np.int64)
    placed = prerolls = 0

    def put(at_s, pcm, start_s, end_s):
        a0 = int(start_s * RATE)
        a1 = len(pcm) if end_s is None else min(len(pcm), int(end_s * RATE))
        if a1 <= a0:
            return 0
        seg = pcm[a0:a1]
        o = int(at_s * RATE)
        if o < 0:
            seg = seg[-o:]
            o = 0
        seg = seg[:frames - o]
        if len(seg) <= 0:
            return 0
        mix[o:o + len(seg)] += seg
        return 1

    # the window's own notes
    for t, name, start, end in events:
        if t < win_start:
            continue
        if t >= win_end:
            break
        pcm = bank.decode(name)
        if pcm is None:
            continue
        placed += put(t - win_start, pcm, start, end)
    # prerolls: per sample, the latest hit before the window whose sound is
    # still running at the window start and is long enough to be background
    latest = {}
    for t, name, start, end in events:
        if t >= win_start:
            break
        latest[name] = (t, start, end)
    for name, (t, start, end) in latest.items():
        pcm = bank.decode(name)
        if pcm is None:
            continue
        length = len(pcm) / float(RATE)
        if length < PREROLL_MIN:
            continue
        sound_end = t + ((end if end is not None else length) - start)
        if sound_end <= win_start:
            continue
        placed += put(t - win_start, pcm, start, end)   # negative offset: seeked in
        prerolls += 1
    if placed == 0:
        return None
    # fades and level
    fade = int(RATE * PREVIEW_FADE)
    ramp = np.linspace(0.0, 1.0, fade)[:, None]
    mix[:fade] = (mix[:fade] * ramp).astype(np.int64)
    mix[-fade:] = (mix[-fade:] * ramp[::-1]).astype(np.int64)
    peak = int(np.abs(mix).max()) or 1
    if peak > 32000:
        mix = (mix * (32000.0 / peak)).astype(np.int64)
    write_ssf(os.path.join(out_dir, "preview.ssf"), mix.astype(np.int16).tobytes())
    report.say("  preview: %d s from %.1f s in, %d notes and %d background preroll(s)"
               % (int(PREVIEW_SECONDS), win_start, placed - prerolls, prerolls))
    return "preview.ssf"


def convert_song(folder, args, report):
    files = sorted(f for f in os.listdir(folder) if f.lower().endswith(".bmson")
                   and not f.startswith("__"))
    if not files:
        report.warn("%s: no .bmson" % folder)
        return
    key = song_key_for(folder, args.key)
    sound = find_ci(args.root, "sound")
    if sound and find_ci(sound, key):
        report.warn("key %r collides with a shipped song folder; pass --key" % key)
        if not args.force:
            return
    out_dir = os.path.join(args.out, key)
    if os.path.isdir(out_dir):
        if not args.force:
            report.warn("%s exists; --force replaces it" % out_dir)
            return
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    report.say("%s -> %s" % (folder, out_dir))

    bank = AudioBank(folder, out_dir, report)
    charts = []
    for f in files:
        c = convert_chart(os.path.join(folder, f), args.root, key, out_dir, bank, report,
                          args.judge_scale)
        if c:
            charts.append(c)
    if not charts:
        return
    info = charts[0]["info"]
    made = make_art(folder, info, out_dir, report)
    prev = make_preview(charts, bank, out_dir, folder, info, report)

    # the background: the first bga_header file, copied or linked
    bga_line = None
    bga = charts[0]["bga"]
    header = bga.get("bga_header") or []
    events = bga.get("bga_events") or []
    if header:
        by_id = {h.get("id"): h.get("name") for h in header}
        first = sorted(events, key=lambda e: int(e.get("y") or 0))[0] if events else None
        name = by_id.get(first.get("id")) if first else header[0].get("name")
        src = find_ci(folder, name) if name else None
        if src and os.path.splitext(name)[1].lower() in (".mp4", ".webm", ".mkv", ".avi", ".wmv", ".mpg", ".mpeg", ".mov"):
            dst = os.path.join(out_dir, os.path.basename(src))
            if args.link:
                os.symlink(os.path.abspath(src), dst)
            else:
                shutil.copy2(src, dst)
            c = charts[0]
            start_ms = int(round(c["tempo"].seconds(c["tl"].tick(int(first.get("y") or 0))) * 1000)) if first else 0
            bga_line = (os.path.basename(src), start_ms)
        elif name:
            report.warn("background %s is not a movie; no BGA written" % name)

    with open(os.path.join(out_dir, "song.ini"), "w", encoding="utf-8") as f:
        f.write("[Song]\nKey = %s\nTitle = %s\nArtist = %s\nGenre = %s\nSource = %s\nConverter = bmson2ez 1\n\n"
                % (key, info.get("title") or key, info.get("artist") or "",
                   str(info.get("genre") or "").strip('"'), os.path.basename(os.path.normpath(folder))))
        f.write("[Charts]\n")
        for c in charts:
            f.write("%s.%s = %d ; %s.ez\n" % (c["mode"], c["tier"], c["level"], c["stem"]))
        f.write("\n[Assets]\n")
        for k, v in made.items():
            f.write("%s = %s\n" % (k, v))
        if prev:
            f.write("Preview = %s\n" % prev)
        if bga_line:
            f.write("\n[Bga]\nFile = %s\nStartMs = %d\n" % bga_line)
    n_ssf = len([e for e in os.listdir(out_dir) if e.endswith(".ssf")])
    report.say("  wrote %d chart(s), %d .ssf, song.ini" % (len(charts), n_ssf))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folders", nargs="+", help="bmson song folder(s)")
    ap.add_argument("--root", required=True, help="the game root (for system/<mode>/<mode>.gds)")
    ap.add_argument("--out", default="userdata/songs", help="package root (default userdata/songs)")
    ap.add_argument("--key", help="song key (default: from the folder name; 15 chars max)")
    ap.add_argument("--link", action="store_true", help="symlink the movie instead of copying")
    ap.add_argument("--force", action="store_true", help="replace an existing package")
    ap.add_argument("--judge-scale", type=float, default=1.0,
                    help="extra multiplier on the judgement windows (default 1.0)")
    args = ap.parse_args()
    if len(args.folders) > 1 and args.key:
        ap.error("--key applies to one folder")
    report = Report()
    for folder in args.folders:
        if not os.path.isdir(folder):
            report.warn("not a folder: %s" % folder)
            continue
        convert_song(folder, args, report)
    if report.warnings:
        print("\n%d warning(s):" % len(report.warnings))
        for w in report.warnings:
            print("  - " + w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
