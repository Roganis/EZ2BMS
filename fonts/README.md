# Fonts

The faces title plates are rendered with, the same everywhere: a plate made
on one machine is byte for byte the plate made on another, and the one
EZ2PORT makes (`crates/ez2bms-media`, text.rs; `docs/ez2port-compat.md`).

| File                   | Face                      | In git | Licence                                 |
| ---------------------- | ------------------------- | ------ | --------------------------------------- |
| `Roboto-Bold.ttf`      | Latin titles              | yes    | Apache-2.0 (`LICENSE-Apache-2.0.txt`)   |
| `NotoSansCJK-Bold.ttc` | Korean, Japanese, Chinese | no     | OFL-1.1 (`LICENSE-OFL-NotoSansCJK.txt`) |

`Roboto-Bold.ttf` is EZ2PORT's own copy (SHA-256
`72313c7cc819179bc7f81cfdee0e97366532de23df65e7fee3c9afa983f1beaf`).

`NotoSansCJK-Bold.ttc` is 20 MB, so it is fetched rather than committed:

    node scripts/fetch-fonts.mjs

It downloads `Sans/OTC/NotoSansCJK-Bold.ttc` from notofonts/noto-cjk at tag
`Sans2.004` and checks it against the SHA-256 pinned in the script. The
desktop app ships it as a bundle resource; without it, a plate with CJK
text is refused (the Latin face would draw boxes) and tests that need it
skip. CI fetches it (cached).

The collection holds five faces - Japanese, Korean, Simplified Chinese,
Traditional Chinese (Taiwan), Traditional Chinese (Hong Kong) - which draw
the shared ideographs in each region's forms; a plate chooses one, as
EZ2PORT's `@cjk` does.
