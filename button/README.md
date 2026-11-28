# MultiGo Neo button library

Extracted from `src/index.html`. **60 buttons** in 13 groups.

Each leaf folder contains:

- `button.html` — the exact current button markup.
- `button.json` — label, purpose, selector, action/tool, shortcut, styling class and icon reference.
- `icon.svg` — present only when the button uses an SVG icon.

Regenerate after UI changes:

```powershell
node scripts/extract-buttons.mjs
```

Production styling still comes from `src/styles.css` (`.tool`, `.editbar`, `.tabs .tab`,
`.menu-trigger`, `.message-clear` and `.color-swatch`); this folder stores the button
markup and icon sources, not a second copy of the stylesheet.

Folders marked with `.source-only` are hand-maintained and are preserved when this script
runs; every other folder is regenerated from `src/index.html`.

## Hierarchy

- **main-toolbar/file** (3): New game, Open SGF, Save SGF
- **main-toolbar/history** (3): Undo, Redo, Edit mode
- **main-toolbar/navigation** (6): Root node, Fast rewind, Parent node, First child, Fast forward, End of variation
- **main-toolbar/game** (5): Auto play, Pass, Delete move, Estimate, Score
- **main-toolbar/display** (2): Coords, Nums
- **main-toolbar/view** (7): Zoom out, Zoom in, Rotate clockwise, Flip horizontally, Flip vertically, Reset board, Toggle full screen
- **edit-toolbar/stones** (3): Black stone, White stone, Erase stone
- **edit-toolbar/marks** (9): Cross, Triangle, Square, Circle, Line, Arrow, Dim area, Label, Number
- **edit-toolbar/colors** (7): Theme colour, Black, White, Red, Yellow, Blue, Green
- **edit-toolbar/turn** (1): Turn
- **sidebar/tabs** (4): Info, Comment, Engine, Score
- **sidebar/messages** (1): Clear
- **menu-bar/menu** (9): File, Edit, Advanced, Play, Engine, View, Tools, Options, Help

## Source-only icons

- `main-toolbar/view/toggle-layout` — hand-maintained icon/metadata, no generated toolbar button yet.

## Index

| Area | Group | Button | Kind | Action/tool | Icon |
|---|---|---|---|---|---|
| main-toolbar | file | New game | icon | new-game | icon.svg |
| main-toolbar | file | Open SGF | icon | open-sgf | icon.svg |
| main-toolbar | file | Save SGF | icon | save-sgf | icon.svg |
| main-toolbar | history | Undo | icon | undo | icon.svg |
| main-toolbar | history | Redo | icon | redo | icon.svg |
| main-toolbar | history | Edit mode | icon | toggle-edit | icon.svg |
| main-toolbar | navigation | Root node | icon | first | icon.svg |
| main-toolbar | navigation | Fast rewind | icon | fast-prev | icon.svg |
| main-toolbar | navigation | Parent node | icon | prev | icon.svg |
| main-toolbar | navigation | First child | icon | next | icon.svg |
| main-toolbar | navigation | Fast forward | icon | fast-next | icon.svg |
| main-toolbar | navigation | End of variation | icon | last | icon.svg |
| main-toolbar | game | Auto play | icon | toggle-autoplay | icon.svg |
| main-toolbar | game | Pass | text | pass | — |
| main-toolbar | game | Delete move | icon | delete-node | icon.svg |
| main-toolbar | game | Estimate | icon | estimate | icon.svg |
| main-toolbar | game | Score | icon | score | icon.svg |
| main-toolbar | display | Coords | text | toggle-coords | — |
| main-toolbar | display | Nums | text | toggle-numbers | — |
| main-toolbar | view | Zoom out | icon | zoom-out | icon.svg |
| main-toolbar | view | Zoom in | icon | zoom-in | icon.svg |
| main-toolbar | view | Rotate clockwise | icon | rotate-cw | icon.svg |
| main-toolbar | view | Flip horizontally | icon | flip-h | icon.svg |
| main-toolbar | view | Flip vertically | icon | flip-v | icon.svg |
| main-toolbar | view | Reset board | icon | reset-board | icon.svg |
| main-toolbar | view | Toggle full screen | icon | toggle-fullscreen | icon.svg |
| edit-toolbar | stones | Black stone | icon | stone_1 | icon.svg |
| edit-toolbar | stones | White stone | icon | stone_-1 | icon.svg |
| edit-toolbar | stones | Erase stone | icon | erase | icon.svg |
| edit-toolbar | marks | Cross | text | cross | — |
| edit-toolbar | marks | Triangle | text | triangle | — |
| edit-toolbar | marks | Square | text | square | — |
| edit-toolbar | marks | Circle | text | circle | — |
| edit-toolbar | marks | Line | text | line | — |
| edit-toolbar | marks | Arrow | text | arrow | — |
| edit-toolbar | marks | Dim area | text | dim | — |
| edit-toolbar | marks | Label | text | label | — |
| edit-toolbar | marks | Number | text | number | — |
| edit-toolbar | colors | Theme colour | swatch | — | — |
| edit-toolbar | colors | Black | swatch | — | — |
| edit-toolbar | colors | White | swatch | — | — |
| edit-toolbar | colors | Red | swatch | — | — |
| edit-toolbar | colors | Yellow | swatch | — | — |
| edit-toolbar | colors | Blue | swatch | — | — |
| edit-toolbar | colors | Green | swatch | — | — |
| edit-toolbar | turn | Turn | text | toggle-turn | — |
| sidebar | tabs | Info | text | — | — |
| sidebar | tabs | Comment | text | — | — |
| sidebar | tabs | Engine | text | — | — |
| sidebar | tabs | Score | text | — | — |
| sidebar | messages | Clear | text | — | — |
| menu-bar | menu | File | text | — | — |
| menu-bar | menu | Edit | text | — | — |
| menu-bar | menu | Advanced | text | — | — |
| menu-bar | menu | Play | text | — | — |
| menu-bar | menu | Engine | text | — | — |
| menu-bar | menu | View | text | — | — |
| menu-bar | menu | Tools | text | — | — |
| menu-bar | menu | Options | text | — | — |
| menu-bar | menu | Help | text | — | — |
