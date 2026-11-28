# MultiGo Neo — Reference

**Version 1.1.26 · 2026-11-28**

This is the lookup document for every user-invokable command in MultiGo Neo: menu items,
toolbar buttons, mouse actions, shortcuts, dialogs and special modes. For a guided introduction
use [Tutorial.md](Tutorial.md); for the feature history use [Features.md](Features.md); for the
full manual use [README.md](README.md).

---

## 1. Starting the app

| Form | How to start | Notes |
|---|---|---|
| Installer | Run `MultiGo-Neo-<version>-setup.exe` and launch **MultiGo Neo** | Per-user install; creates shortcuts and the `.sgf` association |
| Portable | Double-click `MultiGo-Neo-<version>-portable.exe` | No installation; SGFs travel inside the exe |
| Web / USB | Open `index.html` in Chrome or Edge | No server or network; settings live in the browser |

The desktop app allows **multiple instances**: each launch is a new process/window. In the browser,
**File → New Window** opens another tab. Each window/tab has its own board, game tree and engine
session; preferences, recents and layout are shared.

---

## 2. Menus

### 2.1 File

| Command | Shortcut | Description |
|---|---|---|
| New Game | `Ctrl+N` | Starts a fresh game at the current board size; asks before discarding unsaved changes |
| New Window | `Ctrl+Shift+N` | Another window (Electron) or tab (browser) with its own game |
| Open SGF… | `Ctrl+O` | Opens an SGF/FF[4] file |
| Reload | — | Re-reads the current file and restores the selected branch/node |
| Import Files as Branch… | — | Adds one or more SGFs as branches under the current node |
| Recent Files | — | Seven most recent files, newest first |
| Clear Recent Files | — | Empties the recent list |
| Save SGF | `Ctrl+S` | Saves over the current file (download in the browser) |
| Save SGF As… | `Ctrl+Shift+S` | Saves a copy under a new name |
| Save Board as Picture | `Ctrl+Q` | Exports PNG/JPEG, whole board or a dragged region |
| Quit | `Ctrl+Shift+Q` | Exits, after the unsaved-changes prompt |

### 2.2 Edit

