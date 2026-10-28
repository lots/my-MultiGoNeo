<#
.SYNOPSIS
    Draws the README figure (img/markup-demo.png) from the JSON that
    extract.mjs produces.

.DESCRIPTION
    Deliberately dependency-free: no browser and no Electron, just GDI+ via
    System.Drawing. That makes it usable in environments where Chromium refuses
    to start, and keeps the colours in one place so the figure matches the app.

    Canvas: wood board, 19x19 grid, star points, stones, then the DD washes
    (clipped to the board, alphas taken from --sabaki-dim-color* in
    style/index.css), then lines and arrows on top so they stay readable.

.EXAMPLE
    npx tsx scripts/markup-demo/extract.mjs
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/markup-demo/render.ps1
#>
param(
    [string]$DataPath = 'scripts/markup-demo/.markup-demo.json',
    [string]$OutPath = 'img/markup-demo.png'
)

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dataFile = if ([System.IO.Path]::IsPathRooted($DataPath)) { $DataPath } else { Join-Path $repoRoot $DataPath }
$outFile = if ([System.IO.Path]::IsPathRooted($OutPath)) { $OutPath } else { Join-Path $repoRoot $OutPath }

if (-not (Test-Path $dataFile)) {
    throw "No geometry at $dataFile - run extract.mjs first (npm run demo:markup does both)."
}

$data = Get-Content $dataFile -Raw | ConvertFrom-Json

$cell = 34.0
$margin = 52.0
$boardPx = 18 * $cell
$boardW = $boardPx + 2 * $margin
$legendH = 132.0
$imgW = [int]$boardW
$imgH = [int]($boardW + $legendH)

$bmp = New-Object System.Drawing.Bitmap($imgW, $imgH)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.Clear([System.Drawing.Color]::FromArgb(241, 180, 88))

# Colours mirror style/index.css: board foreground, line palette, dim alphas.
$ink = [System.Drawing.Color]::FromArgb(94, 46, 12)
$red = [System.Drawing.Color]::FromArgb(208, 2, 27)
$blue = [System.Drawing.Color]::FromArgb(21, 96, 216)
$green = [System.Drawing.Color]::FromArgb(18, 156, 60)

function P([double]$x, [double]$y) {
    New-Object System.Drawing.PointF([single]($margin + $x * $cell), [single]($margin + $y * $cell))
}

# --- grid ---------------------------------------------------------------
$thin = New-Object System.Drawing.Pen($ink, 1.2)
$thick = New-Object System.Drawing.Pen($ink, 2.4)
for ($i = 0; $i -lt 19; $i++) {
    $pen = if ($i -eq 0 -or $i -eq 18) { $thick } else { $thin }
    $g.DrawLine($pen, (P $i 0), (P $i 18))
    $g.DrawLine($pen, (P 0 $i), (P 18 $i))
}

# --- star points --------------------------------------------------------
$hoshiBrush = New-Object System.Drawing.SolidBrush($ink)
foreach ($hx in 3, 9, 15) {
    foreach ($hy in 3, 9, 15) {
        $p = P $hx $hy
        $g.FillEllipse($hoshiBrush, $p.X - 3.4, $p.Y - 3.4, 6.8, 6.8)
    }
}

# --- stones -------------------------------------------------------------
$r = $cell * 0.46
foreach ($s in $data.stones) {
    $p = P $s[0] $s[1]
    $rect = New-Object System.Drawing.RectangleF(($p.X - $r), ($p.Y - $r), (2 * $r), (2 * $r))
    if ($s[2] -eq 1) {
        $c1 = [System.Drawing.Color]::FromArgb(90, 90, 90); $c2 = [System.Drawing.Color]::FromArgb(10, 10, 10)
    } else {
        $c1 = [System.Drawing.Color]::FromArgb(255, 255, 255); $c2 = [System.Drawing.Color]::FromArgb(205, 205, 205)
    }
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 55)
    $g.FillEllipse($brush, $rect)
    $rim = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 0, 0, 0), 1)
    $g.DrawEllipse($rim, $rect)
    $brush.Dispose(); $rim.Dispose()
}

# --- DD washes, clipped to the board ------------------------------------
$boardRect = New-Object System.Drawing.RectangleF([single]$margin, [single]$margin, [single]$boardPx, [single]$boardPx)
$savedClip = $g.Clip
$g.SetClip($boardRect)
foreach ($d in $data.dims) {
    $x1 = [Math]::Min($d.v1[0], $d.v2[0]); $x2 = [Math]::Max($d.v1[0], $d.v2[0])
    $y1 = [Math]::Min($d.v1[1], $d.v2[1]); $y2 = [Math]::Max($d.v1[1], $d.v2[1])
    switch ($d.color) {
        'red' { $col = [System.Drawing.Color]::FromArgb(128, $red.R, $red.G, $red.B) }
        'blue' { $col = [System.Drawing.Color]::FromArgb(128, $blue.R, $blue.G, $blue.B) }
        'green' { $col = [System.Drawing.Color]::FromArgb(128, $green.R, $green.G, $green.B) }
        default { $col = [System.Drawing.Color]::FromArgb(112, 0, 0, 0) }
    }
    $brush = New-Object System.Drawing.SolidBrush($col)
    $lx = $margin + ($x1 - 0.5) * $cell
    $ty = $margin + ($y1 - 0.5) * $cell
    $g.FillRectangle($brush, [single]$lx, [single]$ty, [single](($x2 - $x1 + 1) * $cell), [single](($y2 - $y1 + 1) * $cell))
    $brush.Dispose()
}
$g.Clip = $savedClip

