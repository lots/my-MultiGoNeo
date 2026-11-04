# Go engine shims and configuration

This folder is the engine "bin" for MultiGo Neo: one `.cmd` shim per Go engine on
this device, plus [`engines.json`](engines.json), the hand-editable connection list
used by **Engine → Manage Engines…**.

## Shims

Each shim changes into the engine's own folder (so relative weights, configs and
book files resolve) and forwards all arguments (`%*`). `gnugo.cmd` adds
`--mode gtp`; `gnugo-ascii.cmd` starts GNU Go's ASCII mode.

| Shim | Engine | Notes |
|---|---|---|
| `gnugo.cmd` | GNU Go 3.8 | `--mode gtp` |
| `gnugo-ascii.cmd` | GNU Go 3.8 | interactive ASCII mode |
| `fuego.cmd` | Fuego 1.1 | installed copy |
| `pachi.cmd` | Pachi 12.50 | |
| `pachi11.cmd` | Pachi 11.00 | |
| `katago.cmd` | KataGo 1.18.2 CUDA | GTP, model `b28fd3.bin.gz` |
| `katago-opencl.cmd` | KataGo 1.18.1 OpenCL | GTP, same model |
| `katago-cli.cmd` | KataGo 1.18.2 CUDA | raw commands (`version`, `benchmark`, `analysis`, …) |
| `katago16.cmd` | KataGo 1.16.0 OpenCL | legacy install |
| `leelaz.cmd` | Leela Zero 0.15 | `-g -w weights_elf.txt` |
| `leela0110.cmd` | Leela 0.11.0 | CPU GTP |
| `aq.cmd` | AQ 2.1.1 | |
| `aq-mini.cmd` | AQ 2.1.1 mini | |
| `zen7.cmd` | Zen7 (ZenGTP) | |
| `zenestimate.cmd` | ZenEstimate | |

The paths are absolute because they describe **this device**. They mirror
`C:\Users\ILLEGEAR\Documents\Weiqi\bin`; if Dropbox or the KataGo folders move,
edit the matching `.cmd`.

## `engines.json`

```json
{
  "version": 1,
  "engines": [
    {
      "id": "gnugo",
      "name": "GNU Go 3.8",
      "path": "gnugo.cmd",
      "args": "",
      "commands": ""
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Stable key used by the UI; keep it unique. Optional on manual add (the app generates one from the name). |
| `name` | Label in the Engine menu/tab. |
| `path` | Engine executable or `.cmd` shim. Relative paths resolve next to this JSON file first, then the app's bundled `engines/` folder. |
| `args` | Extra command-line arguments, passed after the shim's own arguments. |
| `commands` | Optional `;`-separated GTP commands sent right after attaching (e.g. `komi 7.5; boardsize 19`). |

The three default entries are the ones tested with Sabaki on this device:
GNU Go 3.8, Fuego 1.1 and Pachi 12.50. None of them implements `kata-analyze`,
so the Analysis checkbox stays disabled for them; they play and generate moves.

Add more engines by adding a shim and an entry, or through **Manage Engines…**.
That dialog reads the JSON when it opens and writes it when you press **Save**, so
manual edits and dialog edits are the same file.

Config file location:

- development (`npm start`): `<repo>\engines\engines.json`
- packaged app: `<install dir>\engines\engines.json` when that folder is writable,
  otherwise `%APPDATA%\MultiGo Neo\engines\engines.json` (seeded from the bundled
  copy)
- override with the `MULTIGO_ENGINE_CONFIG` environment variable

## Command-line use

The folder can be used directly from cmd or PowerShell:

```
set "PATH=%PATH%;C:\Users\ILLEGEAR\myDev\DSH\my-Fig-test\engines"
echo quit | gnugo
echo quit | fuego
echo quit | pachi
```

All engines are GTP/stdio programs: they block waiting for commands, which is
expected.

## Caveats

- `%*` forwarding means arguments added in `engines.json` come after the shim's
  built-in ones.
- `.cmd` shims require `cmd.exe`, which MultiGo Neo handles automatically.
- The NVIDIA-specific `katago.cmd` needs the CUDA runtime in its own folder;
  `katago-opencl.cmd` is the portable alternative.
- GNU Go 3.8 is a Cygwin build and needs normal process rights; it runs fine from
  a desktop terminal.
