# Drago → MultiGo Neo: what is worth migrating

Decision document. Nothing has been implemented; this is the evaluation requested before
proceeding.

- **Source:** `../my-Drago` — Gilles Arcas' **Drago 4.33** (`src/DefineUi.pas:16`), repo HEAD
  `ace495c`. 159 Pascal units, **67 571 lines**, 60 VCL forms, 19 interface languages,
  `LibKombilo` (MIT, Ulrich Goertz, 3-file SQLite database), `HaruPDF`, 188 pro-player
  photos, 2 stone sets, 18 wood textures.
- **Target:** `my-Fig-test` — MultiGo Neo, ~6.8 k lines of own code (renderer 3028,
  index.html 687, styles 1339, embed 482, go-engine 507 …), one `#board` canvas, no
  framework, Sabaki libraries vendored, zero runtime dependencies.
- **Snapshot:** 2026-10-28, working tree including the uncommitted theme / embed /
  position-link / hover work (the README is being updated in parallel and trails it).

Scale: Drago is ~10× our code and covers five products (editor, printer/exporter, problem
trainer, replay trainer, game database). Porting all of it is a second application; porting a
slice is a weekend.

---

## 1. TL;DR

Drago's **editor** is not worth migrating — we already pass it (Drago marks `AR`, `LN`, `DD`
as *"Not handled"* in `Help/En/FormatSGF.htm` and supports 3–19 boards only — same page).
The value is in the things around the editor:

| # | Feature | Why it matters here | Effort |
|---|---------|--------------------|--------|
| 1 | **Position export** — region select, PNG, clipboard, "as books" | We draw a canvas and cannot give the user a picture of it. Every forum post needs one. | S–M |
| 2 | **ASCII diagrams** — Sensei's Library + rec.games.go | Pure string layout, no dependency, no competitor does it well. Best value per line on this list. | S |
| 3 | **Scoring core** (`Counting.pas` → JS) + dead-stone marking + `TB`/`TW` | Roadmap item #1, and Drago has exactly the algorithm we lack. | M |
| 4 | **Board transforms** — mirror, flip, rotate, swap colours | Named as missing in our README; display-only maths. | S |
| 5 | **Collection editing** — keep all roots, chooser, append/merge/extract | The real blocker: prerequisite for problem mode, replay mode, multi-game printing, thumbnails. | M |

Second wave: problem-solving sessions, replay/guess sessions with a score index, full-game
printing as PDF. **Do not port** the database or the engine layer — §7.

---

## 2. Where Drago is genuinely ahead

