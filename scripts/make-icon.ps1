# Publishes asset/MultiGo-Neo-classic.ico as the application icon.
# Copies the multi-size ICO unchanged and exports 256/512 px PNG previews.
# No external tools or internet access required:  pwsh -File scripts/make-icon.ps1
param([string]$OutDir = (Join-Path $PSScriptRoot '..\build'))

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$out = [IO.Path]::GetFullPath($OutDir)
$source = Join-Path $root 'asset\MultiGo-Neo-classic.ico'
if (-not (Test-Path -LiteralPath $source)) {
  throw "Missing application icon: $source"
}
[IO.Directory]::CreateDirectory($out) | Out-Null

# Keep the exact multi-resolution ICO that ships in asset/.
$icoPath = Join-Path $out 'icon.ico'
Copy-Item -LiteralPath $source -Destination $icoPath -Force

# The icon's frames are PNG-compressed. Extract the 256 px frame directly rather
# than asking GDI+ to render the ICO (which rejects some PNG-only frames).
$bytes = [IO.File]::ReadAllBytes($source)
$count = [BitConverter]::ToUInt16($bytes, 4)
$frame = $null
for ($i = 0; $i -lt $count; $i++) {
  $entry = 6 + 16 * $i
  $width = [int]$bytes[$entry]
  if ($width -ne 0) { continue }
  $length = [BitConverter]::ToUInt32($bytes, $entry + 8)
  $offset = [BitConverter]::ToUInt32($bytes, $entry + 12)
  $frame = New-Object byte[] $length
  [Array]::Copy($bytes, $offset, $frame, 0, $length)
  break
}
if ($null -eq $frame) { throw 'The 256 px icon frame was not found.' }

$png256 = Join-Path $out 'icon.png'
[IO.File]::WriteAllBytes($png256, $frame)

$master = [System.Drawing.Image]::FromFile($png256)
$big = New-Object System.Drawing.Bitmap 512, 512, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($big)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($master, 0, 0, 512, 512)
$g.Dispose()
$big.Save((Join-Path $out 'icon-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()
$master.Dispose()

"icon.ico: $((Get-Item $icoPath).Length) bytes (copied from asset/MultiGo-Neo-classic.ico)"
"icon.png: $((Get-Item $png256).Length) bytes"
"icon-512.png: $((Get-Item (Join-Path $out 'icon-512.png')).Length) bytes"
