# The song file: `ez2bms.song.json`

A song folder holds one bmson per chart and this file, which keeps what bmson
has no place for: the key EZ2PORT files the song under, its category, and how
its package is dressed - title plate, disc, eyecatch, preview, BGA. The
charts stay complete bmson files that any editor opens; title, subtitle,
artist and genre live in them (the Song manager keeps them equal across
charts).

Read and written by chart-core `song/songfile.ts`. Like the charts, it is
byte-stable: known members are written in the fixed order below, members
EZ2BMS does not know are kept after them in their order, and a value EZ2BMS
cannot read is kept as it is and reported, never silently changed.

```json
{
  "key": "neonparade",
  "id": "4f0c7a2e-0d0e-4c6b-9a55-6f1e2b8c9d10",
  "category": 48,
  "classic": false,
  "plate": { "tint": "cyan-halo" },
  "disc": { "src": "art/jacket.png", "crop": { "x": 120, "y": 0, "w": 900, "h": 900 } },
  "eyecatch": {
    "src": "art/banner.png",
    "mode": "visible",
    "crop": { "x": 0, "y": 40, "w": 1280, "h": 960 }
  },
  "preview": { "startMs": 61500, "lengthMs": 25000 },
  "bga": { "file": "movie/intro.mp4", "startMs": -250 },
  "published": { "root": "D:/EZ2AC/ez2port/songs", "key": "neonparade" },
  "cabinet": { "key": "stay" },
  "source": {
    "from": "bms",
    "path": "D:/BMS/Neon Parade",
    "charts": { "streetmix1p-neonparade.bmson": "neon_n.bme" },
    "notes": [
      {
        "chart": "streetmix1p-neonparade.bmson",
        "rule": "bms-mines",
        "severity": "info",
        "message": "12 mines (D/E): EZ2 has none; left out"
      }
    ]
  }
}
```

Every member but `key` may be absent; absent means "as EZ2PORT's own bmson
importer would do it" wherever the importer has a rule.

| Member      | What it is                                                                                                                                                                                                                                                                                   | Absent                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `key`       | The package folder's name and song.ini `Key`: 1-15 of `a-z`, `0-9`                                                                                                                                                                                                                           | (required; lint offers to make one from the title)                                 |
| `id`        | A UUID written to song.ini's `[EZ2BMS] SongId`, telling this song's packages from others'                                                                                                                                                                                                    | made on the first publish                                                          |
| `category`  | song.ini `Category`, 1-48: the one bank the song is listed in (a package is not in ALL)                                                                                                                                                                                                      | 48, CUSTOM                                                                         |
| `classic`   | Classic-mode charting on or off                                                                                                                                                                                                                                                              | on when a chart already has continuation notes                                     |
| `plate`     | The title plate: `title`, `subtitle` (words other than the song's; `""` is no subtitle), `tint` (`white`, `green`, `cyan`, `orange-halo`, `cyan-halo`, `custom` with `ink` and `glow` as `rrggbb`), `cjk` (`jp`, `kr`, `sc`, `tc`, `hk`), or `image` (a 256x32 picture of your own)          | the song's title in white, CJK forms guessed from the words                        |
| `disc`      | `{ src, crop? }`: the image and the square cut to the disc; `null` for no disc                                                                                                                                                                                                               | the first chart's `eyecatch_image`, `title_image` or `back_image`, centred         |
| `eyecatch`  | `{ src, mode, crop? }`: `visible` fills the top-left 640x480 the select screen shows from the 4:3 `crop`; `stretch` squeezes the whole image; `null` for none                                                                                                                                | the first chart's `title_image`, `back_image` or `eyecatch_image`, stretched       |
| `preview`   | `{ chart?, file?, startMs?, lengthMs?, fadeMs? }`: a chart's mix (by file name) or an audio file, the window and its fades                                                                                                                                                                   | the first chart's mix, 20 s from the first note a quarter of the way in, 1 s fades |
| `bga`       | `{ file?, startMs? }`: the movie and the chart time its frame 0 shows at (ms, may be negative); `null` for none                                                                                                                                                                              | the first chart's earliest `bga_events` movie, at that event's time                |
| `published` | `{ root, key }`: where the song was last published, so a key change can offer to take the old package off the wheel                                                                                                                                                                          | nothing published yet                                                              |
| `cabinet`   | `{ key }`: the game song a cabinet export last went into (its folder under `sound/`), offered first the next time                                                                                                                                                                            | the song it was imported from (`source.key`), when there is one                    |
| `source`    | `{ from, key?, path?, charts?, notes? }`: what the song was imported from (`ez2ac`, `bms`, `bmson`), the game song's key, each chart's original file, and what the import could not bring across (shown in Issues). Kept for a cabinet export (M6) to write the song back where it came from | not imported                                                                       |

Paths are relative to the song folder with forward slashes, and are found in
any case, as EZ2PORT finds files.

What each setting becomes in the package, and where EZ2BMS departs from the
importer, is in `ez2port-compat.md`.
