# Generates build/icon.ico (multi-size, PNG-compressed) and build/icon.png from GDI+.
# No external tools or internet access required:  pwsh -File scripts/make-icon.ps1
param([string]$OutDir = (Join-Path $PSScriptRoot '..\build'))

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$out = [IO.Path]::GetFullPath($OutDir)
[IO.Directory]::CreateDirectory($out) | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-MasterBitmap {
  $bmp = New-Object System.Drawing.Bitmap 256, 256, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  # Rounded tile using the Classic kaya goban palette: warm wood gradient
  # (#e3bd7d -> #d7a760 -> #c6934c) with a faint dark brown grid.
  $shape = New-RoundedPath 4 4 248 248 52
  $rect = New-Object System.Drawing.RectangleF 4, 4, 248, 248
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 227, 189, 125),
    [System.Drawing.Color]::FromArgb(255, 198, 147, 76),
    135.0)
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $blend.Colors = [System.Drawing.Color[]]@(
    [System.Drawing.Color]::FromArgb(255, 227, 189, 125),
    [System.Drawing.Color]::FromArgb(255, 215, 167, 96),
    [System.Drawing.Color]::FromArgb(255, 198, 147, 76))
  $blend.Positions = [single[]]@(0.0, 0.48, 1.0)
  $bg.InterpolationColors = $blend
  $g.FillPath($bg, $shape)
  $edge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 132, 89, 42)), 2.5
  $g.DrawPath($edge, $shape)

  # Faint 5x5 board grid in the Classic theme's dark brown line colour.
  $grid = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(84, 38, 22, 5)), 1.6
  foreach ($i in 0..4) {
    $c = 60 + ($i * 34)
    $g.DrawLine($grid, 60, $c, 196, $c)
    $g.DrawLine($grid, $c, 60, $c, 196)
  }

  # White stone.
  $whiteFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 242, 242, 242))
  $whiteEdge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 0, 0, 0)), 5
  $g.FillEllipse($whiteFill, 52, 52, 78, 78)
  $g.DrawEllipse($whiteEdge, 52, 52, 78, 78)
  $gloss = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200, 255, 255, 255))
  $g.FillEllipse($gloss, 68, 66, 30, 22)

  # Black stone, using the Classic theme's neutral grey highlight rim.
  $blackFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 41, 41, 41))
  $blackEdge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 111, 111, 111)), 3.5
  $g.FillEllipse($blackFill, 126, 126, 78, 78)
  $g.DrawEllipse($blackEdge, 126, 126, 78, 78)
  $sheen = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 111, 111, 111))
  $g.FillEllipse($sheen, 142, 140, 26, 18)

  foreach ($o in @($bg, $edge, $grid, $whiteFill, $whiteEdge, $gloss, $blackFill, $blackEdge, $sheen, $shape)) { $o.Dispose() }
  $g.Dispose()
  return $bmp
}

function Convert-ToPngBytes([System.Drawing.Bitmap]$source, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($source, 0, 0, $size, $size)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return ,$ms.ToArray()
}

$master = New-MasterBitmap
$pngSizes = @(256, 128, 64, 48, 32, 24, 16)
$images = @{}
foreach ($s in $pngSizes) { $images[$s] = Convert-ToPngBytes $master $s }

# Linux/macOS source image.
[IO.File]::WriteAllBytes((Join-Path $out 'icon.png'), $images[256])
# Also keep a 512 px copy for desktop environments that prefer it.
$big = New-Object System.Drawing.Bitmap 512, 512
$bg = [System.Drawing.Graphics]::FromImage($big)
$bg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$bg.DrawImage($master, 0, 0, 512, 512)
$bg.Dispose()
$big.Save((Join-Path $out 'icon-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()

# Multi-resolution ICO container (PNG entries, supported by Windows Vista and later).
$icoPath = Join-Path $out 'icon.ico'
$fs = [IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)                 # reserved
$bw.Write([uint16]1)                 # type: icon
$bw.Write([uint16]$pngSizes.Count)   # image count
$offset = 6 + (16 * $pngSizes.Count)
foreach ($s in $pngSizes) {
  $data = $images[$s]
  $dim = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([byte]$dim)
  $bw.Write([byte]$dim)
  $bw.Write([byte]0)                 # palette size
  $bw.Write([byte]0)                 # reserved
  $bw.Write([uint16]1)               # colour planes
  $bw.Write([uint16]32)              # bits per pixel
  $bw.Write([uint32]$data.Length)
  $bw.Write([uint32]$offset)
  $offset += $data.Length
}
foreach ($s in $pngSizes) { $bw.Write($images[$s]) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose()
$master.Dispose()

$ico = [IO.File]::ReadAllBytes($icoPath)
"icon.ico: $($ico.Length) bytes, $($pngSizes.Count) frames ($($pngSizes -join ', '))"
"icon.png: $((Get-Item (Join-Path $out 'icon.png')).Length) bytes"