| Capability | Evidence | Our state |
|---|---|---|
| Print a whole game: figures at start / end / every *N* moves / at each `FG` / at each comment / variations; `\game \figure \moves \player` titles; relative figure numbers (`2.1.3`); comments with move numbers; header/footer DSL; 7 built-in styles | `Help/En/Impression.htm`, `UPrint.pas` (969 lines), `UPrintStyles.pas:27-68`, `:499-510` | none |
| Export games to RTF / HTM / DOC / PDF / TXT; figures to WMF / GIF / PNG / JPG / BMP / PDF / ASCII / SGF, with figure files `<root>0001.ext` | `DefineUi.pas:239-248`, `UExporter*.pas` | none |
| **Book layout** — prisoners kept, first stone per point, later moves as over-moves `56 at 34` (`above/below/left of/right of`, Korschelt fallback) | `UBookBoard.pas:193-271`, `:283-424` | none |
| Export a *position*: drag a rectangle (`D4:K10` or SGF coords), size/stone-diameter linkage, As board / **As books**, WMF/PDF/GIF/PNG/JPG/BMP/ASCII/SGF, clipboard for WMF/BMP/ASCII | `Help/En/ExportPos.htm`, `UfmExportPos.pas:364-380, 501-634, 920-954` | none |
| ASCII diagrams: SL (`$$B`/`$$Bc`, 2-char cells, `X/O/./,/C/S/B/W/letters`), rec.games.go (configurable chars), 5-char trace | `UBoardViewAscii.pas:301-474` | none |
| Problem sessions: 4 selection modes, failure-ratio weighting, random symmetry + colour, hints, free mode, per-problem `attempts successes` store, status vocabulary F/C/G/D/I | `Help/En/ModeProblems.htm`, `UProblems.pas`, `UProblemUtil.pas:423-749`, `UMemo.pas:168-317` | none |
| Replay/guess sessions with a stored best-score index (B/W/both × full/fuseki) | `ModeParties.htm`, `ViewIndex.htm` | none (Sabaki's guess bar is nearest) |
| Collections: next/previous game, sortable info table, thumbnail grid, append / merge / extract current / extract all / delete game / make game tree | `ModeNavigation.htm`, `ViewIndex.htm`, `UGameColl.pas`, `UFactorization.pas` | loads **only the first root** and warns (`renderer.js:2179`) |
| Board transforms: mirror, flip, rotate 90°, swap colours, "opponent view" | `Drago-En.lng:56-62` | none |
| Counting: `TerritoryCounting`, `AreaCounting`, `FindTerritories`, `LivingStones`, `KomiValue`, `FormatResult` | `Counting.pas` (241 lines, no forms) | none |
| Tabs, each with board/info/thumbnail views and a mode glyph | `Interface.htm` | single document (`tree`, `nodeId` module globals) |
| Codepage fallback for SGFs without `CA` | `CodePages.pas`, `Options.htm` | UTF-8 only |
| Autoreplay **targets**: next/prev variation end, comment, figure, annotation, every *n* moves | `ModeNavigation.htm` | autoplay only |
| Drag a stone to correct a played move; Ctrl-click a stone → jump to its move | `ModeEdition.htm`, `ModeNavigation.htm` | no |
| Favourites/MRU, read-only mode, open/save SGF via clipboard, unknown-property badge, node info in status bar when panels collapse, capture/pass sounds, player photos | `Favoris.htm`, `Interface.htm` | partial |

## 3. Where we are already ahead

Coloured `AR`/`LN` (third field), `DD` + `SBKDD`, Markdown comments, variation badges, hover
ghosts, four CSS themes with wood grain, responsive portrait layout, position-link DSL,
zero-JS embed viewer, 2×2…52×52 rectangular boards, EN/中文.

Consequence: the migration stays strictly additive. **No Drago rendering, dialog, form or SGF
plumbing gets reused** — only algorithms, data formats and interaction ideas.

---

## 4. Wave 1 — small, self-contained, immediate value

**1.1 Export the current position as an image — `S–M`, ~250 lines**
Model: Drago's `Export position…` dialog (rectangle select, output size in px, stone diameter,
As books). Ours: one canvas (`index.html:487`), one `drawBoard()` (`renderer.js:1439`).
Traps to note: the canvas is **transparent over the CSS theme surface**, so export must fill
the themed surface first; and a region selection needs its own overlay transform, separate
from the existing zoom. Deliverable: *Tools → Export Position…* with *Copy Image* and *Save
PNG*.