| Command | Shortcut | Description |
|---|---|---|
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` | Reverts or reapplies an edit |
| Edit Mode | `Ctrl+E` | Switches between playing moves and editing stones/marks |
| Read Only | — | Locks all edits; navigation and viewing remain available |
| Edit Game Info | — | Focuses the Info panel’s game fields (Black, White, komi, rules…) |
| Edit Node Comment | — | Focuses the Comment editor for the current node |
| Edit Node Name | `F2` | Edits the FF[4] `N` property in the tree |
| Cut Current Node | `Ctrl+Alt+X` | Removes the current node and its subtree to the variation clipboard |
| Copy Current Variation | `Ctrl+Alt+C` | Copies the current branch as SGF to the variation clipboard |
| Paste Variation as Child | `Ctrl+Alt+V` | Attaches the copied variation under the current node |
| Duplicate Current Node | `Ctrl+Alt+D` | Inserts a copy of the current node as a sibling |
| Insert Empty Node | `Ctrl+Alt+N` | Inserts a pass-through node with no move |
| Make Main Variation | — | Moves the current branch to the first-child position |
| Remove Other Variations | — | Deletes the current node’s sibling branches only |
| Flatten Current Variation | `Ctrl+Alt+F` | Deletes every sibling branch along the path from the root, leaving one line (see §9) |

### 2.2.1 Advanced

| Command | Shortcut | Description |
|---|---|---|
| Switch Black/White | — | Swaps every `B`↔`W` move and `AB`↔`AW` setup stone throughout the tree (also swaps `PL`); asks for confirmation |
| Hide All Stones | — | Display-only toggle that hides every stone and dead marker; the SGF is unchanged |
| Delete All Comments | — | Removes `C` from every node after confirmation |
| Delete SGF Properties… | — | Enter property codes (e.g. `CR, MA, DD`) to remove them from every node; the dialog lists the properties present |
| Set Move Number… | — | Sets or removes the `MN` property on the current node |
| Move Branch Up / Down | — | Reorders the current branch among its siblings |
| Hide Markers | — | Toggles the **Hide markup** display preference |
| White Move First | — | Toggles the new-game preference (also in Preferences → Edit) |
| Copy SGF / Paste SGF | `Ctrl+Shift+C` / `Ctrl+Shift+V` | SGF clipboard commands, exposed only here in the menus |
| Delete All After Current | — | Removes every continuation after the current node (kept in the clipboard) |
| Clear Node Markup | — | Current node only (see §9) |

### 2.3 Play

| Command | Shortcut | Description |
|---|---|---|
| Pass | `P` | Plays a pass (`B[]`/`W[]`) |
| Auto Play | `Space` | Starts/pauses automatic replay at the configured delay |
| Estimate | `Ctrl+Shift+E` | Opens scoring with sealed dead stones pre-marked |
| Score | `Ctrl+Shift+R` | Opens scoring with no dead stones selected |
| First Move | `Home` | Jumps to the root |
| Fast Rewind | — | Steps back several moves (configured count) |
| Parent Node | `↑` | Previous node in the current line |
| First Child | `↓` | Next node (preferred child) |
| Fast Forward | — | Steps forward several moves |
| Last Move | `End` | End of the current branch |
| Delete Move | `Ctrl+Delete` | Deletes the current node (same as the toolbar Delete Move) |

### 2.4 Engine

| Command | Description |
|---|---|
| Manage Engines… | Edits `engines/engines.json`: name, executable path, arguments, working directory |
| Generate Move | Asks the attached engine for a move and plays it |
| Analysis | Toggles streaming analysis (win rate, score lead, candidates, board overlay) |
| GTP Console… | Docked console for raw GTP commands and replies |

Engines are external programs (GNU Go, KataGo). Each window starts its own engine session.

### 2.5 View

| Command | Description |
|---|---|
| Board Size | 9×9, 13×13, 19×19 or **Custom…** (`width*height`, 2–52 per side) |
| Coordinates | None, **A1**, **1–1**, **四4**; labels on all four sides |
| Move Numbers | None, All, Last 10/25/50, Custom… |
| Numbering | Game Start or Variation Start |
| Show Next Moves | Candidate markers for the current branch |
| Show Sibling Variations | Sibling branch letters |
| Show Go Bowls | Captured-stone bowls during Japanese play |
| Zoom In / Out / Reset Zoom | Board zoom around the current centre |
| Rotate Clockwise | Display-only 90° rotation |
| Flip Horizontally / Vertically | Display-only mirroring |
| Reset Board | `G` — clears rotation/flips |
| Swap Player Sides | Moves Black to the top and swaps the bowls |
| Toggle Full Screen | `F11` |
| Show Info Tabs / Node Name / Variations / Game Tree / Messages | Independent sidebar section visibility |
| Responsive Layout | Automatic portrait/desktop layout below 1120 px |
| Scroll Menu and Tool Bars | One-row scrolling bars instead of wrapping |
| Reset Panel Layout | Restores the default splitter positions |

### 2.6 Tools

| Command | Description |
|---|---|
| Copy Position Link | Copies a URL/CLI path that reopens the current position |
| Clear Messages | Empties the Message panel |

### 2.7 Options

| Command | Description |
|---|---|
| Preferences… | Single dialog with Board, Stones, Markers & Numbers, Other, Traverse and Edit categories |
| Customize Toolbar → Main Toolbar… | Checklist of Main-toolbar buttons |
| Customize Toolbar → Edit Toolbar… | Checklist of Edit-toolbar buttons |
| Customize Toolbar → Option Toolbar… | Checklist of Option-toolbar buttons |
| Customize Toolbar → Traverse Toolbar… | Checklist of Traverse-toolbar buttons |
| Language | English / 简体中文 |
| Theme | Classic, **Basic**, Flat, Dark, Paper |
| Remember Last Board Size | Reopens with the last size |
| Autoplay Delay | 0.5 / 1 / 2 / 3 seconds |
| Reset All Settings | Restores every preference to its default |

#### 2.7.1 Customize Toolbar

**Options → Customize Toolbar → Main Toolbar… / Edit Toolbar… / Option Toolbar… / Traverse
Toolbar…** opens the Customize Toolbars dialog at the matching section. Click the **Customize
Toolbar** row in the Options menu to expand the four children. Each checkbox shows/hides one
button:

- **Main** — New, Open, Save, Undo, Redo, Edit mode.
- **Edit** — black/white/erase stones, cross, triangle, square, circle, line, arrow, dim, label,
  number, theme/black/white/red/yellow/blue/green colours and Player to Move.
- **Option** — Show coordinates, Show move numbers, Board Size.
- **Traverse** — Root, Fast rewind, Parent, First child, Fast forward, End, Auto play, Pass,
  Delete move.

Changes apply immediately and are stored in `localStorage` with the other settings. **Reset All**
inside the dialog restores every button. Hiding is per toolbar; the keyboard shortcuts and menu
commands remain available.

### 2.8 Help

| Command | Description |
|---|---|
| README (PDF) | Opens `README.pdf` |
| Features (PDF) | Opens `Features.pdf` |
| Tutorial (PDF) | Opens `Tutorial.pdf` |
| Reference (PDF) | Opens `Reference.pdf` |
| Keyboard Shortcuts | `F1` quick shortcut sheet |
| About MultiGo Neo | Version, build and credits |

---

## 3. Toolbar and board

| Control | Action |
|---|---|
| New / Open / Save | Same as the File menu commands |
| Undo / Redo | Same as Edit |
| First / Previous / Play-Pause / Next / Last | Play-menu navigation; middle button is Auto Play |
| Fast Rewind / Fast Forward | Multi-move jumps |
| Pass | Plays a pass |
| Edit Mode | Toggles edit mode |
| Board size | 9×9, 13×13, 19×19, Custom… |
| Coords / Nums | Toggles coordinate labels and move numbers |
| Board click | Plays a move; in Edit mode applies the selected stone/mark tool |
| Board right-click | Removes the current move (`Preferences → Edit → Right-click board removes the current move`) or erases a mark in Edit mode |
| Coordinate margin click | Toggles normal/double coordinate labels |
| Drag splitter | Resizes board, sidebar, tree or Message panels |

---

## 4. Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New game / New window | `Ctrl+N` / `Ctrl+Shift+N` |
| Open / Save / Save As | `Ctrl+O` / `Ctrl+S` / `Ctrl+Shift+S` |
| Save board as picture / Quit | `Ctrl+Q` / `Ctrl+Shift+Q` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Edit mode | `Ctrl+E` |
| Node name editor | `F2` |
| Parent / first child | `↑` / `↓` |
| Previous / next sibling branch | `←` / `→` |
| Root / end | `Home` / `End` |
| Auto play / pause | `Space` |
| Pass | `P` |
| Toggle player to move | `Ctrl+Shift+P` |
| Delete move | `Ctrl+Delete` |
| Copy / cut / paste variation | `Ctrl+Alt+C` / `Ctrl+Alt+X` / `Ctrl+Alt+V` |
| Duplicate / insert node | `Ctrl+Alt+D` / `Ctrl+Alt+N` |
| Flatten variation | `Ctrl+Alt+F` |
| Copy / paste SGF | `Ctrl+Shift+C` / `Ctrl+Shift+V` |
| Rotate / flip / reset board | `View` menu; `G` resets |
| Full screen | `F11` |
| Edit tools | `Ctrl+1`…`Ctrl+9`; dim `Ctrl+Shift+D` |
| Move while commenting | `Ctrl+Shift+↑/↓` previous/next in branch; `Ctrl+Shift+←/→` switch branch |
| Estimate / Score | `Ctrl+Shift+E` / `Ctrl+Shift+R` |
| Zoom in / out | `Ctrl++` / `Ctrl+-` (plus menu) |
| Keyboard shortcuts sheet | `F1` |

The full list, including toolbar accelerators, is in the in-app **Help → Keyboard Shortcuts**
sheet.

---

## 5. Dialogs and panels

| UI | What it does |
|---|---|
| **Preferences** | Board (theme, brightness, coordinates, default size, fast-step count), Stones (texture), Markers & Numbers, Other (title result), Traverse (sounds, autoplay, variation preference), Edit (komi, White first, right-click undo, Read Only, SGF size limit) |
| **Info** | Game Information fields: players, ranks, teams, komi, handicap, result, rules, date, time |
| **Comment** | Markdown editor with rendered preview and A−/A+ display size |
| **Engine** | Engine selector, Attach/Detach, Manage, Generate Move, Analysis, console |
| **Score** | Rules selector, dead-stone toggling, Chinese/Japanese/Area/Territory totals, audit tables, Write RE, Done |
| **Node Name** | Edits the `N` property beside the tree |
| **Variations** | Lists immediate next moves with coordinates and branch names |
| **Game Tree** | Move nodes, branches, collapse toggles, click to navigate |
| **Messages** | SGF/property log, status and warnings |
| **Save Board as Picture** | Filename, PNG/JPEG, size, spacing, coordinates, grayscale, dead stones, drag selection |
| **Manage Engines** | Engine rows with name/path/arguments; Reload File |
| **Keyboard Shortcuts** | `F1` reference sheet |
| **About** | Version and build information |

---

## 6. Position links, embeds and URLs

- **Tools → Copy Position Link** creates `…?sgf=<SGF>&path=<position-path>`.
- The desktop app also accepts `--path=B1B2` or an SGF filename argument.
- `embed.html` renders a board from `data-sgf`/`data-path` attributes with no JavaScript API.
- Recent files are remembered (seven entries); the browser caches up to 400 KB of SGF text per
  entry.

---

## 7. SGF support and limits

- Reads/writes **FF[4]**, including setup stones (`AB/AW/AE`), markup (`CR/MA/SQ/TR/LB/L/AR/LN`),
  annotations (`BM/TE/DO/IT`), dim properties (`DD/SBKDD`), comments (`C`), node names (`N`),
  game info and unknown properties preserved on save.
- Board sizes **2×2 to 52×52**, including rectangular `SZ[w:h]`.
- SGF open/import/save limit: **5 MB** default, 1–500 MB in Preferences → Edit; oversized imports
  are reported, not silently dropped.
- Read Only prevents all modifications and saving.

---

## 8. Multiple windows and instances

- Windows: each launch is a separate process/window; `.sgf` double-click opens a new window.
- **File → New Window** (`Ctrl+Shift+N`) creates another window in the same process.
- Web: **File → New Window** opens a new tab; every tab is independent.
- Shared across windows: preferences, recent files, layout. Per-window: board, game tree, current
  file, engine session.

---

## 9. Detailed command notes

### Flatten Current Variation (`Ctrl+Alt+F`)

Removes **all sibling branches along the path from the root to the current node**. The selected
line becomes the only line in the document; nodes in every other branch are discarded. This is
stronger than **Remove Other Variations**, which only deletes siblings of the current node.
Undo restores the removed nodes; save only after checking the result.

### Clear Node Markup

Removes the current node’s markup properties only:
`CR`, `MA`, `SQ`, `TR`, `LB`, `L`, `AR`, `LN`, `DD`, `SBKDD`, `BM`, `TE`, `DO`, `IT`.
It does **not** remove the move, comment (`C`), node name (`N`), setup stones (`AB/AW/AE`) or any
other node. Undo restores it.

---

## 10. MultiGo 4 Advanced menu → MultiGo Neo

MultiGo 4.4.4 has an **Advanced** menu. MultiGo Neo keeps the feasible commands in that menu;
duplicate Edit/Tools entries were removed so each command has one menu location. This table maps
the documented MultiGo Advanced commands to their current location.

| MultiGo 4 Advanced command | MultiGo Neo location | Status / notes |
|---|---|---|
| Switch Black/White (swap stone colours) | **Advanced → Switch Black/White** | Implemented for the whole tree (`B/W`, `AB/AW`, `PL`) |
| Hide All Stones | **Advanced → Hide All Stones** | Implemented as a display toggle; it does not add an `AE` node |
| Delete All Comments | **Advanced → Delete All Comments** | Implemented as a bulk action |
| Delete SGF Properties | **Advanced → Delete SGF Properties…** | Implemented for the codes you enter |
| Move Branch Up / Down | **Advanced → Move Branch Up / Down** | Reorders the current branch among siblings |
| Merge Branch | **Edit → Flatten Current Variation** / **Remove Other Variations** | Not a true merge; flatten keeps one line, remove-siblings only local |
| Merge Same Nodes | — | **Not implemented** |
| Copy SGF | **Advanced → Copy SGF** | Whole-tree SGF clipboard command |
| Paste SGF as Branch | **Advanced → Paste SGF** / Edit → Paste Variation as Child | Paste SGF replaces the document; Paste Variation attaches under the node |
| Clear Node Markup / remove SGF marks | **Advanced → Clear Node Markup** | Current node only |
| Edit Game Info | **Edit → Edit Game Info** | Same |
| Delete Everything After Current Node | **Advanced → Delete All After Current** | Also copies the removed continuation to the clipboard |
| Set Move Number From Current Node | **Advanced → Set Move Number…** | Writes/removes `MN` on the current node |
| Hide Markers | **Advanced → Hide Markers** / Preferences → Markers & Numbers | Display preference |
| White Move First | **Advanced → White Move First** / Preferences → Edit | Applies to new games |
| Batch convert/trim files | — | **Not implemented** |

References: MultiGo’s official [feature list](https://www.ruijiang.com/multigo/features.php) and
[change history](https://www.ruijiang.com/multigo/download.php); the Advanced items above come
from those notes and the MultiGo 4 user discussions.

---

## 11. MultiGo 4 toolbar coverage

MultiGo’s toolbar is user-customizable (right-click → Customize), and MultiGo Neo now offers the
same idea through **Options → Customize Toolbar → Main/Edit/Option/Traverse Toolbar…**. The
comparison below uses the default 4.4.4 function groups. “Menu” means the command exists but is
not a toolbar button.

| MultiGo toolbar function | MultiGo Neo location | Status |
|---|---|---|
| Customize toolbars | Options → Customize Toolbar → Main/Edit/Option/Traverse Toolbar… | ✅ four checklists |
| New / Open / Save | Toolbar | ✅ |
| Save As | File menu | Menu only |
| Print / Print Preview | — | **Missing** |
| Batch convert | — | **Missing** |
| Undo / Redo | Toolbar | Present |
| Cut / Copy / Paste variation | Edit menu / `Ctrl+Alt+X/C/V` | Menu + shortcuts |
| Game Info / Comment | Edit menu | Menu |
| Setup stones, black/white/erase | Edit bar (Edit Mode) | Present |
| Cross / triangle / square / circle / line / arrow / label / number / dim | Edit bar | Present |
| Annotations (good/bad/doubtful/interesting) | — | **Missing** as an authoring UI; `BM/TE/DO/IT` are cleared by Clear Node Markup |
| Hide Markers | Advanced menu / Preferences | Present |
| Switch Black/White | Advanced menu | Present |
| Traverse first / prev / next / last / fast | Toolbar | Present |
| Auto play / pause | Toolbar | Present |
| Pass / Delete move | Toolbar | Present |
| Bookmarks | — | **Missing** |
| Find / search nodes | — | **Missing** |
| Coordinates / move numbers | Toolbar | Present |
| Board size | Toolbar | Present |
| Zoom / rotate / flip / full screen | View menu | Menu + shortcuts |
| GNU Go / GTP engine | Engine menu/tab | Present |
| Score / Estimate | Play menu / Score tab | Present |
| English/Chinese, themes | Options menu | Present |

---

## 12. Toolbar icon assets

Every toolbar icon is an editable SVG in **`src/assets/icons/`**, one file per icon. The file name
is the sprite id (`new.svg` → `#i-new`). To change an icon:

1. Edit or replace the SVG. Keep its `viewBox` (usually `0 0 24 24`) and use `currentColor` for
   fills/strokes so it follows the toolbar text colour.
2. Run **`npm run icons:build`**. This regenerates the inline sprite at the top of
   `src/index.html` from the folder; the app loads that sprite (external SVG files cannot be
   loaded from `file://` in Chrome/Electron because of CORS).
3. Rebuild/reload the app.

The folder’s `README.md` has the same instructions and the current file list. `src/assets/icons/`
is packaged with the source; the generated sprite is what the installed app displays.

---

*End of Reference. For the guided path start with [Tutorial.md](Tutorial.md); for the full manual see
[README.md](README.md).*
