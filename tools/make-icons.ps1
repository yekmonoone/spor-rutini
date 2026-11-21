# Uygulama simgelerini (PNG) üretir: koyu yeşil zemin üzerinde beyaz dambıl.
# Çalıştırma: powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-icons.ps1
param([string]$OutDir = (Join-Path $PSScriptRoot '..\app\icons'))

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Icon([int]$size, [string]$name, [double]$content) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#0F766E'))
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $S = $size * $content
  $ox = ($size - $S) / 2
  $oy = ($size - $S) / 2
  # x, y, genişlik, yükseklik, köşe yarıçapı (içerik kutusuna oranla)
  $parts = @(
    @(0.27, 0.465, 0.46, 0.07, 0.02),
    @(0.19, 0.27, 0.09, 0.46, 0.03),
    @(0.10, 0.34, 0.08, 0.32, 0.03),
    @(0.72, 0.27, 0.09, 0.46, 0.03),
    @(0.82, 0.34, 0.08, 0.32, 0.03)
  )
  foreach ($pt in $parts) {
    $r = [Math]::Max(1, $pt[4] * $S)
    $path = New-RoundedRectPath ($ox + $pt[0] * $S) ($oy + $pt[1] * $S) ($pt[2] * $S) ($pt[3] * $S) $r
    $g.FillPath($white, $path)
    $path.Dispose()
  }
  $white.Dispose()
  $g.Dispose()
  $bmp.Save((Join-Path $OutDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Icon 512 'icon-512.png' 0.78
New-Icon 192 'icon-192.png' 0.78
New-Icon 180 'apple-touch-icon.png' 0.72
New-Icon 32 'favicon-32.png' 0.92
New-Icon 512 'icon-maskable-512.png' 0.58
Write-Output "Simgeler oluşturuldu: $OutDir"
