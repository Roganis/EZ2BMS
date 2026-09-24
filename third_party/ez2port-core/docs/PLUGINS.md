# Plugins

> **PROVISIONAL — the design is not settled, do not build against it yet.**
> This works and is tested, but it was written before the decision that
> per-player options, lane covers and the rest belong in the CORE rather than
> behind an extension interface. What a plugin should be for is being
> reconsidered in the light of that; the message format below may change
> without a `proto` bump until this notice comes off.

A plugin is a **separate program**. The port runs it and writes one JSON object
per line to its standard input. That is the entire interface.

    ez2play --plugin "python3 plugins/ez2rank.py --out ranking.json"

or `EZ2_PLUGIN` in the environment. With no plugin nothing changes, and a
`--plugin` naming a program that is not there is a logged line rather than a
failure to start.

## Why it is shaped like this

Four decisions, each doing work:

* **Out of process, so a plugin cannot take a cabinet down.** This runs
  unattended with someone standing in front of it. An in-process plugin that
  segfaults or blocks for 200 ms is a dead machine mid-song. A child that dies
  is noticed, logged once, and ignored.
* **Out of process also settles the licence.** The port is GPL-3.0 and code
  linked into it inherits that. A separate program at the end of a pipe is at
  arm's length, so **a plugin may be any licence, in any language**.
* **JSON lines, because the point is that anyone can write one.** A binary
  format would be smaller and would need a parser in every language somebody
  wants to use. `for line in sys.stdin:` needs nothing.
* **One way, for now.** The port talks and the plugin listens. A plugin that
  could talk back needs a policy for what it may change, and there is no
  good answer to that until the port has parity to change things *in*.

Not the oracle trace, which is also a stream and already existed: its records
are the judgement model's internals - the slot state before and after every
sink call - which is the right vocabulary for byte-exact replay and the wrong
one for "somebody finished a song". It is also game-derived data. The shape
was borrowed; none of the records were.

## What stays still

Everything a message names is fixed by the **original**: the mode names, the
tier names, the six judgements, the rank letters, the song keys. They cannot
drift, because the game they came from is finished.

That is why this is safe to publish while the rest of the port is still being
built. Nothing here exposes the renderer, the scene graph or the session
machine, all of which are still moving. **The plugin API is the part of the
port that the original already froze.**

`proto` is bumped when a field changes or disappears. New fields may appear at
any time without a bump, so **ignore what you do not recognise**.

## The messages

    {"ev":"hello","proto":1,"port":"ez2play"}

Sent once at startup, so a plugin can refuse a protocol it does not know
instead of guessing.

    {"ev":"stage_result","t":1756700001,
     "key":"streetmix/babydance/hd",
     "mode":"StreetMix","song":"Babydance","tier":"HD","level":12,
     "player":"ROGANIS","stage":2,"rounds":3,
     "score":1300000,"notes":1000,"max_combo":950,
     "rate":97.4212,"rank":"S",
     "counts":{"kool":950,"cool":50,"good":0,"miss":0,"fail":0},
     "cleared":true,"failed":false,"place":0}

Sent when a stage finishes, before the result screen is drawn.

* **`key` is what you store and look up.** `mode`, `song` and `tier` are
  spelled the way the game's data spelled them, and that data is *not*
  consistent about case - of 436 song keys only 340 match their own folder
  exactly (`ez2/vfs.h`). Key on those and one chart becomes two rows the first
  time somebody reaches it a different way, and their best score appears to
  vanish. `key` is lowercase and slash-joined, and the port emits it precisely
  so that every plugin identifies a chart the same way without having to know
  any of that. It is readable rather than a hash, so you can grep for it in
  somebody's ranking file when they say a score went missing.
* `rate` and `rank` are **what the player saw** - `rank` comes from
  `ez2_score_grade`, which picks the ladder by score model, because CV2Mix
  grades on (KOOL+COOL) hits where everything else grades on the score rate.
  A leaderboard that disagreed with the result screen would be visibly wrong.
* `counts` is **named, not an array**. `fail` and `miss` are different things -
  FAIL is the mash band, MISS is a note nobody pressed - and the underlying
  enum numbers KOOL=1..MISS=5 while the game's own grades run the other way.
* `place` is the local ranking slot 0..4, or -1.
* Strings carry **whatever bytes the game's data had**. The song table is not
  UTF-8, so nothing is re-encoded; quotes, backslashes, newlines and control
  characters are escaped, bytes above 0x7f are not.

## Writing one

Read lines, parse, act. `plugins/ez2rank.py` is a complete worked example in
about a hundred lines - it keeps a best-score-per-chart table and can POST each
stage to an HTTP endpoint - and it is meant to be read as much as run.

Three things a plugin on a cabinet should do, all of which that example does:

1. **Never raise.** The port survives a plugin that crashes; the plugin does
   not, and then it stops doing its job.
2. **Check `proto`.** One line, and it turns a silent misread into a message.
3. **Do the work on EOF.** Closing your stdin is the port's goodbye - it waits
   briefly for you afterwards - so `for line in sys.stdin:` gets a clean end
   and a chance to write your file.

## The return channel, and why there isn't one yet

The first real consumer is the NFC card reader (`../cardreader/`, firmware in
`VSCODE/test/`). Its design names three hooks it wants from the game:

| | | |
|---|---|---|
| **H1** | a card is present, before the player picks a mode | needs the port to listen |
| **H2** | apply the card's options before song select | needs the port to listen |
| **H3** | a stage finished - song, score, grade, place | **`stage_result` already is this** |

`plugins/ez2card.py` is H3, working, translating the port's events into the
reader's own `@CMD` vocabulary. H1 and H2 need the port to *accept* messages,
which this protocol deliberately does not do.

Adding a return channel is the obvious next step and it is not free. What
makes the current design safe is that a plugin cannot affect the game: it
cannot block it, crash it, or change what it does. The moment the port reads
from a plugin, all three come back - a read that blocks is a frozen cabinet, a
message applied at the wrong moment is a corrupted session, and "what may a
plugin change" becomes a policy question with real answers to get wrong.

If it is built, the shape that keeps the properties is: **non-blocking reads,
drained once per frame at a known safe point, applying only to a small
explicit set of things** (the player's name and their options, before song
select) - not a general "set any setting" command. A plugin that says nothing
must be indistinguishable from no plugin.

## The limit, stated plainly

**Events are sent at stage boundaries only**, a handful per session. That is
what makes it safe for the port to write directly to the pipe with no queue and
no thread: a session cannot fill a pipe buffer, so a write cannot block.

**That argument dies the moment anything per-frame or per-note is added.** At
60 Hz a plugin that pauses for a second is sixty unread messages and the buffer
is gone in seconds - and a full pipe means the game blocks, which on a cabinet
is a freeze. Adding faster events means adding a ring buffer and a writer
thread that **drops on overflow** first. The dropping is the point, not the
thread.
