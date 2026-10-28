# Markup demo figure

Regenerates [`img/markup-demo.png`](../../img/markup-demo.png), the figure used in
the README's *Colour and dimming* section.

```
npm run demo:markup
```

Two steps, run for you by that script:

| Step | What it does |
|---|---|
| `extract.mjs` | Reads `sgf/ff4_ex_new.sgf` through the real `gametree.getBoard`, and dumps the stones, `DD` rectangles (with their `SBKDD` tints) and `AR`/`LN` marks to JSON |
| `render.ps1` | Draws the board with GDI+ (`System.Drawing`) and writes the PNG |

## Why it is built this way

No browser, no Electron: the figure is generated with GDI+ because Chromium refuses
to start in some confined environments, and a documentation figure should not depend
on the app being launchable.

The palette is duplicated rather than imported, because a standalone PowerShell
script cannot load the stylesheet's custom properties:

| Element | Value | Source |
|---|---|---|
| Board | `#F1B458` | `--shudan-board-background-color` |
| Grid, ink | `#5E2E0C` | `--shudan-board-foreground-color` |
| Red | `#D0021B` | `--line-color-red` |
| Blue | `#1560D8` | `--line-color-blue` |
| Default dim wash | `rgba(0,0,0,.44)` | `--sabaki-dim-color` |
| Coloured dim wash | alpha `.5` | `--sabaki-dim-color-*` |

If those variables change, update `render.ps1` to match — the figure is only as
faithful as these numbers.

## Requirements

- `tsx` (a dev dependency, already present) for `extract.mjs`
- Windows PowerShell with `System.Drawing` for `render.ps1`

Pass different paths if you want to preview another file:

```
npx tsx scripts/markup-demo/extract.mjs sgf/ff4_ex.sgf scripts/markup-demo/.preview.json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/markup-demo/render.ps1 `
  -DataPath scripts/markup-demo/.preview.json -OutPath img/preview.png
```
