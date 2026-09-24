# Attribution and licence compliance

The port is **GPL-3.0-or-later** (`port/LICENSE`). That is a deliberate choice
made by the project owner so that code from **2EZConfig V2** can be reused.

## Upstream work incorporated

**2EZConfig V2** — Copyright (C) 2026 kasaski — GPL-3.0-or-later
Vendored into this tree: `port/2EZConfig-V2-master/` (added 2026-08-10 by the
owner; identical to the field-proven copy at
`/run/media/roganis/DATA/2EZ-config ASIO/2EZConfig-V2-master/`)
Upstream: a rewrite of 2EZConfig (https://github.com/ben-rnd/2EZConfig)

Relevant to this port:

| module | what it gives us |
| --- | --- |
| `src/2ez-dll/ez2dj-io/` | cabinet I/O emulation, ports 0x100–0x106 |
| `src/2ez-dll/ddraw/` | DirectDraw fixes for modern GPUs |
| `src/2ez-dll/audio-eq/` | mixer + Hypersonik hooks, 44.1 kHz |
| `src/common/include/game_defs.h`, `game_md5.h` | release identification |
| `patches/` (JSON) | known RVAs and pattern-scan patches |

Our target is **Final:EX** (`ez2ac_fn_ex`).

## The Steinberg ASIO SDK, which is in here too

Vendored inside 2EZConfig at `2EZConfig-V2-master/src/libs/hypersonik/asio/`
(`asio.h`, `asiosys.h`, `iasiodrv.h`, `asiolist.{h,cpp}`) and used by
`src/libs/hypersonik/src/asio-out.cpp`.

**Steinberg ASIO SDK 2.3** — Copyright (C) 1997–2019 Steinberg Media
Technologies GmbH — **dual licensed: proprietary agreement OR GPLv3**, since
Steinberg's relicensing of October 2025. We take it under **GPLv3**, which is
what makes it compatible with this tree.

Two things follow, and neither is optional:

1. **GPLv3 obligations apply to it as to everything else here** — the notices
   in those files stay intact, and a distributed binary containing them needs
   its corresponding source offered.
2. **"ASIO" and the ASIO logo are trademarks**, separate from the copyright
   licence. Under the GPLv3 route using the name or logo is *optional*; if used
   it must follow Steinberg's usage guidelines. This port does not currently
   compile any of it, so nothing here carries the branding.

Upstream's own `2EZConfig-V2-master/THIRD_PARTY_LICENSES` attributes these
files to spice2x under GPL-3.0. That is the right outcome by a slightly wrong
route — spice2x could not itself relicense Steinberg's header — but since
Steinberg has granted GPLv3 for SDK 2.3, the result stands.

**`port/platform/common/ezasio.c` uses these headers** - it is the port's ASIO
backend, and it includes `asio.h` and `asiosys.h` from the vendored copy rather
than taking a second one. The two `platform/*/CMakeLists.txt` add that
directory as an include path on Windows only. Nothing links against a library:
an ASIO driver is loaded by CLSID at run time, so the SDK contributes headers
and nothing else.

`asiolist.{h,cpp}` and `asio-out.cpp` are **not** used - the port enumerates
drivers from the registry itself and drives them through its own hand-declared
vtable, in C. The row below records that.

| our file | upstream file | nature of the change |
| --- | --- | --- |
| `platform/common/ezasio.c` | Steinberg ASIO SDK 2.3 headers (`asio.h`, `asiosys.h`) | independent implementation written against the SDK's types; no upstream code copied. The SDK is used under its GPLv3 option. |

## stb_truetype

`third_party/stb_truetype.h` - v1.26, Sean Barrett / RAD Game Tools, public
domain (or MIT, at the user's choice; the licence text is at the end of the
file). Used by `ez2/ttf.c` to rasterise an imported song's title plate from
a TrueType face found on the machine (or `EZ2_TITLE_FONT`). No font file is
shipped with the port.

## Roboto Bold

`third_party/fonts/Roboto-Bold.ttf` - Copyright 2011 Google Inc., Apache
License 2.0 (`third_party/fonts/LICENSE-Apache-2.0.txt`, `NOTICE.txt`). The
face the game's own songname plates appear to be set in; the port renders an
imported song's title plate, version badge and category label with it
(ez2/ttf.c). The build copies the three files to `fonts/` beside the
executable and into the drop-in folder.

## Fira Sans Light

`third_party/fonts/FiraSans-Light.ttf` - Copyright 2012-2015 The Mozilla
Foundation and Telefonica S.A., SIL Open Font License 1.1
(`third_party/fonts/LICENSE-OFL-FiraSans.txt`). The closest light geometric
sans to the shipped `Sortimage/category_NN` labels; the port renders its
CUSTOM category label with it (ez2/ttf.c). Copied beside the executable and
into the drop-in folder with the other font.

## Rules when reusing it — these are obligations, not style

1. **Keep every copyright and licence notice intact.** Do not strip kasaski's
   header off a file you adapt.
2. **Mark what you changed.** A file derived from 2EZConfig must carry a
   prominent notice saying it was modified, by whom, and when.
3. **Record it here.** Every file in `port/` that contains or adapts upstream
   code gets a row in the table below. If the table is wrong, compliance is
   wrong.
4. **The whole port is GPL-3.0.** Anything linked into it inherits that,
   including the decomp sources in `../src` — see the note below.
5. **Ship the source.** Any distributed binary needs its corresponding source
   available under the same terms.

## Derived files in this tree

| our file | upstream file | nature of the change |
| --- | --- | --- |
| `2EZConfig-V2-master/` (whole tree) | 2EZConfig V2 | vendored verbatim; the files below are the only modifications |
| `2EZConfig-V2-master/src/2ez-dll/dll.cpp` | same path upstream | modified 2026-08-10 (EZ2DECOMP): include + install + shutdown calls for the oracle-trace feature, three lines, each marked |
| `2EZConfig-V2-master/src/2ez-dll/CMakeLists.txt` | same path upstream | modified 2026-08-10 (EZ2DECOMP): adds `oracle_trace.cpp` and `../ez2/trace.c` to the 2EZ target, marked |
| `2EZConfig-V2-master/src/2ez-dll/oracle_trace.{h,cpp}` | *(new files, ours)* | the capture hook (docs/oracle-trace.md); written for this tree's hook/logger/settings APIs, GPL-3.0 like everything here |
| `2EZConfig-V2-master/src/2ez-dll/oracle_screen.{h,cpp}` | *(new files, ours)* | the screen oracle (tools/oracle/README.md): records every present, draw and blit of the running game and drives it from an input script; GPL-3.0 |
| `2EZConfig-V2-master/src/2ez-dll/screen_trace.{h,cpp}` | same path upstream | modified 2026-09-08 (EZ2DECOMP): a screen observer callback and the current screen's vftable, for the screen oracle; installs when `oracle_screen` asks even without `trace_screens`; marked |
| `2EZConfig-V2-master/src/2ez-dll/ddraw/ddraw7_fix.cpp` | same path upstream | modified 2026-09-08 (EZ2DECOMP): the DrawPrimitive hook reports each draw to the screen oracle, and the hook chain installs when `oracle_screen` asks; marked lines |
| `2EZConfig-V2-master/src/2ez-dll/ez2dj-io/ez2dj_io_input.{h,cpp}` | same path upstream | modified 2026-09-08 (EZ2DECOMP): a scripted port state - the input poll stands down and the script's button levels, coin pulses and turntable positions feed the emulated I/O board; marked blocks |
| `2EZConfig-V2-master/src/2ez-dll/dll.cpp` | same path upstream | modified 2026-09-08 (EZ2DECOMP): install + shutdown for the screen oracle, two marked lines |
| `2EZConfig-V2-master/src/2ez-dll/CMakeLists.txt` | same path upstream | modified 2026-09-08 (EZ2DECOMP): adds `oracle_screen.cpp` and `../ez2/oscript.c`, marked |

## Knowledge sources — a different obligation

Two files were written from format documentation rather than from code. That is
not copying, and it does not put them in the table above, but the provenance is
worth recording because the *facts* came from someone else's reverse
engineering:

| our file | knowledge source | what was taken |
| --- | --- | --- |
| `ez2/crypt.c` | `../wip/crypt.cpp` (this repo's own decomp) | the cipher's structure, decoded from `DecryptFile` @0x410a40 |
| `ez2/abm.c` | `../../EZ2REWRITE/reverse-engineering/file-formats.md` and `src/bga/abm.lua`, which credit freem's `ezabm.c` | the `.abm` header layout and the per-era XOR tables |

Both are C written against a written specification, not translations of the
Lua. The XOR tables are reverse-engineered constants — facts about a file
format — and are published in several places; they are reproduced here so the
decoder can read data the user already owns.

## The decomp side is a separate question

`../src` and `../include` are the byte-matching decompilation. The port links
those sources, so a distributed port binary is a combined work and needs them
under a GPL-3.0-compatible licence.

**That was settled on 2026-08-09** (decomp commit `e255bfc`): the repository
root carries `../LICENSE`, GPL-3.0, which covers `../src` and `../include` and
makes a binary built from them plus `port/` distributable as one work. This
section previously said there was no root LICENSE and that port binaries must
not be distributed; that has not been true since that commit. The wider risks
that a licence does *not* address — the game's own assets, the key tables, the
`bring-your-own-exe` model — are in `../docs/DISTRIBUTION.md`, and those are
the ones still worth reading before publishing anything.

## Song titles (`text/manifest.songs.ini`)

The 492 song titles and subtitles in the generated manifest are the
sibling `../../EZ2REWRITE` project's transcription of the game's own
`system/songname/*.abm` banners (`reference-impl/chartbase-ez2/songdb.lua`,
same author). They are the names of the songs as the game prints them, not
code; `tools/songtext.py` regenerates the file from that list.