# --- lines and arrows ---------------------------------------------------
function DrawMark([object]$m) {
    $col = switch ($m.color) {
        'red' { $red }
        'blue' { $blue }
        'green' { $green }
        'white' { [System.Drawing.Color]::White }
        'black' { [System.Drawing.Color]::Black }
        default { $ink }
    }
    $pen = New-Object System.Drawing.Pen($col, 3.4)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $a = P $m.v1[0] $m.v1[1]
    $b = P $m.v2[0] $m.v2[1]

    if ($m.type -eq 'arrow') {
        $dx = $b.X - $a.X; $dy = $b.Y - $a.Y
        $len = [Math]::Sqrt($dx * $dx + $dy * $dy)
        if ($len -lt 0.1) { return }
        $ux = $dx / $len; $uy = $dy / $len
        $headLen = $cell * 0.55
        $baseX = $b.X - $ux * $headLen; $baseY = $b.Y - $uy * $headLen
        $g.DrawLine($pen, $a, (New-Object System.Drawing.PointF([single]$baseX, [single]$baseY)))
        $hw = $cell * 0.30
        $p1 = New-Object System.Drawing.PointF([single]($baseX - $uy * $hw), [single]($baseY + $ux * $hw))
        $p2 = New-Object System.Drawing.PointF([single]($baseX + $uy * $hw), [single]($baseY - $ux * $hw))
        $head = New-Object System.Drawing.SolidBrush($col)
        $g.FillPolygon($head, @($b, $p1, $p2))
        $head.Dispose()
    } else {
        $g.DrawLine($pen, $a, $b)
    }
    $pen.Dispose()
}
foreach ($m in $data.marks) { DrawMark $m }

# --- legend -------------------------------------------------------------
$ly = $boardW + 20
$font = New-Object System.Drawing.Font('Segoe UI', 10)
$fontBold = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$text = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 24, 8))
$g.DrawString("from $($data.source)  -  SGF DD dimming, coloured LN/AR", $fontBold, $text, [single]$margin, [single]$ly)

function Swatch([System.Drawing.Color]$c, [string]$label, [double]$x, [double]$y) {
    $brush = New-Object System.Drawing.SolidBrush($c)
    $g.FillRectangle($brush, [single]$x, [single]$y, 15, 15)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 0, 0, 0), 1)
    $g.DrawRectangle($pen, [single]$x, [single]$y, 15, 15)
    $g.DrawString($label, $font, $text, [single]($x + 21), [single]($y - 2))
    $brush.Dispose(); $pen.Dispose()
}

$row1 = $ly + 28
Swatch ([System.Drawing.Color]::FromArgb(112, 0, 0, 0)) 'DD, no colour' $margin $row1
Swatch ([System.Drawing.Color]::FromArgb(128, $blue.R, $blue.G, $blue.B)) 'SBKDD blue' ($margin + 170) $row1
Swatch ([System.Drawing.Color]::FromArgb(128, $red.R, $red.G, $red.B)) 'SBKDD red' ($margin + 330) $row1

$row2 = $row1 + 30
$penBlue = New-Object System.Drawing.Pen($blue, 3.4)
$g.DrawLine($penBlue, [single]$margin, [single]($row2 + 7), [single]($margin + 38), [single]($row2 + 7))
$g.DrawString('blue LN / AR', $font, $text, [single]($margin + 46), [single]($row2 - 2))
$penRed = New-Object System.Drawing.Pen($red, 3.4)
$g.DrawLine($penRed, [single]($margin + 170), [single]($row2 + 7), [single]($margin + 208), [single]($row2 + 7))
$g.DrawString('red LN / AR', $font, $text, [single]($margin + 216), [single]($row2 - 2))
$penInk = New-Object System.Drawing.Pen($ink, 3.4)
$g.DrawLine($penInk, [single]($margin + 330), [single]($row2 + 7), [single]($margin + 368), [single]($row2 + 7))
$g.DrawString('standard LN / AR', $font, $text, [single]($margin + 376), [single]($row2 - 2))

New-Item -ItemType Directory -Force (Split-Path -Parent $outFile) | Out-Null
$bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

Remove-Item $dataFile -Force -ErrorAction SilentlyContinue
"wrote $outFile ($([math]::Round((Get-Item $outFile).Length / 1KB, 1)) KB)"
