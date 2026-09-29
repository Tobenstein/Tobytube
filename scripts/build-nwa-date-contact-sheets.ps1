param(
  [string]$CacheDirectory = "tmp/nwa-history-covers",
  [string]$OutputDirectory = "tmp/nwa-history-date-sheets"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot $CacheDirectory))
$outputRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$cellWidth = 460
$cellHeight = 190
$columns = 4
$rows = 5
$font = [Drawing.Font]::new("Arial", 16, [Drawing.FontStyle]::Bold)
try {
  for ($first = 0; $first -le 121; $first += ($columns * $rows)) {
    $last = [math]::Min(121, $first + ($columns * $rows) - 1)
    $sheet = [Drawing.Bitmap]::new($cellWidth * $columns, $cellHeight * $rows)
    try {
      $graphics = [Drawing.Graphics]::FromImage($sheet)
      try {
        $graphics.Clear([Drawing.Color]::White)
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        for ($volume = $first; $volume -le $last; $volume++) {
          $offset = $volume - $first
          $column = $offset % $columns
          $row = [math]::Floor($offset / $columns)
          $left = $column * $cellWidth
          $top = $row * $cellHeight
          $graphics.DrawString(("Volume {0}" -f $volume), $font, [Drawing.Brushes]::Black, $left + 8, $top + 5)
          $imagePath = Join-Path $cacheRoot ("volume-{0}.png" -f $volume.ToString("000"))
          $source = [Drawing.Image]::FromFile($imagePath)
          try {
            $sourceRect = [Drawing.Rectangle]::new([int]($source.Width * 0.48), [int]($source.Height * 0.43), [int]($source.Width * 0.50), [int]($source.Height * 0.25))
            $destinationRect = [Drawing.Rectangle]::new($left + 5, $top + 34, $cellWidth - 10, $cellHeight - 39)
            $graphics.DrawImage($source, $destinationRect, $sourceRect, [Drawing.GraphicsUnit]::Pixel)
          } finally { $source.Dispose() }
        }
      } finally { $graphics.Dispose() }
      $sheetPath = Join-Path $outputRoot ("volumes-{0}-{1}.jpg" -f $first.ToString("000"), $last.ToString("000"))
      $sheet.Save($sheetPath, [Drawing.Imaging.ImageFormat]::Jpeg)
      Write-Host $sheetPath
    } finally { $sheet.Dispose() }
  }
} finally { $font.Dispose() }
