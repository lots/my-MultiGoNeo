# Study material

The inputs this project was built from, kept here so the repository root stays a clean,
cloneable app.

## `design/`

The visual target and the original design document, unchanged:

| File | What it is |
| --- | --- |
| `my-Fig-test2.png` | The MultiGo screenshot that started this evolution — the UI to reproduce. |
| `my-Fig-test.figcraft` | Original design document. `.figcraft` is a ZIP archive holding `document.json` and a `thumbnail.png`. |
| `my-Fig-test.png` | Flat render of that design. |
| `old-board/` | Three photographs of old go boards, used as the colour reference for the **Dark** theme. |

## `my-Sabaki/`

A source snapshot of the functional reference: **`lots/my-Sabaki`**, a study fork of
Sabaki 0.60.2, at commit
[`983f1096`](https://github.com/lots/my-Sabaki/commit/983f10966a9e8294ef752d1310d42254c3558ddd)
(2026-10-27).

The snapshot excludes `node_modules/`, `dist/`, the Electron/electron-builder caches,
`dev-data/` and the fork's own `.git` history, which keeps it at roughly 5.7 MB instead of
2.6 GB. Use the
[upstream repository](https://github.com/lots/my-Sabaki) to browse history, issues and
releases.

The app consumes this work through `../src/sabaki-entry.js` and the adapted modules in
`../src/vendor/` (`gametree.js`, `linecolor.js`, `dim.js`), which are released here under
the same MIT terms.

## Licences

- `my-Sabaki/` is MIT licensed — see [`my-Sabaki/LICENSE.md`](my-Sabaki/LICENSE.md),
  copyright © 2015-2020 Yichuan Shen and the Sabaki contributors.
- The app itself is MIT licensed — see [`../LICENSE`](../LICENSE).

The original design files are the copyright of their author and are included here
only as design provenance for this project.
