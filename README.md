# MultiGo Neo

MultiGo Neo is a **tree-based Go SGF editor/player** for the desktop. Its functional
reference is [`lots/my-Sabaki`](https://github.com/lots/my-Sabaki) — a study fork of
Sabaki 0.60.2 — and the design and reference material it was built from is kept in
[`study/`](study/README.md).

This is the **core SGF editor milestone** of the migration: game tree and variations,
lossless SGF, comments, the full markup toolset, and the fork's coloured-line/dim extensions
are implemented. A Sabaki-derived **GTP engine layer** now sits alongside them: attach GNU Go
or KataGo, generate moves, stream analysis into the board overlay and Engine tab, and drive
the engine from a GTP console. **Play → Estimate / Score** (Japanese or Chinese) marks dead
stones, shades ownership and writes the result to `RE`. Alternate file formats and the remaining
MultiGo/Sabaki features are planned for later phases.

The renderer also ports seven interaction ideas from BesoGo: **variation badges**, **per-tool
hover ghosts**, **deterministic stone textures**, **CSS-split board themes**, **responsive
portrait layout**, **position-path links** and **zero-JS data-attribute embeds**. Recent
additions cover **FF[4] move and non-move logging** in the Message panel, a **seven-file recent
list**, compact **pass** nodes in the game tree and the **四4** coordinate system. The View and
Options menus now use compact dropdowns, and the toolbar **Coords / Nums** labels are white and
bold when active, dimmed when off.

The **1.1.5 build** repackages the 1.1.4 feature set and adds the **main-branch tree layout**:
the Sabaki-derived **GTP engine layer**, Sabaki-style **scoring territory** with
**Play → Estimate / Score**, live captured-stone bowls and small-board edge fixes. The 1.1.2 release brought **Reload-in-place**, **multi-file branch
import**, **PNG board export**, the **UNSAVED** guard, display-only **board rotation/flips**,
**native fullscreen** and one shared lighter icon.

MultiGo Neo reads and writes **FF[4]** and adds a documented **modified-FF[4]** colour layer
(coloured `AR`/`LN` lines and `SBKDD` dim colours — see
[Modified FF[4]](#modified-ff4)). The board ships in **four themes**, previewed on 13×13
boards [below](#board-themes-and-responsive-layout).

![MultiGo Neo with a variation tree and the five-stone setup](preview/preview.png)

## What is implemented

### Version 1.1.5

Released 2026-11-09. The Windows artifacts are `MultiGo-Neo-1.1.5-setup.exe` and
`MultiGo-Neo-1.1.5-portable.exe`.

Maintenance repackaging of the 1.1.4 feature set, plus a clearer game tree: the first-child
**main variation is the leftmost column**, every branch uses the same **1.32× vertical row
pitch** (31.68 px instead of 24 px), and side variations stay on the same height levels as the
main line. Branch columns are widened to **36 px** so adjacent levels do not visually touch. The docked Score tab, GTP engines, Estimate/Score modes, captured-stone bowls and
small-board fixes are all as described in [Version 1.1.4](#version-114).

### Version 1.1.4

Released 2026-11-06. The Windows artifacts were `MultiGo-Neo-1.1.4-setup.exe` and
`MultiGo-Neo-1.1.4-portable.exe`.

- **GTP engines** — attach GNU Go or KataGo, generate moves, stream analysis into the board
  overlay and Engine tab, and drive the engine from the docked GTP console. See
  [GTP engines](#gtp-engines).
- **Estimate and Score** — a docked **Score** tab beside Info/Comment/Engine shows Chinese,
  standard **Area Scoring**, Japanese and **Territory Scoring**, plus Area and Territory audit
  tables. Compact black/white bordered squares mark ownership, red squares mark shared points,
  and green squares mark dead stones. Shell stones are clean, with no grey texture dot. The
  Score text has its own 12–36 px A−/A+ control. **Play → Estimate** pre-marks dead stones;
  **Play → Score** starts manual. See [Estimate and Score](#estimate-and-score).
- **Two consecutive passes** end the game and offer to count the result.
- **Captured-stone bowls** stay visible during Japanese-rules play: Black sits at the bottom by
  default, so the black bowl is lower-right and White's is upper-left. **BLACK** and **WHITE**
  seat labels are always shown, and the dark theme gives the bowls the same rosewood palette as
  the goban. **View → Swap Player Sides** reverses the seating.
- **Small boards (8×8 and below)** keep edge stones and coordinate labels inside the canvas.

### Version 1.1.2

Released 2026-11-04. The Windows artifacts are `MultiGo-Neo-1.1.2-setup.exe` and
`MultiGo-Neo-1.1.2-portable.exe`.

- **File → Reload** restores the exact selected branch and node after re-reading the file;
  if the branch disappeared after an external edit, it warns and returns to the root.
- **File → Import Files as Branch…** imports multiple SGFs under the current node, skipping
  empty root nodes.
- **Adjustable comment display size** — A−/A+ in the Comment header, persisted per app and
  never written into the SGF.
- **Explorer integration** — the installer registers a per-user `.sgf` association; double-click
  launches the app and loads the file, and a running instance focuses and opens it. The portable
  build accepts the same path after manual **Open with** association.
- **File → Save Board as Picture** opens a MultiGo-style export dialog with partial-board
  drag selection, PNG/JPEG, size/space and coordinate/grayscale options; the first opening
  selects the full board, later openings restore the last selection, the cursor becomes a hand
  and save dialogs start beside the SGF (or in Pictures/Images). `Ctrl+Q` triggers the command,
  while Quit is `Ctrl+Shift+Q`.
- **Unsaved guard**: orange `UNSAVED` status, red file dot, title bullet and confirmations
  before New/Open/Recent/Reload/Quit/Reset operations.
- **View → Rotate Clockwise / Flip Horizontally / Flip Vertically / Reset Board (`G`)**:
  display-only orientation changes with transformed hit testing and coordinates.
- **View → Toggle Full Screen (`F11`)**: native Electron fullscreen via IPC, Fullscreen API in
  browsers.
- **Synchronized lighter icon** across the application, installer, uninstaller and portable
  executable.

See [Reload, imports and picture export](#reload-imports-and-picture-export),
[Board orientation](#board-orientation) and [Unsaved changes](#unsaved-changes).

### Game tree and SGF

- Immutable `@sabaki/immutable-gametree` model with real variations.
- Sabaki-style **game graph** in the lower-right panel (columns for branches, current path,
  comment badges, click to select).
- Connectors are **orthogonal tree bones** rather than long diagonal parent-child lines:
  vertical runs through a sequence plus a single clean elbow at branches.
- The first-child **main variation is always the leftmost column**. Every branch uses the same
  **1.32× vertical row pitch** (31.68 px), so nodes at the same move depth share a height level
  across the main line and its side variations. Branch columns are **36 px** apart, giving lower
  levels room beside higher levels in the adjacent branch.
- On first load, the main line and its **first-level variation branches** are expanded; deeper
  branch points start collapsed so a large game tree does not open as an unreadable wall of
  nodes. The user can expand those deeper branches normally.
- Every branch node has a small grey **`+` / `−` collapse toggle** centred at the **bottom** of
  the node (MultiGo-style). Collapsing hides the subtree, compacts the remaining layout, keeps
  the selected node visible, and shows the visible/total node count in the panel header.
- Expanding restores the subtree; collapse state is kept while editing the same game.
- Play a move, create a variation by playing a different move from an earlier node, pass,
  and switch the player to move.
- Cut the current node (and its subtree), cut everything after the current node, make a
  variation main, shift it left/right, and remove sibling variations.
- Undo/redo across tree mutations.
- **Lossless SGF read/write** through `@sabaki/sgf`: unknown properties, variations, setup
  stones, comments, markup and the fork's coloured `AR`/`LN` and `DD`/`SBKDD` values survive
  a round trip.
- Pass nodes (`B[]`, `W[]`, or the legacy `tt` form on boards up to 19×19) show a compact
  **`p`** in the game tree; the tooltip and accessibility label spell out **pass**.
- New games get `GM[1] FF[4] CA[UTF-8] AP[MultiGo Neo:1.0] SZ[…]`.

![Orthogonal Sabaki-style game tree with branch collapse toggles](preview/preview-tree-expanded.png)

![Leftmost main variation with 1.32x vertical row pitch and aligned side branches](preview/preview-tree-main.png)

![Collapsed branch showing the plus toggle and compact 2/6 node count](preview/preview-tree-collapsed.png)

### Editing

- Tabbed **Info / Comment** panel; comments support a [safe Markdown subset](#supported-comment-markdown).
- The Comment textarea starts at **three lines**, remains vertically resizable, and its
  height is remembered across launches. The same comment is rendered below the editor using
  the Markdown subset, so formatted text can be checked while editing. In Read Only mode the
  editor is hidden and only the rendered comment is shown.
- The rendered comment has **A− / A+** display-size controls in its header (**12–36 px**). The
  size is stored only in the app’s `localStorage` preference; it is not written to the SGF and
  survives both page reloads and loading a different SGF.
- The docked **Score** tab has the same independent **A− / A+** control, also **12–36 px** and
  persisted only in app preferences.
- While the comment field has focus, **Ctrl+Shift+↑/↓** move to the parent/first child and
  **Ctrl+Shift+←/→** move to the previous/next branch at the current level (landing on the last
  node when the target branch is shorter). The current comment is committed first and focus
  stays in the comment field for continuous entry.
- **Ctrl+S** and **Ctrl+Shift+S** work even while a comment or game-info field has focus; the
  pending comment is committed before the SGF is serialised.

![Comment display font-size controls and rendered Markdown](preview/preview-comment-font.png)
- Edit tool strip: black/white stones, eraser, cross, triangle, square, circle, line, arrow,
  dim, label, and number.
- **Delete Move** is available from the toolbar in both Play and Edit modes (and from the
  Play/Edit menus or `Ctrl+Delete`); the button is disabled at the root.
- my-Sabaki palette for lines/arrows and dim rectangles: black, white, red, yellow, blue,
  green, plus the theme default.
- Coloured line/arrow values use the fork's optional third field:
  `LN[aa:ae:red]`, `AR[ha:he:blue]`.
- Dim uses standard inherited `DD[kk:mm]` plus the private `SBKDD[blue:kk:mm]` companion, so
  other SGF viewers still dim the correct area.
- Right-click erases the mark/line/dim rectangle/setup stone under the pointer (edit mode).
- Labels and numbers write `LB`; per-node comments write `C`; game comment writes `GC`.
- **AR is drawn at double the original stroke width; LN at triple.**
- The current move is always marked with a **red triangle**; variation hints are blue letters
  rather than translucent stones.
- Every successful board move writes its FF[4] property to the **Message** panel, e.g.
  `12. B[dd]` or `13. W[cc]`. Advancing with **Next**, a board click on an existing child, or a
  tree-node click logs the selected move's FF[4] codes as well.
- Non-move properties are logged too: setup (`AB/AW/AE`), markup (`CR/SQ/TR/MA/SL/LB`),
  lines/arrows (`AR/LN`), dim rectangles (`DD/SBKDD`) and `PL`, e.g. `12. DD[kk:mm]` or
  `12. AR[aa:ae:red]`. Comments stay in the Comment tab rather than flooding the log.
- Setup stone tools are toggles: clicking the same colour removes the stone, clicking the
  opposite colour replaces it.
- Scoring is manual and lives in [Estimate and Score](#estimate-and-score).

![FF[4] move and non-move properties in the Message panel](preview/preview-property-log.png)

### Supported comment Markdown

The comment editor intentionally implements only this safe Markdown subset. HTML is escaped
and shown as text, never executed.

**Block elements**

| Syntax | Result |
| --- | --- |
| `# Heading` | Heading level 1 |
| `## Heading` | Heading level 2 |
| `### Heading` | Heading level 3 |
| `#### Heading` | Also rendered as level 3 |
| `> quoted text` | Blockquote |
| `- item` or `* item` | Bullet-list item |
| `1. item` | List item rendered as a bullet (not an ordered list) |
| Blank line between blocks | New paragraph |

**Inline elements**

| Syntax | Result |
| --- | --- |
| `**bold**` | Bold |
| `*italic*` | Italic |
| `` `code` `` | Inline code |
| `[label](https://example.com)` | HTTP/HTTPS link |
| `https://example.com` | Automatic HTTP/HTTPS link |
| Single newline | Line break |

Block elements should start their own paragraph, separated by a blank line from surrounding
text.

**Not supported:** underscore emphasis (`_italic_`, `__bold__`), strikethrough, images,
nested lists, task lists, ordered-list numbering, tables, fenced code blocks, horizontal
rules, raw HTML, nested blockquotes, footnotes, and relative/`mailto:` links.

### Edit menu

The Edit menu now covers variation editing as well as display edits:

- Undo / redo, edit mode, game info, and node comments.
- **Cut Current Node** and **Cut All After Current** (the latter keeps the current node and
  copies all continuations as an SGF collection), plus copy/paste variations.
- **Duplicate the current node** and **insert an empty node**. The Edit menu no longer exposes
  **Delete Node**; deletion remains available from the toolbar/Play menu as Delete Move.
- Make a variation main, shift it left/right, remove sibling variations, and **flatten the
  current variation**.
- Clear node markup.
- Copy/paste the whole SGF.
- Keyboard: `Ctrl+Alt+C/X/V` for copy/cut/paste variation, `Ctrl+Alt+D/N` for
  duplicate/insert, and `Ctrl+Alt+F` for flatten.
- **Read Only** is available directly in this menu.

### Read Only

**Edit → Read Only** turns the document into a strict viewer:

- Board play, edit mode, all markup/setup tools, game-info and comment edits, variation
  operations, undo/redo, board-size changes and loading from the clipboard are blocked.
- **Save** and **Save As** are disabled and the save functions refuse to run.
- Navigation through the tree, branch selection, autoplay, copying SGF/variations, themes,
  zoom, language and viewing controls remain available.
- A red **READ ONLY** status cell and a `— Read Only` title suffix make the mode obvious.
- The comment editor is replaced by the rendered comment preview.

![Read Only mode with locked controls and status badge](preview/preview-readonly.png)

### GTP engines

**Status:** new in **1.1.3**.

The **Engine** tab (next to Info and Comment) attaches an external GTP engine. The engine
layer is ported from my-Sabaki/Sabaki: `electron/gtp.js` speaks the protocol, `src/engine.js`
owns the session and UI, and `src/engine-core.js` holds the shared coordinate, analysis and
position-rebuild helpers.

- **Manage Engines…** (Engine menu, or the tab button) stores a name, executable path and
  arguments per engine. Examples: GNU Go `gnugo --mode gtp`; KataGo
  `katago gtp -model <model.bin.gz> -config <gtp.cfg>`.
- **One shared configuration file**: [`engines/engines.json`](engines/engines.json) is
  hand-editable and is exactly what Manage Engines reads and writes. Relative paths resolve
  next to the JSON, then against the bundled `engines/` folder; set `MULTIGO_ENGINE_CONFIG`
  to use another file.
- **Local shims**: [`engines/`](engines/) contains one `.cmd` per engine on this device
  (GNU Go, Fuego, Pachi 11/12, KataGo CUDA/OpenCL/legacy, Leela Zero/0.11, AQ, AQ-mini,
  Zen7, ZenEstimate), modelled on `Documents\Weiqi\bin`. See
  [`engines/README.md`](engines/README.md).
- **Attach / Detach** starts the executable as a child process. `name`, `version`,
  `protocol_version` and `list_commands` are queried on attach; engines are stopped when the
  window closes, the page reloads or the engine is detached.
- **Board sync** rebuilds the position from the root on every move or navigation:
  `boardsize`, `komi`, `clear_board`, `set_free_handicap` (or replayed handicap stones),
  setup stones, then every `B`/`W` and `pass` in the current path.
- **Generate Move** sends `genmove` for the side to move and appends the answer as a normal
  tree node; `pass` and `resign` are handled.
- **Engine plays** (Off / Black / White) makes the engine answer every human move
  automatically; with Black selected it moves immediately after attaching or starting a new
  game. In Off mode, Generate Move stays manual. The engine only auto-answers at the end of
  the current variation, never while reviewing an earlier position.
- **Analysis** streams `kata-analyze`, `lz-analyze` or `analyze` (the first command the engine
  advertises, reporting every 500 ms). The top candidates appear as a translucent board overlay
  with win-rate labels; the Engine tab shows the side-to-move win rate, score lead and a
  clickable candidate list. Analysis restarts automatically after every position change.
- **GTP Console…** opens a docked console panel at the lower right of the workspace (not a
  modal). It accepts raw commands (`genmove B`, `showboard`, `final_score`) and closes when
  you leave the Engine tab or press its ×.

![KataGo-style analysis overlay and Engine tab](preview/engine-analysis.png)

![Docked GTP console at the lower right](preview/engine-console.png)

![Manage Engines editing engines/engines.json, with the active configuration path shown](preview/engines-config.png)

![GNU Go 3.8 attached and answering a move on a 13×13 board](preview/gnugo-game.png)

![Engine playing Black automatically and answering White](preview/engine-auto.png)

Limitations: GNU Go is playable but implements no analysis command, so its Analysis checkbox
stays disabled; KataGo is the intended analysis engine. Rectangular boards are sent as
`boardsize W H`, which KataGo accepts and strict GTP engines may reject. The analysis interval
is fixed, there is no engine-vs-engine mode and no win-rate graph yet, and engines are external
programs the user installs.

### Game Information

The Info tab now covers every field in the MultiGo Game Information dialog:

| Group | Fields |
| --- | --- |
| Common | Game Name `GN`, Black/White Player `PB`/`PW`, Black/White Rank `BR`/`WR`, Black/White Team `BT`/`WT`, Komi `KM`, Handicap `HA`, Result `RE`, Rules `RU` |
| When / where | Date `DT`, Time `TM`, Place `PC`, Round `RO`, Event `EV` |
| Other | User `US`, Source `SO`, Game Comment `GC`, Copyright `CP`, Annotation `AN` |

Values are read from and written back to the root SGF node. They are preserved when the board
size is changed and disabled while Read Only is active.

The player fields are grouped into two columns: **Black / Black rank / Black team** on the
left and **White / White rank / White team** on the right. The default Info panel is compact:
about six rows tall, showing **Game Name** through **Rules**, while the Message panel is limited
to roughly three log lines. Both panes remain resizable with their splitters.

![SGF fields populated with Black/White columns](preview/preview-game-info.png)

![Compact initial Info panel through Rules and compact Message panel](preview/preview-r17-layout.png)

### Game Info editing focus

Choosing **Edit → Edit Game Info** now expands the right-hand Info panel to its practical
maximum before focusing the Black field: the info column takes the widest allowed share of the
workspace (82%), while the Game Tree and Message panes stay at their 48 px minima so they
remain recoverable. A **Done** button appears in the Info header; pressing it restores the
exact layout that was in use before focus. The focus layout is session-only;
**View → Reset Panel Layout** also restores the default workspace proportions.

![Game Info panel expanded for focused editing](preview/preview-info-focus.png)

### Move numbers

Move-number display is controlled by the **View → Move Numbers** dropdown:

- **None**, **All**, **Last 10 / 25 / 50**, **Custom…**
- A second **Numbering** dropdown chooses **Game Start** or **Variation Start**.
- The toolbar **Nums** button still toggles between none and all.

![Expanded Edit menu with variation, node and SGF operations](preview/preview-edit-menu.png)

![Red triangle marking the most recent move](preview/preview-last-move.png)

![Only the last ten moves carry numbers](preview/preview-move-numbers.png)

### Fast navigation

The toolbar now has **←←** / **→→** fast-rewind and fast-forward buttons, plus Play-menu
entries. Fast navigation advances by **moves**, not raw tree nodes, and stops at the root or
the end of the current branch. The number of moves is configurable in
**Options → Preferences → View → Board → Fast forward/rewind steps** and defaults to **20**.

### Recent files

The File menu keeps the **last seven opened or saved SGF files** under **Recent Files**:

- The list is numbered and deduplicated (reopening a file moves it to the top).
- In the desktop/portable build the **complete path** (folder + filename) is remembered,
  re-read through the main process, and used as the Save As default location.
- In the browser preview up to 400 KB of SGF text per entry is cached in `localStorage`, so
  recent games reopen without the original file.
- Chromium also stores the File System Access **file handle** in IndexedDB. This lets a recent
  file reopen and later save back to the same location, even though browsers intentionally hide
  the literal filesystem path.
- Missing or oversized files fail with a message; **Clear Recent Files** empties the list and
  removes the stored browser handles.

![File menu with seven recent files](preview/preview-recent.png)

### Reload, imports and picture export

- **File → Reload** re-reads the current SGF from disk (Electron) or from the retained browser
  file handle/cache, with the same unsaved-changes confirmation as Open. It restores the exact
  branch path and node that was selected before reloading, so study can continue in place; if
  the file changed and that path no longer exists, it reports that the previous position is
  gone and falls back to the root.
- **File → Import Files as Branch…** accepts multiple SGF files and appends each game as a
  branch under the current node. Empty SGF roots are skipped so their first moves become the
  branch points.
- **File → Save Board as Picture** now opens a MultiGo-style **Save As Picture** dialog with:
  File Name + browse button, **png / jpg** format, **Image size**, **Add space**, **Show dead
  stones**, **Show coordinate**, **Black and white board and stones**, **Automatically select
  best area**, **Snap to close border** and **Show saved picture**.
- The first opening selects the **whole board**. Later openings restore the **last selected
  area**; **Automatically select best area** remains available as an explicit one-shot action.
- Uncheck **Automatically select best area** (or start dragging) to choose a partial
  rectangle. The blue translucent overlay marks the selected region. In the exported picture,
  the goban is clipped to the selected rectangle (no neighbouring lines leak into the margin),
  and coordinate labels are drawn in a dedicated gutter on **all four sides** without touching
  the goban lines.
- While the picture dialog is open the board cursor becomes a **grab hand** (and a grabbing
  hand while dragging); the round stone hover ghost is suppressed.
- **Add space** adds a grid-unit margin around the selection; **Image size** is the longest
  exported side in pixels (100–4000). **Snap to close border** expands a manual selection that
  is close to a board edge.
- The native save dialog starts in the **SGF file’s folder** when available, otherwise in the
  system **Pictures** or **Images** folder. Browser pickers start from the retained SGF file
  handle when possible.
- The picture command uses the native save dialog in Electron and the File System Access picker
  (or download fallback) in browsers. **Show saved picture** opens an in-app preview after a
  successful save.
- **Show dead stones** is retained for MultiGo dialog parity. Dead-stone marking is not yet
  represented in this SGF editor, so there are no dead-stone overlays to add to the export.
- `Ctrl+Q` is now **Save Board as Picture**; Quit moved to `Ctrl+Shift+Q`.

![Imported SGF files as sibling branches](preview/preview-import-branch.png)

![Save As Picture dialog with partial board selection](preview/preview-picture-dialog.png)

![Partial board exported to PNG with coordinates](preview/preview-board-picture.png)

### Save/open location messages

File operations now report the actual location used in the Message panel.

**Web version:** in Chromium browsers that support the File System Access API, the first
**Save** (or any **Save As**) opens a folder/file picker, so the destination is chosen
explicitly instead of always landing in Downloads. **Save As** is prefilled with the current
file name (not a newly generated game name); accepting it overwrites the same file. Later
**Save** actions write to the same chosen file without reopening the picker. For **Save As**
the current file handle is passed as the picker's `startIn` value, so Chromium opens the
current file's folder; a fixed picker `id` makes it reopen the last selected save folder when
no handle exists. The browser deliberately does not expose the full folder path, so the
Message says “folder selected in the browser”. Firefox/Safari or browsers without the API
fall back to the normal Downloads behavior, with a message saying so.

**Portable version:** the Electron portable build does **not** use the browser download path.
It calls the native `dialog.showSaveDialog` and can write to any folder the user picks; the
dialog starts at the current file's folder (or the last chosen folder/Documents when there is
no current file), prefills the current name for **Save As**, and logs the full filesystem path.
A normal **Save** writes directly back to the current file. Installed and portable Electron
builds share this behavior.

- Browser open logs the picked filename and states that the browser does not expose its folder.
- Browser recent-cache loads identify the cached filename, and errors include the path/name
  that failed.

### Unsaved changes

- Any tree/info/comment mutation marks the document dirty.
- A prominent orange **UNSAVED** status cell, a red dot beside the filename, and a `•` in the
  window title show the state.
- New Game, Open SGF, Open Recent, Quit, Reset Settings and risky load/replace operations ask
  for confirmation before discarding unsaved changes.
- Browser reload/close is guarded by `beforeunload`; intentional quit/reset paths suppress the
  duplicate native prompt after their own confirmation.

![Unsaved indicator in the file label and status bar](preview/preview-dirty.png)

### Board orientation

The View menu now provides display-only orientation controls:

- **Rotate Clockwise**: rotates the rendered board 90°; rectangular boards swap displayed
  dimensions.
- **Flip Horizontally** and **Flip Vertically**.
- **Reset Board** (shortcut **G**) restores the identity orientation.
- The transforms also apply to hit testing, stone/marker positions, coordinates, dim rectangles,
  arrows and move numbers. They do not modify the SGF or mark it dirty.
- Bowl covers follow a **horizontal or vertical flip**. Rotation does not move them: the players
  stay seated at the same screen edges.

![A 5×9 board rotated clockwise to 9×5](preview/preview-board-rotate.png)

![The same board flipped horizontally](preview/preview-board-flip.png)

### Workspace

- 13×13 default, with 9×9/19×19 presets and **custom boards from 2×2 to 52×52**.
- Small boards (8×8 and below) keep their **edge stones inside the canvas**: the board margin
  grows with the stone radius so nothing is clipped, and the coordinate labels stay outside
  the stones.
- Custom size syntax is `width*height`, e.g. `5*9` (five columns, nine rows). The wood
  surface and grid are genuinely rectangular, and `SZ[5:9]` is written to the SGF.
- Invalid custom sizes keep the dialog open and show an inline error such as
  “Each side must be an integer from 2 to 52 (60*2).”
- **The last board size is remembered across launches**, including rectangular sizes; the
  Options menu can disable or re-enable this.
- Coordinates, move numbers, last-move marker, star points, textured board. Shell stones are
  clean: the old grey texture dot/arcs were removed, while black stones keep their faint mineral
  flecks.
- Coordinate systems: **A1**, **1–1**, and **四4** (Arabic column numbers with Chinese
  numerals down the rows).
- **Four CSS board themes** — Classic, Flat, Dark and Paper — with the surface, grid colours
  and stone palette driven by custom properties in `src/themes/*.css`.
- **Responsive layout**: below 1120 px the board moves above the panel column; the board keeps
  a 58% height ratio and the panels keep at least 280 px. View → Responsive Layout toggles it.
- Resizable board / Info / Game Tree / **Message** panes, remembered layout and preferences.
- The three right-hand panes can each be squeezed down to roughly **48 px**, giving the
  remaining pane almost the whole column.
- The message console has moved from the bottom edge into a resizable lower-right panel.
  The bottom status bar now contains only the status cells and the single lower rule.
- Electron native Open/Save dialogs remember the last folder, matching the fork's dialog
  convenience; the renderer has a browser download/file-picker fallback.

### View menu

The View menu now covers the practical MultiGo-style display controls:

- **Board Size** dropdown: 9×9, 13×13, 19×19 and **Custom…**
- **Coordinates** dropdown: **None**, **A1**, **1–1**, or **四4**, drawn on all four sides
- **Move Numbers** dropdown: **None / All / Last 10 / Last 25 / Last 50 / Custom…**
- **Numbering** dropdown: **Game Start** or **Variation Start**
- **Show Next Moves**: the first continuation from the current node as a blue **A** badge
- **Show Sibling Variations**: **all child variations of the current node**, labelled
  **A, B, C…** in child order, but **only when there is more than one child**. A single
  continuation is the main branch and gets no sibling marker.
- **Show Go Bowls**: the captured-stone bowls shown during play and scoring in Japanese rules
  (hidden automatically when the board pane is too narrow)
- the last move keeps the **red triangle** marker in every mode
- **Responsive Layout**
- **Zoom In / Out / Reset**
- **Rotate Clockwise**, **Flip Horizontally**, **Flip Vertically**, **Reset Board** (`G`)
- **Toggle Full Screen** (`F11`): Electron uses the native window fullscreen state through IPC;
  browsers use the Fullscreen API
- **Show Game Tree** and **Reset Panel Layout**

There is deliberately no Video menu; it is not part of the Go editor.

![Custom 5×9 board with 1–1 coordinates](preview/preview-custom.png)

![Compact View menu with dropdowns and display controls](preview/preview-view-menu.png)

### Variation badges

**What they are.** Small blue letters drawn on the board — `A`, `B`, `C`… — at the points of
the moves that can be played from the current position. They are canvas overlays, not stones,
so the position underneath stays readable.

**Why they matter.** Variations normally live only in the game tree, at the side of the board.
Badges put the alternatives *on the board*, so you can see at a glance which continuations
exist here, compare them with the surrounding stones, and keep the shape in view while
reviewing. It is the MultiGo convention, and it deliberately avoids the visual noise of
translucent ghost stones.

**How to use them.**

- **View → Show Next Moves** marks only the first continuation with a blue **A**.
- **View → Show Sibling Variations** marks **all children of the current node** with
  **A, B, C…** in child order, and only when there is more than one child. A single main
  branch gets no marker, and it does not look at the parent's other branches.
- The letters follow the game-tree order, so **A** is the child the tree lists first.
- A badge is also a shortcut: clicking the point selects the existing continuation — the
  renderer reuses the child whose move matches instead of creating a duplicate node.
- The red triangle still marks the last move, and badges never change the SGF.

This was verified against `ff4_ex_new.sgf`: the 19×19 node with six continuations shows
**A–F**, and the following `W d16` node shows **A–D**, matching the good MultiGo captures.

![All six child variations A-F at the current position](preview/preview-variation-node23.png)

![Four child variations A-D after W d16](preview/preview-variation-node24.png)

Hover ghosts are still used for the active edit tool: a ghost stone in play mode; setup
stone/cross/replacement plus; markup shapes; the next number or existing label; and a dashed
line/arrow/dim preview.

![Triangle ghost in edit mode](preview/preview-hover-tool.png)

![Pass nodes use the compact p label](preview/preview-pass-tree.png)

### Estimate and Score

**Play → Estimate** (`Ctrl+Shift+E`) and **Play → Score** (`Ctrl+Shift+R`) are the two scoring
modes, following Sabaki. Estimate opens the scoring card with the dead stones already estimated;
Score opens it with no dead stones and waits for you to pick them. The board is shaded either
way, and the editor does the arithmetic.

- **Estimate**: runs a heuristic over the position — a chain with no eye whose liberties are
  sealed inside enemy territory is marked dead — and then lets you toggle groups to correct it.
- **Score**: starts clean; clicking a stone marks its whole chain dead, clicking again revives
  it. Dead stones get a **green square** marker.
- **Markers**: compact black-owned squares with a white border, white-owned squares with a
  black border, borderless red **shared/dame** squares, and green dead-stone squares — all
  the same size so they fit inside a stone. A dead black stone has a white edge; a dead white
  stone has a black edge.
- **Docked Score tab**: the Score panel lives beside **Info / Comment / Engine** in the right
  column, not as a floating board popup. It shows Chinese, standard Area Scoring, Japanese and
  Territory Scoring results simultaneously, with no rule selector. Clicking the **Score** tab
  when it is not active behaves like **Play → Score** / `Ctrl+Shift+R`. Komi or handicap edits
  made in Info recalculate both scoring and the audit tables when the panel is re-displayed.
  While a scoring session is open the Score panel takes the full right column; the Game Tree and
  Message panes return when scoring closes.
- **Chinese Rule** counts alive stones + territory, adds `shared / 2`, and applies `+komi/2` to
  White and `−komi/2` to Black. Captures are not counted. This is MultiGo's half-count
  convention: the displayed result halves the area difference (`B+6.25` for a 30.75–18.25
  total) and is explicitly captioned **Half-count result** so it cannot be mistaken for the
  standard Area result below.
- **Area Scoring** is the standard full-area result below Chinese Rule: area = alive stones +
  controlled territory, komi and handicap go to White, dame are neutral, captures are not
  counted, and the result is **not halved**. The 7×7 reference is `B+12.5` before dead stones
  and `W+1.5` after.
- **Japanese** counts territory + prisoners/dead stones + komi for White; shared points are not
  scored. The card labels the prisoner terms **Black's Dead** / **White's Dead**.
- **Territory Scoring** repeats the territory calculation below Japanese Rule with its own total
  and result, making a side-by-side study layout.

- **Area table** and **Territory table** show Area, Territory, Captures, Komi, Handicap and the
  respective total for both sides. `HA` is read into the handicap term for Area Scoring only
  (territory scoring, like Sabaki, does not add it).
- **Write RE** writes the **standard area result** for `RU[Chinese]` and the normal territory
  result for `RU[Japanese]` into the SGF’s `RE` (game result) property on the root node. It
  updates the in-memory game/title but does **not** save the file; use File → Save afterwards.
  **Done** or `Esc` closes scoring. The panel shows this explanation next to the button.
- **Captured-stone bowls**: by default Black sits at the bottom, so the black bowl is at the
  **lower right** of the goban and the white bowl at the **upper left**. **View → Swap Player
  Sides** flips the seating and therefore the bowls. The words **BLACK** and **WHITE** are
  shown at the bottom and top of the board pane so the seating is always legible, even when the
  bowls are hidden. New games and opened SGFs reset to Black at the bottom and the default
  unrotated, unflipped orientation; the bowls follow later horizontal/vertical flips but not
  rotation. Bowls stay beside the board when the pane
  resizes and fall back to the board corners when there is no outer room. They are drawn
  **top-down**: captured stones are stacked in the bowl (White's stones in the black bowl,
  Black's in the white one), with 3D shading and shadows. No number is printed in the bowl — the
  status bar shows `Captures: B n · W n`. They update live during play and scoring. In Chinese
  rules they stay hidden, they disappear when the board pane is too narrow, and
  **View → Show Go Bowls** turns them off manually.
- **Capture sound**: when a move captures one or more stones (or an edit/undo removes
  stones), a short wooden body, a high bowl/cover click and a bright high-passed noise rattle are
  generated with Web Audio. Stones land 28–46 ms apart, each with a small random pitch offset
  (±70 cents on the body, ±50 on the click), so a group never sounds mechanical. The rattle
  carries the sound on laptop speakers, where the 105–220 Hz body is nearly out of range —
  Sabaki's recorded capture samples are 95 % above 2 kHz for the same reason. Enable
  **Preferences → Traverse → Play sound on moves and captures** to hear it. **Hear it on its
  own:** open [`preview/capture-sound-test.html`](preview/capture-sound-test.html) and click
  **1**, **3** or **8** stones — the surrounded white group lifts off the goban into the bowl —
  or play [`preview/capture-sound.wav`](preview/capture-sound.wav), a 4.0 s audition of one,
  three and eight stones. `npm run sound` re-renders that WAV from the same voice.

Seki and life-and-death are the player's judgement: whatever is not marked dead is treated as
alive, just like Sabaki's score mode. Estimate is only a heuristic, so correct it by hand when
it gets a group wrong.

![Reference 7×7 scoring before dead stones: Chinese half-count, Area Scoring, Japanese territory and the Area table](preview/preview-scoring-reference.png)

![After marking B7 and B1 dead: green dead-stone squares, white control of the vacated region, and all scores updated](preview/preview-scoring-reference-dead.png)

![Dark theme: the bowls and seat labels use the goban's rosewood/gold palette](preview/preview-scoring-dark.png)

![Play > Estimate: the sealed white stone is estimated dead and counted](preview/preview-estimate.png)

![Play > Score: both rule results, shared red points and the captured-stone bowls](preview/preview-score.png)

The bowls are live during play as well, not only while scoring — here Black has captured one
White stone and the bowl shows it:

![Captured-stone bowls during play, drawn top-down on light wood](preview/preview-bowls.png)

![The white bowl holding a captured black stone, clearly visible on the light wood](preview/preview-bowls-white.png)

When two passes are played consecutively the game is over: a prompt offers **Count Result** or
**Keep Playing**, and accepting opens the same scoring card.

### Board themes and responsive layout

Four CSS-only board themes ship with the app: **Classic**, **Flat**, **Dark** and **Paper**.
Pick one in **Options → Theme**; the choice is remembered across launches. A theme only
changes the board surface, grid, labels and stones — the shell stays the same. All four
images below show the same **13×13** position at 1440×1024.

| Classic | Flat |
| --- | --- |
| ![Classic kaya board on a 13x13 position](preview/preview-theme-classic.png) | ![Flat board on a 13x13 position](preview/preview-theme-flat.png) |

| Dark | Paper |
| --- | --- |
| ![Dark rosewood board on a 13x13 position](preview/preview-theme-dark.png) | ![Paper diagram board on a 13x13 position](preview/preview-theme-paper.png) |

- **Classic** — warm kaya wood with CSS-only grain; the default.
- **Flat** — a solid board colour with no grain.
- **Dark** — old rosewood with a golden-brown grid and warm stone highlights, based on the
  old-board photographs in `study/design/old-board/`; the stones get a glassy top-left
  specular cap and a warm lower rim so black stones separate from the dark wood. Captured-stone
  bowls and their labels use the same rosewood/gold palette.
- **Paper** — light diagram paper, thin ink lines and flat printed stones (no gradient,
  drop shadow or highlight), for print-like review diagrams.

Palettes live in `src/themes/classic.css`, `flat.css`, `dark.css` and `paper.css`; the
renderer reads their custom properties on each switch, so the canvas stays transparent over
the CSS surface. `node scripts/verify-themes-ui.mjs <port> preview` regenerates the four
screenshots against a DevTools-enabled Chromium.

Below **1120 px** the workspace switches to a portrait column: the board sits on top at 58%
of the available height, the panel column fills the rest, and the vertical splitter hides.
The layout returns to the remembered landscape proportions when the window grows again.

![Portrait workspace at 980×900](preview/preview-portrait.png)

![四4 coordinates with Chinese row numerals](preview/preview-cjk.png)

### Position links

The compact path DSL is shared with the embed viewer (`src/path-spec.js`):

- `N<n>` / `n<n>` moves forward along first children; a bare number is next mode.
- `B<n>` / `b<n>` selects the n-th child (1-based, `0` = last child).
- Other characters are separators. `20`, `n5b1b1` and `b2,3,0,1` are all valid.

**Tools → Copy Position Link** puts a self-contained link on the clipboard:
`index.html?sgf=<encoded SGF>&path=<spec>`. Opening it restores the game and jumps to the
position. Electron accepts the same value as `--path=<spec>`; the path is applied as soon as
an SGF is opened.

### Embeddable viewer

`src/embed.html` demonstrates the zero-JS embed: include `sabaki-bundle.js`,
`path-spec.js`, `embed.js` and the theme sheets once, then write plain markup.

```html
<div data-multigo
     data-sgf="(;FF[4]GM[1]SZ[9];B[ee];W[cc])"
     data-path="2"
     data-theme="dark"
     data-coords
     data-variations
     data-width="420"></div>
```

Supported attributes: `data-sgf`, `data-path`, `data-size` (empty board), `data-theme`,
`data-coords` (optionally `1-1`), `data-variations`, `data-controls="false"`, `data-width`
and `data-label`. Widgets support click/wheel/keyboard navigation and a hover stone.

![Three data-attribute embeds](preview/preview-embed.png)

### Language and Options

- Options now offers a **Language** dropdown with **English / 简体中文**. Switching language
  immediately translates the menus, toolbar, tabs, panel titles, game-info labels, rules,
  status cells, dialogs and option labels; the choice is persisted across reloads.
- The Chinese shell is demonstrated below:

![Bilingual Chinese interface](preview/preview-chinese.png)

- Additional Options: **Remember Last Board Size**, a **Theme** dropdown (Classic / Flat /
  Dark / Paper), an **Autoplay Delay** dropdown (0.5/1/2/3 s), Preferences, and **Reset All
  Settings**.
- Runtime log entries and SGF/game content stay in their original language.

![Options menu with language, theme, size memory and autoplay dropdowns](preview/preview-options-menu.png)

### Options → Preferences

The former **Set Up…** entry has been merged into **Options → Preferences…**. The single
Preferences dialog follows the MultiGo Options categories:

- **Board** — theme, brightness, show coordinates, coordinate style, default board size and
  **Fast forward/rewind steps** (default 20).
- **Stones** — enable/disable the procedural stone texture.
- **Markers & Numbers** — focus marker (triangle / dot / none), focus colour,
  hide markup, show next moves, show sibling variations, move-number range, numbering mode,
  and label start character.
- **Other** — show the game result in the window/file title.
- **Traverse** — move and capture sounds, auto-play interval, and “visit variation branch first”.
- **Edit** — default Komi, White moves first in new games, right-click board removes the
  current move, and open existing files as Read Only.

Options take effect on **OK**; **Cancel** discards changes, and **Reset Defaults** only resets
the dialog controls until OK is pressed. Values persist in `localStorage`.

![Merged Options Preferences dialog](preview/preview-preferences.png)

MultiGo bitmap-board/stone image paths, random stone images, window-side/tree-position choices,
custom panel background colours, BIG5 auto-detection, new-file templates, branch merging and
resume-last-position are not applicable or are not implemented in the canvas-only
architecture; the dialog notes these limitations.

## Verification

The suites behind `npm test` cover variations, unknown-property preservation, immutable tree
mutation, captures, custom rectangular sizes, the 52-point alphabet, markup round-trips, the
position-path parser/resolver (including build/resolve round-trips through every branch),
territory/area scoring (dead stones, prisoners, komi, dame, automatic dead-stone estimation),
the GTP session layer against a
fake engine, and engine-configuration loading/saving.
The legacy pure-Go helper tests remain available as `npm run test:legacy`.

The UI was driven in Chromium at exactly 1440×1024, plus a 980×900 pass for the responsive
layout and a 1100×1700 pass for the embed page:

- played a main line and created a sibling variation from the root;
- undone/redone and deleted a node, then undone the deletion;
- placed a setup stone, cross, line, red line, dim rectangle, blue dim rectangle, number and
  label; erased the cross by right-clicking;
- wrote and previewed a Markdown comment;
- loaded an SGF containing an unknown `ZZ` property and two variations, then wrote it back
  with the same structure and values;
- created a **5×9** board through the Custom… dropdown, confirmed the rectangular surface,
  and checked the 52×52 and 2×52 limits;
- exercised the View dropdowns for board size, coordinates, move numbers and numbering,
  next-move hints, zoom, game-tree hiding, and reset;
- entered an invalid custom size (`60*2`), confirmed the dialog stayed open with the inline
  range error, then entered `5*9` successfully;
- reloaded the page and confirmed the **5×9 board** and the selected **Chinese** language
  both survive;
- resized the Message panel with its splitter and confirmed the bottom bar is now a single
  24 px status row with no message log;
- squeezed the Info, Game Tree and Message panes down to their small state, including a
  48 px Game Tree;
- verified AR/LN line widths of **3.6 px / 5.4 px**;
- used **Insert Empty Node**, **Duplicate**, **Copy/Paste Variation**, **Flatten**,
  **Cut Current Node** and **Cut All After Current** from the expanded Edit menu, restoring
  each with Undo;
- confirmed the Edit menu has **no Delete Node** entry but still has **Cut Current Node**;
- cut all continuations after a two-child branch (15 → 13 nodes, current branch retained),
  pasted them back (15 nodes with both children restored);
- confirmed the last move is marked with a **red triangle**;
- changed **Move Numbers** and **Numbering** through their View dropdowns;
- confirmed the autoplay icon is distinct from First Child, the status bar has only the lower
  rule, and the menu bar contains no Video item;
- confirmed **Reload** prompted for unsaved changes, kept the same 4-node branch on
  `W[cc]` / move 2, and cleared dirty;
- imported two SGF files as branches (3 nodes total, two root children) and confirmed the
  imported node was current;
- opened the **Save As Picture** dialog, confirmed it initially selected the full **13×13**
  board, then exported a **6×5** region as a **500×444** / 293,745-byte PNG with labels on all
  four sides and goban lines clipped to the selected rectangle;
- reopened the dialog and confirmed the previous **6×5** selection was restored; dragged a
  separate **6×7** manual region on the board, then exported a grayscale JPEG through the same
  dialog and confirmed `image/jpeg`;
- `Ctrl+Q` opened the dialog without invoking a file picker until **OK** was pressed;
- marked a document dirty and confirmed the orange **UNSAVED** status, red file-label dot and
  title bullet; New Game and Open SGF both showed the unsaved-loss confirmation, and Cancel
  preserved the 2-node dirty document;
- verified board transforms on a 5×9 board: identity, 90° (9×5), 180°, horizontal and vertical
  flips; fixed physical clicks mapped to `aa`, `ai`, `ei`, `ea` and `ai`; **G** reset the
  orientation; transforms did not dirty the SGF;
- verified the fullscreen menu command and **F11** both issued a browser fullscreen request;
  Electron uses the native window IPC;
- loaded a six-node two-branch SGF and confirmed every tree connector path is orthogonal
  (`M/V/H`, no diagonal `L`); used the branch toggles to collapse 6 nodes to 2 (label `2/6
  nodes`), saw the `+` state and current node move to the collapsed branch, then expanded back
  to 6 with the `−` state;
- loaded `ff4_ex_new.sgf` and confirmed **Show Sibling Variations** labels all six children
  of the `Style & text type` node **A–F** (D16, D4, Q4, C17, C3, R3), and all four children
  after `W d16` **A–D**; no parent-sibling badges or ghost stones leaked onto the board;
- verified the last move uses the **red triangle**, and the hover ghost stays available;
- checked the toolbar **Coords / Nums** labels: white bold when active, dimmed when off;
- confirmed the compact View menu has four dropdowns and a working Show Sibling Variations
  entry;
- enabled **Edit → Read Only**: the game tree was locked, play produced no node, Save/Save As
  were disabled, Info/comment/board-size controls were disabled, and tree navigation still
  worked; the red **READ ONLY** status cell appeared and disappeared correctly;
- populated every Game Information field from SGF and edited Source `SO` successfully;
- confirmed the Comment tab starts with a three-line editor and shows the rendered Markdown
  comment below it; a 120 px resize survived reload, while Read Only still shows only the
  rendered preview;
- changed the rendered comment from 12 px to 15 px, confirmed the SGF text did not change,
  the 15 px size survived a page reload and loading a different SGF, and the app remained
  clean;
- chose **Edit → Edit Game Info** and confirmed the info panel grew to 1180×802 px at
  1440×1024, the Game Tree and Message panes stayed at 48 px, the Info tab was active and the
  Black field received focus;
- pressed the new **Done** button and confirmed the panel returned to its earlier
  394×324 px / 1045 px board layout and the button hid itself;
- confirmed Black/Black rank/Black team share the left column and White/White rank/White team
  the right column; the initial Info panel was 324 px tall, showed Game Name through Rules, and
  the Message panel was 81 px (two visible log lines);
- confirmed **Show Sibling Variations** produced no hint for a single main continuation and
  two hints at a real two-child branch;
- used the **←←/→→** toolbar buttons and Play-menu commands: fast forward moved 20 moves,
  fast rewind returned to the root; the Preferences step count accepted 5 and reset to 20;
- deleted a move from both Play and Edit modes using the new toolbar Delete Move button;
- opened **Options → Preferences**, verified six categories, applied theme/brightness/coordinates,
  stone-texture, focus-marker/colour, hidden markup, next/sibling hints, move-number range,
  numbering, label character, result title, sound, autoplay interval, fast-step count,
  variation preference, Komi, White-first, right-click undo and open-as-Read-Only settings;
- confirmed Cancel left settings unchanged and Reset Defaults only reset the dialog until OK;
- created a new game and confirmed the selected Komi and White-first defaults reached the SGF
  root; opening a file with open-as-Read-Only enabled locked it automatically;
- advanced with the Next control and confirmed the Message panel logs the selected move's
  FF[4] code;
- navigated to a node containing `CR`, `AR`, `LN`, `DD` and `SBKDD`, and confirmed all five
  property codes appear; also confirmed setup, markup, line, dim and `PL` edits log the
  updated property immediately;
- switched to the **Dark** theme through the Options dropdown and confirmed the old-board
  colours, golden grid, glassy black-stone specular highlight and warm rim;
- switched to the **Paper** theme and confirmed flat printed stones: solid black center
  `rgb(29,29,27)`, solid warm-white center `rgb(251,247,237)`, and thin ink outlines;
- switched **Language** and **Autoplay Delay** through their dropdowns and confirmed the
  values were applied;
- emulated **980×900** and confirmed the portrait workspace, hidden vertical splitter and
  450 px board pane; restored 1440×1024 afterwards;
- opened `?sgf=…&path=B1B2` and confirmed move 2 / `W[cc]` was selected;
- confirmed the setup stone tool toggles the same point between `AB` and `AE`;
- loaded `src/embed.html` and confirmed three auto-initialised widgets, 3/19/3 move cursors,
  the dark theme class and non-zero canvases;
- confirmed the message log prints the FF[4] move property (`1. B[cc]`, `2. W[dd]`);
- added ten recent files, confirmed the **seven-entry cap**, menu fit and the numbered labels,
  reopened the newest entry, then cleared the list;
- confirmed browser loads report the filename and “browser file picker (original folder
  unavailable)”; a stubbed File System Access picker used for **Save As** suggested the current
  filename `existing.sgf`, used the remembered `multigo-sgf-save` picker ID, wrote the SGF, and
  the following **Save** reused the same handle without reopening the picker; a further
  **Save As** passed the file handle as the picker's `startIn` folder and used the new current
  name;
- Electron sends the current full `filePath` into the Save As dialog so the native picker opens
  in the current file's folder (native runtime remains unexercised headlessly);
- confirmed the no-picker fallback still reports `Downloaded …` and the browser-controlled
  download location; Electron paths use the full filesystem path returned by the native dialog;
- loaded a record ending in `B[]`, `W[]` and confirmed both tree nodes show **`p`** with the
  `pass` tooltip;
- switched coordinates to **四4** and confirmed Arabic column numbers with Chinese row numerals;
- attached an engine from the Engine tab and confirmed the GTP handshake status;
- generated a move and confirmed the engine answer arrived as a normal tree node;
- ran analysis and read the win rate and candidate list in the Engine tab, including at the
  root, with the overlay drawn on the board;
- opened the docked GTP console, sent commands, and closed it by leaving the Engine tab;
- chose **Play → Score** on a 13×13 position with a black and a white wall and confirmed the
  docked **Score** tab showed Chinese, Area Scoring and Japanese results;
- confirmed the captured-stone bowls are already visible **during play** on a Japanese-rules
  game, showing exactly one white stone (no duplicated number) with the status bar reading
  `Captures: B 1 · W 0`;
- mirrored the sequence so White captured a Black stone and confirmed the white bowl shows the
  dark stone clearly on the light wood;
- confirmed the default seats place Black lower-right and White upper-left, then used
  **View → Swap Player Sides** and confirmed the bowls swapped corners and the setting restored;
- loaded the same position with `RU[Chinese]` and confirmed the bowls stay hidden;
- opened `preview/capture-sound-test.html`, captured one surrounded white stone and confirmed it
  left the goban for the black bowl while the page created two oscillators and a filtered rattle
  (body, bowl click and noise); repeated with three and eight stones and confirmed 24
  oscillators, eight stones in the bowl, and randomised 28–46 ms gaps with varying pitches;
- chose **Play → Estimate** and confirmed it entered Estimate mode with the sealed white stone
  already marked dead and all four results shown; **Play → Score** opened with no dead stones;
- clicked the lone white stone inside Black's area and confirmed its green dead marker, the
  score updates in all rule blocks, and the black bowl showed **1**;
- confirmed the 7×7 Area Scoring result moves from `B+12.5` before dead stones to `W+1.5`
  after, while the Chinese **Half-count result** stays `B+6.25` / `W+0.75`;
- loaded the same position with `HA[2]` and `KM[0.5]` and confirmed the Area table shows
  handicap **2**, White total **11.5** and Area result `B+16.5`;
- confirmed **Territory Scoring** is shown below Japanese Rule and the Territory table sits
  directly below the Area table, with White totals **6.5** before dead stones and **20.5** after;
- confirmed the compact scoring markers: black squares with white borders, white squares with
  black borders, borderless red shared points and green dead stones; dead black stones carry a
  white marker edge and dead white stones a black edge;
- changed the Score tab display font from 12 px to 14 px, then 16 px, and confirmed the A−/A+
  boxes stayed 20×18 px with no overlap; the Comment and Score font preferences are independent;
- confirmed new games and opened SGFs reset rotation/flip to zero and seating to Black at the
  bottom, with **BLACK**/**WHITE** labels at the bottom/top of the board pane;
- changed komi from 6.5 to 0 while scoring, returned to the Score tab and confirmed the Area
  result recalculated from `B+12.5` to `B+19`;
- pressed the inactive **Score** tab and confirmed it started a score session just like
  **Play → Score**;
- switched to **Dark** and confirmed the bowl wood stop colour is the goban rosewood
  `rgb(74, 45, 31)` and the bowl labels use the light gold board-label colour;
- scoring unit tests reproduce the MultiGo reference exactly: Chinese **30.75 / 18.25**
  before dead marking, **23.75 / 25.25** after; Japanese **17 / 6.5** before and
  **17 / 20.5** after, with results `B+6.25`, `W+0.75`, `B+10.5`, `W+3.5`;
- wrote the Japanese result to `RE` and confirmed it round-tripped into the SGF; with
  `RU[Chinese]`, **Write RE** stored the standard Area result (`B+12.5`); `Esc` closed scoring;
- shrank the board pane to 520 px and confirmed the bowls hid themselves;
- played two consecutive passes, saw the **Count Result** prompt, and confirmed accepting it
  opened the scoring card;
- rendered **8×8, 4×4 and 2×2** boards and confirmed the edge stones stay inside the canvas
  (14–17 px clearance) with the coordinate labels 8 px clear of the stones;
- no console exceptions.

All screenshots live in the [`preview/`](preview/) subfolder.

Screenshots: [main editor](preview/preview.png), [custom 5×9 board](preview/preview-custom.png),
[View menu](preview/preview-view-menu.png), [Edit menu](preview/preview-edit-menu.png),
[all six sibling variations A-F](preview/preview-variation-node23.png),
[all four variations A-D after W d16](preview/preview-variation-node24.png),
[Read Only mode](preview/preview-readonly.png), [Game Information fields](preview/preview-game-info.png),
[merged Options Preferences dialog](preview/preview-preferences.png),
[compact initial Info layout](preview/preview-r17-layout.png),
[unsaved indicator](preview/preview-dirty.png), [imported branches](preview/preview-import-branch.png),
[picture dialog](preview/preview-picture-dialog.png), [partial board picture](preview/preview-board-picture.png),
[rotated board](preview/preview-board-rotate.png), [flipped board](preview/preview-board-flip.png),
[focused Game Info panel](preview/preview-info-focus.png),
[restored layout after Done](preview/preview-info-restored.png),
[red last-move triangle](preview/preview-last-move.png), [last 10 move numbers](preview/preview-move-numbers.png),
[FF[4] property log](preview/preview-property-log.png),
[Chinese interface](preview/preview-chinese.png), [Options menu](preview/preview-options-menu.png),
[edit tools](preview/preview-edit.png), [comment tab](preview/preview-comment.png),
[triangle hover ghost](preview/preview-hover-tool.png),
[pass nodes](preview/preview-pass-tree.png), [recent files](preview/preview-recent.png),
[orthogonal game tree](preview/preview-tree-expanded.png), [collapsed branch](preview/preview-tree-collapsed.png),
[四4 coordinates](preview/preview-cjk.png),
[classic theme](preview/preview-theme-classic.png), [flat theme](preview/preview-theme-flat.png),
[dark theme](preview/preview-theme-dark.png), [paper theme](preview/preview-theme-paper.png),
[portrait layout](preview/preview-portrait.png),
[engine analysis](preview/engine-analysis.png), [GTP console](preview/engine-console.png),
[engine configuration](preview/engines-config.png), [GNU Go playing](preview/gnugo-game.png),
[automatic engine play](preview/engine-auto.png),
[reference scoring before dead stones](preview/preview-scoring-reference.png),
[reference scoring after dead stones](preview/preview-scoring-reference-dead.png),
[dual-rule score card](preview/preview-score.png),
[play-time captured-stone bowls](preview/preview-bowls.png),
[captured black stone in the white bowl](preview/preview-bowls-white.png),
[capture sound test](preview/preview-capture-sound.png),
[Play > Estimate](preview/preview-estimate.png), [Play > Score](preview/preview-score.png),
[8×8 board with edge stones](preview/preview-8x8.png)
and [embeds](preview/preview-embed.png).

The four theme images are the same 13×13 position captured at 1440×1024 by
`scripts/verify-themes-ui.mjs`.

**Electron caveat:** Electron needs an interactive desktop and, in this restricted agent
session, only started with `--no-sandbox --disable-gpu`. The window, engine IPC and CDP tests
ran that way; native dialogs and installers were not exercised here. Run `npm start` from a
normal interactive desktop terminal.

## Install on Windows

MultiGo Neo ships as a normal Windows application — no Node.js, no internet connection and
no Microsoft Store required.

1. Download **`MultiGo-Neo-1.1.5-setup.exe`** from the
   [Releases page](https://github.com/lots/my-MultiGoNeo/releases), or build it yourself
   (see *Standalone build* below).
2. Run the installer. It is per-user by default, so it does not ask for administrator
   rights, and it lets you choose the install folder, a desktop shortcut and a Start-menu
   entry.
3. Launch **MultiGo Neo** from the shortcut.

`MultiGo-Neo-1.1.5-portable.exe` is the same app as a single portable executable — copy it
to a USB stick and run it; nothing is installed.

**Open SGF by double-clicking:** the installer registers the `.sgf` file association, so
double-clicking an SGF in File Explorer launches MultiGo Neo and loads that file. If the app is
already running, the existing window is focused and the file is opened there; unsaved changes
are confirmed first. For the portable build, use **Open with → Choose another app** once to
associate the portable executable with `.sgf`; it accepts the file path from Explorer and then
behaves the same way.

**Requirements:** Windows 10 or Windows 11, 64-bit (x64). Windows 11 on ARM runs the x64
build through the built-in emulation.

**Offline:** the app never needs a network connection. All code, styles, themes, icons and
SGF libraries are packed inside `app.asar`, every resource loads from `file://`, and the
pages carry `connect-src 'none'` in their Content-Security-Policy. There is no
auto-updater, no telemetry and no CDN.

**Unsigned build:** the installers are not code-signed, so SmartScreen may show
"Windows protected your PC" the first time. Choose **More info → Run anyway**. Signing with
an Authenticode certificate removes the warning.

## Clone and run

```powershell
git clone https://github.com/lots/my-MultiGoNeo.git
cd my-MultiGoNeo
npm ci            # dependencies, including the Sabaki libraries and esbuild
npm start         # Electron window
```

`npm ci` restores `node_modules/` from `package-lock.json`. `src/sabaki-bundle.js` is
committed, so the browser preview works without a build step.

## Portable web build (USB)

`npm run dist:web` assembles a self-contained browser copy in `web-portable/`:

```
web-portable/
  index.html          <- open this
  styles.css  themes/  *.js
  README.txt  LICENSE  license.html
  Open MultiGo Neo.cmd
```

Copy the whole folder to a USB stick and double-click `index.html` on any Windows PC with
Chrome or Edge. No installation, no local server and no internet connection are needed: every
stylesheet, theme and script is referenced relatively inside the folder, and nothing is fetched
at runtime.

Browser-only limits: GTP engines, native Open/Save dialogs, the `.sgf` Explorer association and
the installers are Electron-only. Open/Save use the browser's file picker and downloads;
settings, theme, recent files and layout live in the browser's `localStorage` for that folder.
The generated folder is git-ignored (`web-portable/`); run `npm run dist:web` again after source
changes.

## Run

```powershell
npm start          # Electron window
npm test           # tree/SGF, position-path, GTP and engine-config tests
npm run test:path  # position-path parser only
npm run test:gtp   # GTP session against the fake-engine fixture
npm run test:engines  # engine configuration load/save
npm run test:legacy
npm run bundle     # rebuild src/sabaki-bundle.js after changing src/vendor or src/sabaki-entry.js
npm start -- --path=B1B2   # Electron opens with a pending position path
```

Browser previews:

```powershell
start src\index.html
start src\embed.html   # zero-JS embed examples
```

Standalone build:

```powershell
npm run icon       # regenerate build/icon.ico (equivalent: scripts/make-icon.ps1)
npm run pack       # unpacked app in release/win-unpacked
npm run dist:win   # NSIS installer + portable exe in release/
```

Artifacts:

- `release/MultiGo-Neo-1.1.5-setup.exe` — NSIS installer (per-user, selectable folder).
- `release/MultiGo-Neo-1.1.5-portable.exe` — single-file portable build.
- `release/win-unpacked/MultiGo Neo.exe` — unpacked application.

The first build downloads the NSIS toolchain once into `ELECTRON_BUILDER_CACHE`;
`electronDist` points at `node_modules/electron/dist`, so the Electron binary is not
downloaded again. Code signing is skipped unless a certificate is configured
(`CSC_LINK` / `CSC_KEY_PASSWORD`).

## Controls

| Action | How |
| --- | --- |
| Play | Click an intersection |
| Move log | Message panel shows `N. B[xy]` / `N. W[xy]` and non-move codes such as `DD[...]`, `AR[...]`, `LN[...]` |
| Recent files | File → Recent Files (last 7) |
| Coordinate style | View → Coordinates dropdown (None / A1 / 1–1 / 四4) |
| Board size | Toolbar or View → Board Size dropdown; `Custom…` accepts `5*9` |
| View modes | View dropdowns: board size, coordinates, numbers, numbering |
| Next-move hint | View → Show Next Moves (current branch only) |
| Sibling hints | View → Show Sibling Variations (all child variations, A/B/C…) |
| Tree branches | Click `−`/`+` beside a branch node to collapse/expand its subtree |
| Board theme | Options → Theme dropdown or Options → Preferences → View → Board |
| Preferences | Options → Preferences…; OK applies, Cancel discards |
| Read Only | Edit → Read Only; navigation only, save disabled |
| Comment editor | Comment tab; three-line editor, vertically resizable, height remembered; rendered Markdown below |
| Comment display size | A− / A+ in the Comment header; 12–36 px, persisted per app and never written to the SGF |
| Navigate while commenting | `Ctrl+Shift+↑/↓` parent/first child; `Ctrl+Shift+←/→` previous/next branch; comment focus stays |
| Save while typing | `Ctrl+S` / `Ctrl+Shift+S` from comment or game-info fields; pending comment is committed first |
| Score display size | A− / A+ in the Score tab header; 12–36 px, independent app preference |
| Edit Game Info | Edit → Edit Game Info; maximizes the Info panel and focuses Black; **Done** restores the previous layout |
| Responsive layout | View → Responsive Layout (auto below 1120 px) |
| Copy position link | Tools → Copy Position Link |
| Position path | `?sgf=…&path=…` or Electron `--path=…` |
| Language | Options → Language dropdown |
| Coords / Nums buttons | White bold when active, dimmed when off |
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
| Delete move | Toolbar Delete Move, Play menu, or `Ctrl+Delete`; the Edit menu uses Cut Current Node instead |
| Cut current / after | Edit → Cut Current Node, or Edit → Cut All After Current |
| Fast rewind / forward | Toolbar ←← / →→ or Play menu; step count in Preferences → View → Board |
| Rotate / flip board | View → Rotate Clockwise, Flip Horizontally, Flip Vertically |
| Reset board orientation | View → Reset Board or `G` |
| Full screen | View → Toggle Full Screen or `F11` |
| Cut / copy / paste variation | `Ctrl+Alt+X` / `Ctrl+Alt+C` / `Ctrl+Alt+V` |
| Duplicate / insert node | `Ctrl+Alt+D` / `Ctrl+Alt+N` |
| Flatten variation | `Ctrl+Alt+F` |
| Move-number count | View → Move Numbers dropdown |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| New / open / save SGF | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| Open SGF from Explorer | Double-click the associated `.sgf` (installer registers it; portable: Open with → Choose another app) |
| Save SGF As | `Ctrl+Shift+S` |
| Reload current file | File → Reload |
| Import files as branches | File → Import Files as Branch… |
| Save board as picture | File → Save Board as Picture or `Ctrl+Q` (PNG/JPEG, partial selection) |
| Quit | File → Quit, `Ctrl+Shift+Q`, or the window X (same unsaved-game confirmation; desktop only) |
| Copy / paste SGF | `Ctrl+Shift+C` / `Ctrl+Shift+V` |
| Engine tab | Click **Engine** next to Info / Comment |
| Manage engines | Engine → Manage Engines… |
| Attach / detach engine | Engine → Attach Engine; the same item becomes Detach Engine |
| Generate Move | Engine → Generate Move (or the Engine tab button) |
| Engine analysis | Engine → Analysis |
| GTP console | Engine → GTP Console… |
| Estimate / Score | Play → Estimate (`Ctrl+Shift+E`) or Play → Score (`Ctrl+Shift+R`); click stones to mark them dead |
| Close scoring | `Esc` or the **Done** button in the scoring card |
| Captured-stone bowls | View → Show Go Bowls (Japanese games, wide board panes only) |
| Swap player seats | View → Swap Player Sides |
| Menus | `Alt+F / E / A / P / V / T / O / H / G` |
| Help | `F1` |

## SGF support and limits

### Modified FF[4]

Game files are SGF **FF[4]**, and standard FF[4] from other editors opens unchanged. On top
of the format, MultiGo Neo writes a small, documented extension set — the **modified FF[4]**
dialect inherited from the my-Sabaki fork — so colours survive a save/load round trip:

| Extension | Written as | Notes |
| --- | --- | --- |
| Coloured lines and arrows | `LN[aa:ae:red]`, `AR[ha:he:blue]` | The optional third component names the colour: `black`, `white`, `red`, `yellow`, `blue`, `green`. |
| Coloured dim rectangles | `DD[kk:mm]` plus `SBKDD[blue:kk:mm]` | The standard `DD` still dims the region in other viewers; the private `SBKDD` companion stores the colour. |
| Producer tag | `AP[MultiGo Neo:1.0]` | Identifies the app in newly created files. |

Everything else stays untouched FF[4]: unknown properties, variations, setup stones, comments
and markup are preserved losslessly, which the round-trip tests cover. Other readers ignore
`SBKDD` and keep dimming the correct area from `DD`; a reader that does not implement the
fork's colour extension may ignore or mis-read the third `AR`/`LN` value.

Supported root properties: `GM`, `FF`, `CA`, `AP`, `SZ`, `PB`, `BR`, `PW`, `WR`, `RE`,
`KM`, `HA`, `RU`, `DT`, `EV`, `PC`, `GN`, `GC`, `C`.

Setup and markup: `AB`, `AW`, `AE`, `PL`, `B`, `W`, `C`, `CR`, `MA`, `SQ`, `TR`, `LB`, `L`,
`AR`, `LN`, `DD`, `SBKDD`, `BM`, `TE`, `DO`, `IT`.

Known limitations of this milestone:

- **Only the first game tree in a collection is loaded.** Saving writes that one tree.
- **No NGF, GIB or UGF import.** SGF only for now.
- **No find/hotspot mode or guess mode.** Scoring is manual: seki and life-and-death are the
  player's judgement; Estimate offers a heuristic dead-stone suggestion that you can correct.
- **GTP engines are external programs**: GNU Go has no analysis command, analysis interval and
  win-rate graph are not configurable yet, and engine-vs-engine play is not implemented.
- Markdown is a [safe subset](#supported-comment-markdown), not full Sabaki react-markdown; code blocks and images are not
  rendered as code/images.
- No user theme/texture **directory** (the four built-in CSS themes are fixed), no
  board-transformation UI, and no full localization of runtime log messages (the editor
  interface itself is bilingual).
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
src/path-spec.js          position-path parser/resolver/builder, shared with the embed
src/scoring.js            territory/area scoring, dead-stone lifting, dame and ownership
src/engine-core.js        GTP vertex/analysis/sync helpers shared by renderer and tests
src/engine.js             engine list, attach/detach, sync, analysis overlay, console
src/index.html            menus, toolbars, tabs, board, graph, dialogs
src/styles.css            MultiGo Neo shell, edit bar, tabs, graph, comments, portrait layout
src/themes/*.css          Classic / Flat / Dark / Paper board palettes (CSS custom properties)
src/renderer.js           tree state, canvas rendering, tools, themes, overlays, file actions
src/embed.html            zero-JS embed examples
src/embed.js              auto-init canvas viewer for [data-multigo] elements
src/embed.css             embed widget and demo-page styles
electron/main.js          native window, dialogs, folder memory, IPC, --path
electron/gtp.js           dependency-free GTP controller (framing, streaming, timeouts)
electron/engine-config.js reader/writer for engines/engines.json
electron/engine-manager.js  engine process registry and IPC event forwarding
electron/preload.js       contextBridge API
engines/*.cmd             local engine shims (GNU Go, Fuego, Pachi, KataGo, Leela, AQ, Zen)
engines/engines.json      hand-editable engine connection list shared with Manage Engines
engines/README.md         shim and configuration reference
scripts/test-tree.js      5 tree/SGF/go-board tests
scripts/test-path.js      5 position-path tests
scripts/test-scoring.js   13 territory/area scoring and estimator tests, including the MultiGo 7×7 reference and standard Area/handicap checks
scripts/test-gtp.js       GTP controller, analysis parsing and sync-command tests
scripts/test-engine-config.js  engine JSON load/save/path tests
scripts/fixtures/fake-gtp-engine.js  deterministic GTP engine for tests and CDP runs
scripts/test-engine.js    legacy coordinate/rules tests
scripts/verify-port-ui.mjs CDP test for the seven ported ideas and screenshots
scripts/verify-requests-ui.mjs CDP test for FF[4] logs, recents, pass labels and 四4
scripts/verify-menu-ui.mjs CDP test for dropdown menus, branch hints, toolbar state and nav logs
scripts/verify-properties-ui.mjs CDP test for FF[4] logging of non-move properties
scripts/verify-tree-ui.mjs CDP UI smoke test and screenshot generator
scripts/verify-view-ui.mjs CDP test for custom boards and View controls
scripts/verify-options-ui.mjs CDP test for validation, messages, language and persistence
scripts/verify-edit-ui.mjs CDP test for Edit operations, panel limits and move markers
scripts/verify-review-ui.mjs CDP test for sibling badges, Read Only, game info and comment editor
scripts/verify-r17-ui.mjs CDP test for player columns, compact panes, single-branch hints, fast/steps, delete and comment height
scripts/verify-tree-collapse-ui.mjs CDP test for orthogonal tree bones and branch expand/collapse
scripts/verify-tree-main-ui.mjs CDP test for leftmost main variation, 1.32x row pitch, 36 px columns, bottom toggles and initial collapse
scripts/verify-paper-theme-ui.mjs CDP test for flat printed stones in the Paper theme
scripts/verify-dirty-transform-ui.mjs CDP test for unsaved prompts, board transforms, G reset and fullscreen
scripts/verify-file-tools-ui.mjs CDP test for Reload, branch imports, board PNG export and Ctrl-Q
scripts/verify-comment-font-ui.mjs CDP test for adjustable comment font persistence
scripts/verify-comment-nav-ui.mjs CDP test for comment-focused branch navigation, focus retention and Ctrl+S
scripts/verify-themes-ui.mjs CDP capture of the four 13x13 theme screenshots
scripts/verify-count-ui.mjs CDP test for dual-rule Estimate/Score, dead stones, markers, bowls, RE and double passes
scripts/verify-capture-sound-ui.mjs CDP test that a real capture creates the bowl sound
preview/capture-sound-test.html  standalone sound-test page for the capture voice
scripts/render-capture-sound.mjs  renders preview/capture-sound.wav and its cue manifest
scripts/verify-capture-sound-test-ui.mjs CDP + WAV test for the sound-test page
scripts/verify-setup-ui.mjs CDP test for merged Preferences categories, apply/cancel/reset and defaults
scripts/verify-engine-ui.mjs CDP test for attach, genmove, analysis and the GTP console
scripts/build-sabaki-bundle.mjs  rebuilds src/sabaki-bundle.js
scripts/make-icon.ps1     regenerates the lighter Classic kaya goban icon (GDI+, no tools needed)
build/icon.ico            shared Windows icon for the app, installer, uninstaller and portable exe (16-256 px)
build/icon-512.png        512 px icon export for store/desktop use
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
  [`study/design/my-Fig-test.png`](study/design/my-Fig-test.png) — original design files
  (unchanged)
- [`study/design/old-board/`](study/design/old-board) — old-board photographs used as the
  colour reference for the **Dark** theme

## Next phases

1. Automatic dead-stone suggestion and score-drawer refinements for scoring.
2. Engine-vs-engine play, configurable analysis interval/visits, win-rate graph, engine presets and score-lead display refinements.
3. NGF/GIB/UGF import, collections/game chooser.
4. Find/hotspots, guess mode, board transformations, and full SGF property editing.
5. User theme/texture packs, richer Markdown, and complete localization of runtime messages.
