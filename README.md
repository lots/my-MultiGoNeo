# MultiGo Neo

MultiGo Neo is a **tree-based Go SGF editor/player** for the desktop. Its functional
reference is [`lots/my-Sabaki`](https://github.com/lots/my-Sabaki) — a study fork of
Sabaki 0.60.2 — and its visual shell began life as **FigDesk**. Both study inputs are kept
in [`study/`](study/README.md).

This is the **core SGF editor milestone** of the migration: game tree and variations,
lossless SGF, comments, the full markup toolset, and the fork's coloured-line/dim extensions
are implemented. Scoring, GTP engines, alternate file formats, and the remaining MultiGo/
Sabaki features are planned for later phases.

![MultiGo Neo with a variation tree and the five-stone setup](preview.png)

## What is implemented

### Game tree and SGF

- Immutable `@sabaki/immutable-gametree` model with real variations.
- Sabaki-style **game graph** in the lower-right panel (columns for branches, connector
  lines, current path, comment badges, click to select).
- Play a move, create a variation by playing a different move from an earlier node, pass,
  and switch the player to move.
- Delete a node, make a variation main, shift it left/right, and remove sibling variations.
- Undo/redo across tree mutations.
- **Lossless SGF read/write** through `@sabaki/sgf`: unknown properties, variations, setup
  stones, comments, markup and the fork's coloured `AR`/`LN` and `DD`/`SBKDD` values survive
  a round trip.
- New games get `GM[1] FF[4] CA[UTF-8] AP[MultiGo Neo:1.0] SZ[…]`.

### Editing

- Tabbed **Info / Comment** panel; comments support a safe Markdown subset (bold, italic,
  inline code, links, headings, lists, blockquotes, line breaks).
- Edit tool strip: black/white stones, eraser, cross, triangle, square, circle, line, arrow,
  dim, label, and number.
- my-Sabaki palette for lines/arrows and dim rectangles: black, white, red, yellow, blue,
  green, plus the theme default.
- Coloured line/arrow values use the fork's optional third field:
  `LN[aa:ae:red]`, `AR[ha:he:blue]`.
- Dim uses standard inherited `DD[kk:mm]` plus the private `SBKDD[blue:kk:mm]` companion, so
  other SGF viewers still dim the correct area.
- Right-click erases the mark/line/dim rectangle/setup stone under the pointer (edit mode).
- Labels and numbers write `LB`; per-node comments write `C`; game comment writes `GC`.
- **AR is drawn at double the original stroke width; LN at triple.**
- The current move is marked with a **red triangle at the upper-right of the stone**.
- Board transformations and scoring are not in this milestone.

### Edit menu

The Edit menu now covers variation editing as well as display edits:

- Undo / redo, edit mode, game info, and node comments.
- **Cut / copy / paste the current variation** (system clipboard with an internal fallback).
- **Duplicate the current node**, **insert an empty node**, delete a node.
- Make a variation main, shift it left/right, remove sibling variations, and **flatten the
  current variation**.
- Clear node markup.
- Copy/paste the whole SGF.
- Keyboard: `Ctrl+Alt+C/X/V` for copy/cut/paste variation, `Ctrl+Alt+D/N` for
  duplicate/insert, and `Ctrl+Alt+F` for flatten.

### Move numbers

Move-number display is no longer a simple on/off switch:

- **No Move Numbers**
- **All Move Numbers**
- **Last 10 / 25 / 50 Moves**
- **Custom Move Count…**
- Numbering can start from the game start or the current variation start.
- The toolbar **Nums** button still toggles between none and all.

![Expanded Edit menu with variation, node and SGF operations](preview-edit-menu.png)

![Red triangle marking the most recent move](preview-last-move.png)

![Only the last ten moves carry numbers](preview-move-numbers.png)

### Workspace

- 13×13 default, with 9×9/19×19 presets and **custom boards from 2×2 to 52×52**.
- Custom size syntax is `width*height`, e.g. `5*9` (five columns, nine rows). The wood
  surface and grid are genuinely rectangular, and `SZ[5:9]` is written to the SGF.
- Invalid custom sizes keep the dialog open and show an inline error such as
  “Each side must be an integer from 2 to 52 (60*2).”
- **The last board size is remembered across launches**, including rectangular sizes; the
  Options menu can disable or re-enable this.
- Coordinates, move numbers, last-move marker, star points, textured board.
- Resizable board / Info / Game Tree / **Message** panes, remembered layout and preferences.
- The three right-hand panes can each be squeezed down to roughly **48 px**, giving the
  remaining pane almost the whole column.
- The message console has moved from the bottom edge into a resizable lower-right panel.
  The bottom status bar now contains only the status cells and the single lower rule.
- Electron native Open/Save dialogs remember the last folder, matching the fork's dialog
  convenience; the renderer has a browser download/file-picker fallback.

### View menu

The View menu now covers the practical MultiGo-style display controls:

- 9×9, 13×13, 19×19 and **Custom Board Size…**
- coordinates hidden or shown as **A1** or **1–1**, drawn on all four sides
- move numbers **none / all / last 10 / 25 / 50 / custom**, with start or variation numbering
- **Colorize Moves** (move-order rings)
- **Show Next Moves** and **Show Sibling Variations** as translucent stones
- **Zoom In / Out / Reset**
- **Toggle Full Screen** (`F11`)
- **Show Game Tree** and **Reset Panel Layout**

There is deliberately no Video menu; it is not part of the Go editor.

![Custom 5×9 board with 1–1 coordinates and move colorization](preview-custom.png)

![Expanded View menu with board, coordinate, numbering and zoom controls](preview-view-menu.png)

### Language and Options

- Options now offers **English / 简体中文**. Switching language immediately translates the
  menus, toolbar, tabs, panel titles, game-info labels, rules, status cells, dialogs and
  Options labels; the choice is persisted across reloads.
- The Chinese shell is demonstrated below:

![Bilingual Chinese interface](preview-chinese.png)

- Additional Options: **Remember Last Board Size**, an autoplay-delay selector (0.5/1/2/3 s),
  Preferences, and **Reset All Settings**.
- Runtime log entries and SGF/game content stay in their original language.

![Options menu with language, board-size memory and autoplay delay](preview-options-menu.png)

## Verification

5 tree/SGF tests (`npm test`) cover variations, unknown-property preservation, immutable
tree mutation, captures, custom rectangular sizes, the 52-point alphabet, and markup
round-trips. The legacy pure-Go helper tests remain available as `npm run test:legacy`.

The UI was driven in Chromium at exactly 1440×1024:

- played a main line and created a sibling variation from the root;
- undone/redone and deleted a node, then undone the deletion;
- placed a setup stone, cross, line, red line, dim rectangle, blue dim rectangle, number and
  label; erased the cross by right-clicking;
- wrote and previewed a Markdown comment;
- loaded an SGF containing an unknown `ZZ` property and two variations, then wrote it back
  with the same structure and values;
- created a **5×9** board through the Custom… dropdown, confirmed the rectangular surface,
  and checked the 52×52 and 2×52 limits;
- exercised the new View modes: 1–1 coordinates, variation numbering, colourisation,
  next/sibling hints, zoom, game-tree hiding, and reset;
- entered an invalid custom size (`60*2`), confirmed the dialog stayed open with the inline
  range error, then entered `5*9` successfully;
- reloaded the page and confirmed the **5×9 board** and the selected **Chinese** language
  both survive;
- resized the Message panel with its splitter and confirmed the bottom bar is now a single
  24 px status row with no message log;
- squeezed the Info, Game Tree and Message panes down to their small state, including a
  48 px Game Tree;
- verified AR/LN line widths of **3.6 px / 5.4 px**;
- used **Insert Empty Node**, **Duplicate**, **Copy/Paste Variation**, **Flatten** and
  **Cut** from the expanded Edit menu, restoring each with Undo;
- confirmed the last move is marked with a **red triangle**;
- switched move numbers through **none / all / last 10** and verified the menu checks;
- confirmed the autoplay icon is distinct from First Child, the status bar has only the lower
  rule, and the menu bar contains no Video item;
- no console exceptions.

Screenshots: [main editor](preview.png), [custom 5×9 board](preview-custom.png),
[View menu](preview-view-menu.png), [Edit menu](preview-edit-menu.png),
[red last-move triangle](preview-last-move.png), [last 10 move numbers](preview-move-numbers.png),
[Chinese interface](preview-chinese.png), [Options menu](preview-options-menu.png),
[edit tools](preview-edit.png) and [comment tab](preview-comment.png).

**Electron caveat:** the dependencies are installed (Electron 37.10.3), but the Electron
runtime cannot reach `app.ready` in this headless agent session (Chromium crashpad:
`not connected`). The native window, native dialogs and installers were not exercised here.
Run `npm start` from a normal interactive desktop terminal.

## Clone and run

```powershell
git clone https://github.com/lots/my-MultiGoNeo.git
cd my-MultiGoNeo
npm ci            # dependencies, including the Sabaki libraries and esbuild
npm start         # Electron window
```

`npm ci` restores `node_modules/` from `package-lock.json`. `src/sabaki-bundle.js` is
committed, so the browser preview works without a build step.

## Run

```powershell
npm start          # Electron window
npm test           # tree/SGF + go-board tests
npm run test:legacy
npm run bundle     # rebuild src/sabaki-bundle.js after changing src/vendor or src/sabaki-entry.js
```

Browser preview:

```powershell
start src\index.html
```

Standalone build:

```powershell
npm run pack       # unpacked app in release/win-unpacked
npm run dist:win   # NSIS installer + portable exe
```

Add an icon (`build/icon.ico` / `icon.icns` / `icon.png`), code signing and notarization
before distributing.

## Controls

| Action | How |
| --- | --- |
| Play | Click an intersection |
| Board size | Toolbar dropdown; `Custom…` accepts `5*9` |
| View modes | View menu: coordinates, numbers, hints, zoom |
| Language | Options → English / 简体中文 |
| Message panel | Lower-right panel; resize with its splitter, clear with Clear |
| Full screen | `F11` |
| Pass | `P` or toolbar Pass |
| Edit mode | `Ctrl+E` or the edit button |
| Tools | `Ctrl+1`…`Ctrl+9`; dim is `Ctrl+Shift+D` |
| Line/arrow/dim colour | Colour swatches in the edit bar |
| Erase a mark | Right-click it in edit mode |
| Parent / first child | `↑` / `↓` |
| Sibling variations | `←` / `→` |
| Root / end of variation | `Home` / `End` |
| Auto-play / pause | `Space` |
| Toggle player to move | `Ctrl+Shift+P` |
| Delete node | `Ctrl+Delete` |
| Cut / copy / paste variation | `Ctrl+Alt+X` / `Ctrl+Alt+C` / `Ctrl+Alt+V` |
| Duplicate / insert node | `Ctrl+Alt+D` / `Ctrl+Alt+N` |
| Flatten variation | `Ctrl+Alt+F` |
| Move-number count | View → None / All / Last 10 / 25 / 50 / Custom |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| New / open / save SGF | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| Save SGF As | `Ctrl+Shift+S` |
| Copy / paste SGF | `Ctrl+Shift+C` / `Ctrl+Shift+V` |
| Menus | `Alt+F / E / A / P / V / T / O / H` |
| Help | `F1` |

## SGF support and limits

Supported root properties: `GM`, `FF`, `CA`, `AP`, `SZ`, `PB`, `BR`, `PW`, `WR`, `RE`,
`KM`, `HA`, `RU`, `DT`, `EV`, `PC`, `GN`, `GC`, `C`.

Setup and markup: `AB`, `AW`, `AE`, `PL`, `B`, `W`, `C`, `CR`, `MA`, `SQ`, `TR`, `LB`, `L`,
`AR`, `LN`, `DD`, `SBKDD`, `BM`, `TE`, `DO`, `IT`.

Known limitations of this milestone:

- **Only the first game tree in a collection is loaded.** Saving writes that one tree.
- **No NGF, GIB or UGF import.** SGF only for now.
- **No find/hotspot mode, guess mode, scoring/estimator, or dead-stone marking.**
- **No GTP engine support** yet (planned after the core editor).
- Markdown is a safe subset, not full Sabaki react-markdown; code blocks and images are not
  rendered as code/images.
- No theme/texture directory, board-transformation UI, or full localization of runtime log
  messages (the editor interface itself is bilingual).
- `HA` is stored as a root property; automatic handicap stone placement is not applied.
- Star points on very large or irregular boards use the simple edge/centre rule, not a
  tournament-specific hoshi table.
- Display labels above 25 columns continue with `AA`…`AZ`; SGF coordinates use the standard
  `a`–`z`/`A`–`Z` 52-point alphabet.
- The dialog-folder memory is in-memory for the current app session.

## Architecture

```
src/sabaki-entry.js       imports the Sabaki libraries + my-Sabaki modules
src/vendor/gametree.js    adapted from my-Sabaki (MIT): board/markup extraction, game info
src/vendor/linecolor.js   adapted from my-Sabaki (MIT): coloured AR/LN values
src/vendor/dim.js         adapted from my-Sabaki (MIT): DD/SBKDD rectangles
src/sabaki-bundle.js      esbuild IIFE bundle exposing window.SabakiLibs
src/index.html            menus, toolbars, tabs, board, graph, dialogs
src/styles.css            MultiGo Neo shell, edit bar, tabs, graph, comments
src/renderer.js           tree state, canvas rendering, tools, file actions
electron/main.js          native window, dialogs, folder memory, IPC
electron/preload.js       contextBridge API
scripts/test-tree.js      5 tree/SGF/go-board tests
scripts/test-engine.js    legacy coordinate/rules tests
scripts/verify-tree-ui.mjs CDP UI smoke test and screenshot generator
scripts/verify-view-ui.mjs CDP test for custom boards and View controls
scripts/verify-options-ui.mjs CDP test for validation, messages, language and persistence
scripts/verify-edit-ui.mjs CDP test for Edit operations, panel limits and move markers
scripts/build-sabaki-bundle.mjs  rebuilds src/sabaki-bundle.js
```

`window.SabakiLibs` exposes `GameTree`, `Board`, `sgf`, `getBoard`, `getGameInfo`,
`getMatrixDict`, `getPlayer`, the line-colour helpers and the dim helpers. The renderer is
plain DOM/canvas; no front-end framework was introduced.

### Attribution

The Sabaki/my-Sabaki modules in `src/vendor` are adapted from
[`lots/my-Sabaki`](https://github.com/lots/my-Sabaki) / [SabakiHQ](https://github.com/SabakiHQ),
MIT licensed. The original copyright and licence terms apply. The visual shell,
canvas renderer, tabs and game graph presentation are this project's own work.

## Reference

- [`study/my-Sabaki`](study/my-Sabaki) — source snapshot of
  [`lots/my-Sabaki`](https://github.com/lots/my-Sabaki), the primary functional reference
  (study fork of Sabaki 0.60.2). [`study/README.md`](study/README.md) records the exact
  commit and the licences.
- [SabakiHQ/Sabaki](https://github.com/SabakiHQ/Sabaki) — upstream project and libraries
- [`study/design/my-Fig-test2.png`](study/design/my-Fig-test2.png) — the MultiGo screenshot
  that started this evolution
- [`study/design/my-Fig-test.figcraft`](study/design/my-Fig-test.figcraft) /
  [`study/design/my-Fig-test.png`](study/design/my-Fig-test.png) — original FigDesk design
  files (unchanged)

## Next phases

1. Scoring/estimator, dead-stone marking and score drawer.
2. GTP engine attachment, analysis, heatmap, win-rate graph and engine-vs-engine.
3. NGF/GIB/UGF import, collections/game chooser.
4. Find/hotspots, guess mode, board transformations, and full SGF property editing.
5. Themes/textures, richer Markdown, and complete localization of runtime messages.