**1.2 ASCII diagram export — `S`, ~200 lines**
Drago's `TBoardViewAscii` has one formatting skeleton with three subclasses. SL output is the
most useful (paste straight into Sensei's Library); rec.games.go is the configurable one
(black/white/hoshi chars, optional edge). This is pure string building over the board matrix
we already compute, no dependency, and it lands diagrams in forum posts, chat and email.
Nothing else in our feature set is this cheap and this distinctive.

**1.3 Scoring core from `Counting.pas` — `M`, ~250 lines JS + UI**
`Counting.pas` is **241 lines** whose only dependencies are two constants units and the board
model — zero forms, zero dialogs. It exposes exactly what we need:

```
TerritoryCounting(gb, dead, blackPrisoners, whitePrisoners) -> TB, TW, sgfResult, detailed
AreaCounting(gb, dead)                                      -> TB, TW, sgfResult, detailed
KomiValue(scoring, handicap, komiHandicap0)                 -> komi by rules/handicap
```

with `FindTerritories` / `LivingStones` / `UpdatePrisoners` private. Port to JS over
`@sabaki/go-board`, then add: click-to-toggle dead stones, `TB`/`TW` + `RE` writing, and the
Japanese/Chinese/AGA choice. This is roadmap item #1 done properly, and it composes with
1.1/1.2 into a *scored* diagram.

**1.4 Board transforms — `S`, ~80 lines**
Mirror / flip / rotate 90° / swap colours, display-only plus optional SGF rewrite. Care: the
coordinate labels (A1 vs 1–1) and every markup coordinate must follow the transform.

**1.5 Interaction steals — `S` each**
- **Drag a played stone** to move it (edit mid-game without hand-editing SGF). Drago is
  explicit that this is its only way (`ModeEdition.htm`).
- **Ctrl-click a stone** → jump to the node that played it — cheap and habit-forming while
  reviewing.
- **Node info in the status bar** (move number, player to play, prisoners) when panels are
  collapsed.
- **Unknown-property badge** in the status bar, not just a log line.
- **Corner auto-crop** ("displayed zone", `Options.htm`): on 19×19, show only the quarter
  holding all stones — and let it apply to the export path too.

## 5. Wave 2 — training and collections

**2.1 Collection editing — `M`, ~500 lines (prerequisite for 2.2 / 2.3)**
We already parse the whole file and then keep `roots[0]` (`renderer.js:2175-2179`). Minimum
useful subset: keep every root, game list/chooser, next/previous, append, merge, extract
current, extract all (`<root>0000.sgf`, `Ugcom.pas:1074-1096`), delete current game.
Optional extra with the same pass: **Dyer signature** duplicate detection — 12 chars from
main-line moves 20/40/60/31/51/71 (`GameUtils.pas:211-245`), ~30 lines, lets us warn when an
opened collection contains the same game twice.

**2.2 Problem-solving session — `M`, ~400 lines**
The judging core is small and is pure tree walking (`UProblemUtil.pas:423-749`): a user move
is correct iff it continues the current node; wrong moves are `TR`/`WV` variants (uliGo), the
last move of a wrong branch (goproblems, comment contains `RIGHT`), or the main line —
autodetected (encodings 0/1/2/3). Plus hint (ghost the winning children, red-mark the bad last
move), free mode (snapshot/restore), random orientation (reuse 1.4's eight symmetries),
random colour, failure-ratio weighted selection, and a per-problem `attempts successes` store
(Drago uses an INI; we use JSON in `userData`, keyed by game signature).
Copy the status vocabulary verbatim — F running, C solved first try, G assisted, D failed,
I resigned (`ModeProblems.htm`); it is a well-designed little scheme.
**Dependency:** needs 2.1, because problem collections are multi-game files.

**2.3 Replay/guess session with an index — `M`, ~250 lines**
Same substrate as 2.2. Sabaki's guess bar gives the interaction (in `study/my-Sabaki`); the
additive part is Drago's **index**: per game, replay count and best score for B / W / both ×
full / fuseki (`ViewIndex.htm`), plus "unlimited attempts shows the distance to the
correct move".

**2.4 Printing — `L`, its own milestone**
The valuable half of `Impression.htm`: six figure-selection modes, muted-by-default options
for comments/titles/info, header/footer DSL (`\left 'Page ' \page \right \date`), 1–2 figures
per row with a first-figure-alone option, `FG`-driven figures, and book-style over-moves.
Two decisions worth making up front:

- **Rendering path:** HTML + print CSS + `webContents.printToPDF()` keeps us dependency-free
  and handles pagination through page-break rules. Drago's own PDF is *vector* (draw commands
  replayed per page, `UExporterPDF.pas:948-1083`); an offscreen high-DPI canvas render is a
  good enough substitute at 300 dpi and far cheaper. `pdf-lib` only if exact control is
  needed — that would be our first runtime dependency.
- **Order the work as three steps:** (A) current position / selected figures → PDF or PNG;
  (B) book mode (port `UBookBoard` once — it serves the *As books* display mode, position
  export and print over-moves); (C) full paginated game layout.
  Drago's `TPages` report writer, WMF/EMF, RTF and Word-OLE export are **not** portable and not
  needed.

---

## 6. Wave 3 — deliberate deferrals

- **Tabbed workspace** (`Interface.htm`): file/folder/database/session tabs, three views
  each, mode glyph. This is a state-model change, not a feature — today `tree` and `nodeId`
  are module-level. Decide it as architecture, and only if the app is meant to become a
  multi-document editor.
- **Autoreplay targets** — `S–M`, nice once collections exist.
- **Codepage fallback** — `S`. Sniff `CA`, else BOM, else heuristic; Chromium's `TextDecoder`
  already knows `gbk`, `big5`, `shift_jis`, `euc-kr`, so **no dependency** (unlike Sabaki,
  which pulls `iconv-lite` + `jschardet` for GIB/NGF/UGF).
- **Make game tree / factorisation** (`UFactorization.pas`): merge a collection into one
  fuseki tree with frequency/win annotations. Genuinely interesting, but it is a
  collection-analysis feature and only pays off with 2.1 in place.

## 7. What I would *not* migrate

**Game database + pattern search** (`LibKombilo`, `Database.htm`). Excellent, but it is a
second product: three SQLite files (`.db`, `.db1`, `.db2`), a DB builder with duplicate/error
handling, wildcard pattern regions, continuation statistics in three views
(Kombilo/full/digest), an SQL query box, and Dyer-signature search. It is a 32-bit ~1.5 MB
C++ DLL with a bundled SQLite amalgamation behind ~15 `__stdcall` exports.
If we ever want it, the honest first step is **pattern search over the currently opened
collection in memory** — the pattern alphabet is 5 characters (`X/x/O/o/./*`, lowercase =
wildcard, `UDatabase.pas:702-715`) and the anchoring rule is ~30 lines
(`FindSearchRectangle`, `:673-698`) — that is an `M`, yields most of the daily value, and only
then is persistence worth discussing.

**GTP engine layer** (`UEngines.pas`, `UGtp.pas`, `EngineSettings.pas`). Drago's analysis is
*older and weaker* than what we would inherit from Sabaki: four one-shot blocking commands
(`estimate_score`, `reg_genmove`, `initial_influence`, `dragon_stones`/`dragon_status` — GNU Go
extensions), each spawning a throwaway engine process, with results shown as temporary board
marks and a status-bar glyph. No win-rate, visits, PV, heatmap, graph or `SBKV`/`SBKS` node
storage; no engine-vs-engine; no pondering. The study fork's `enginesyncer.js` + `analysis.js`
already do the streaming protocol, the heatmap and the win-rate graph properly.
Three ideas are worth re-implementing without Drago's code, when engines arrive: the
**raw GTP console**, the **declarative engine profile** (argument templates + capability bits
from `list_commands`), and **auto-handicap** (±1 per result ladder).

**Also skipped:** toolbar designer, skins, shortcut remapping, 19-language machinery (we have
4 themes and 2 languages by design); WMF/RTF/DOC export (dead formats); sounds on
capture/pass (cheap gimmick, needs an asset set and a preferences page — last, if ever);
the 188 player photos (third-party photographs of named professionals, no clear
redistribution licence — fine locally, not fine to ship); custom bitmap stone packs
(`black17.png` per diameter with nearest-larger fallback is a good spec to keep on file, but
our CSS themes already cover the need).

## 8. Licence and attribution

- Drago source is **MIT** (`my-Drago/LICENSE`, © 2016 Gilles Arcas) — compatible with our MIT
  licence; port with attribution.
- `LibKombilo` is MIT-style (© 2006-7 Ulrich Goertz); bundled SQLite is public domain; HaruPDF
  is BSD-style. No copyleft blocker either way.
- Translating Pascal into JS is a derivative work: add a `src/vendor/` header per ported unit
  (`counting.js` ← `Counting.pas`, `bookboard.js` ← `UBookBoard.pas`, …) in the style of
  `src/vendor/gametree.js`, plus a README attribution line.

## 9. Decisions I need

1. **Wave 1 (1.1–1.5)** as one "share and score" milestone — go / no-go? It touches no
   document-model code.
2. **Collections before training** — accept that 2.1 must land before 2.2/2.3, or take problem
   mode first and accept single-game files only?
3. **Printing** — is "export a lecture note as PDF" in scope for this product, or is
   diagram export enough?
4. **Database** — parked, or is in-memory pattern search over an opened collection worth a
   probe?
