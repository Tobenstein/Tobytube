param(
  [int]$FromVolume = 0,
  [int]$ToVolume = 121,
  [string]$OutputPath = "src/nwa-history.generated.json",
  [string]$CacheDirectory = "tmp/nwa-history-covers",
  [string]$VerifiedRangesPath = "src/nwa-history-cover-ranges.json",
  [string]$CuratedVolume24Path = "src/nwa-history-volume-024.curated.json"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputFile = [IO.Path]::GetFullPath((Join-Path $projectRoot $OutputPath))
$cacheRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot $CacheDirectory))
$verifiedRangesFile = [IO.Path]::GetFullPath((Join-Path $projectRoot $VerifiedRangesPath))
$curatedVolume24File = [IO.Path]::GetFullPath((Join-Path $projectRoot $CuratedVolume24Path))
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

$verifiedRanges = @{}
if (Test-Path -LiteralPath $verifiedRangesFile) {
  $rangeObject = Get-Content -LiteralPath $verifiedRangesFile -Raw | ConvertFrom-Json
  foreach ($property in $rangeObject.PSObject.Properties) { $verifiedRanges[[int]$property.Name] = $property.Value }
}
$curatedVolume24 = if (Test-Path -LiteralPath $curatedVolume24File) { Get-Content -LiteralPath $curatedVolume24File -Raw | ConvertFrom-Json } else { $null }

Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]

function Await-WinRt($operation, [Type]$resultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait()
  return $task.Result
}

function Get-OcrLines([string]$imagePath) {
  $file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)) ([Windows.Storage.StorageFile])
  $stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  $result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $width = [double]$bitmap.PixelWidth
  $height = [double]$bitmap.PixelHeight
  $lines = foreach ($line in $result.Lines) {
    $rects = @($line.Words | ForEach-Object { $_.BoundingRect })
    if (-not $rects.Count) { continue }
    $x = ($rects | Measure-Object X -Minimum).Minimum
    $y = ($rects | Measure-Object Y -Minimum).Minimum
    $right = ($rects | ForEach-Object { $_.X + $_.Width } | Measure-Object -Maximum).Maximum
    $bottom = ($rects | ForEach-Object { $_.Y + $_.Height } | Measure-Object -Maximum).Maximum
    [pscustomobject][ordered]@{
      text = ($line.Text -replace "\s+", " ").Trim()
      x = [math]::Round($x, 2)
      y = [math]::Round($y, 2)
      width = [math]::Round($right - $x, 2)
      height = [math]::Round($bottom - $y, 2)
      relativeX = [math]::Round($x / $width, 4)
      relativeY = [math]::Round($y / $height, 4)
    }
  }
  return [ordered]@{ width = $width; height = $height; lines = @($lines | Sort-Object y, x) }
}

function Get-DateRange([string]$imagePath, $fullOcr) {
  $yearPattern = '(?<!\d)(18\d{2}|19\d{2}|20\d{2})\s*[-–—]\s*(18\d{2}|19\d{2}|20\d{2})(?!\d)'
  $rightText = (@($fullOcr.lines | Where-Object { $_.relativeX -ge 0.48 }) | ForEach-Object text) -join ' '
  $match = [regex]::Match($rightText, $yearPattern)
  if ($match.Success) {
    return [ordered]@{ text = $match.Value; startYear = [int]$match.Groups[1].Value; endYear = [int]$match.Groups[2].Value; reviewStatus = 'ocr-unreviewed'; extraction = 'full-cover-ocr' }
  }

  # The printed range uses outlined lettering that normal OCR often misses. Make a
  # tight, high-contrast crop and thicken its dark outline before a second pass.
  $source = [Drawing.Bitmap]::FromFile($imagePath)
  try {
    $cropRect = [Drawing.Rectangle]::new([int]($source.Width * 0.53), [int]($source.Height * 0.55), [int]($source.Width * 0.38), [int]($source.Height * 0.12))
    $scale = 3
    $processed = [Drawing.Bitmap]::new($cropRect.Width * $scale, $cropRect.Height * $scale)
    try {
      $graphics = [Drawing.Graphics]::FromImage($processed)
      try {
        $graphics.Clear([Drawing.Color]::White)
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($source, [Drawing.Rectangle]::new(0, 0, $processed.Width, $processed.Height), $cropRect, [Drawing.GraphicsUnit]::Pixel)
      } finally { $graphics.Dispose() }

      for ($y = 0; $y -lt $processed.Height; $y++) {
        for ($x = 0; $x -lt $processed.Width; $x++) {
          $pixel = $processed.GetPixel($x, $y)
          $gray = [int](0.299 * $pixel.R + 0.587 * $pixel.G + 0.114 * $pixel.B)
          $processed.SetPixel($x, $y, $(if ($gray -lt 205) { [Drawing.Color]::Black } else { [Drawing.Color]::White }))
        }
      }
      $processedPath = Join-Path ([IO.Path]::GetDirectoryName($imagePath)) (([IO.Path]::GetFileNameWithoutExtension($imagePath)) + '-date-range.png')
      $processed.Save($processedPath, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $processed.Dispose() }
  } finally { $source.Dispose() }

  $dateOcr = Get-OcrLines $processedPath
  $dateText = (@($dateOcr.lines) | ForEach-Object text) -join ' '
  $match = [regex]::Match($dateText, $yearPattern)
  if ($match.Success) {
    return [ordered]@{ text = $match.Value; startYear = [int]$match.Groups[1].Value; endYear = [int]$match.Groups[2].Value; reviewStatus = 'ocr-unreviewed'; extraction = 'processed-date-crop' }
  }
  return [ordered]@{ text = $null; startYear = $null; endYear = $null; reviewStatus = 'missing-needs-visual-review'; extraction = 'not-recognized'; ocrText = $dateText }
}

function Get-VerifiedDateRange([int]$volume, [string]$printedText) {
  if ([string]::IsNullOrWhiteSpace($printedText)) {
    return [ordered]@{ printed = $null; start = $null; end = $null; precision = $null; reviewStatus = 'missing-source-image'; extraction = 'visual-cover-audit' }
  }
  $parts = @($printedText -split '\s+-\s+')
  $start = $parts[0]
  $end = if ($parts.Count -gt 1) { $parts[1] } else { $parts[0] }
  $precision = if ($start -match '^\d{2}/\d{4}$') { 'month' } else { 'year' }
  $note = if ($volume -eq 24) { 'Internal correction: cover prints 01/1984, but the listed contents and surrounding volumes establish the intended start as 01/1985.' } else { $null }
  return [ordered]@{ printed = $printedText; start = $start; end = $end; precision = $precision; reviewStatus = 'cover-verified'; extraction = 'visual-cover-audit'; note = $note }
}

function Get-ContentCandidates($ocr) {
  $leftLines = @($ocr.lines | Where-Object {
    $_.relativeX -lt 0.49 -and
    $_.relativeY -lt 0.72 -and
    $_.text -notmatch "(?i)^(history|of the|nwa|volume\b|dvd\b|dolby\b|sports television|\d+\s*min\.?|1[.:]33|sl/ss)"
  })
  $groups = @()
  $current = @()
  $previousBottom = $null
  $previousHeight = 0
  foreach ($line in $leftLines) {
    $gap = if ($null -eq $previousBottom) { 0 } else { [double]$line.y - [double]$previousBottom }
    $breakThreshold = [math]::Max(14, $previousHeight * 0.72)
    if ($current.Count -and $gap -gt $breakThreshold) {
      $groups += ,@($current)
      $current = @()
    }
    $current += $line
    $previousBottom = [double]$line.y + [double]$line.height
    $previousHeight = [double]$line.height
  }
  if ($current.Count) { $groups += ,@($current) }

  $order = 0
  return @($groups | ForEach-Object {
    $text = (($_ | ForEach-Object text) -join " " -replace "\s+", " ").Trim()
    if (-not $text -or $text -match "(?i)^(history|volume|dvd|dolby|sports television)\b") { return }
    $order++
    $kind = if ($text -match "(?i)\b(vs\.?|versus)\b") { "match" } else { "segment" }
    [ordered]@{
      order = $order
      kind = $kind
      text = $text
      needsReview = $true
      sourceLineCount = @($_).Count
    }
  })
}

$existing = if (Test-Path -LiteralPath $outputFile) {
  Get-Content -LiteralPath $outputFile -Raw | ConvertFrom-Json
} else {
  @{ volumes = @() }
}
$byVolume = @{}
foreach ($volume in @($existing.volumes)) { $byVolume[[int]$volume.volume] = $volume }

for ($volume = $FromVolume; $volume -le $ToVolume; $volume++) {
  $number = $volume.ToString("000")
  $sourceUrl = "https://wrestlingcoverempire.weebly.com/uploads/1/5/2/0/15208822/history-of-the-nwa-volume-$number-cover_orig.jpg"
  $captureUrl = "https://image.thum.io/get/width/1600/crop/2400/noanimate/$sourceUrl"
  $imagePath = Join-Path $cacheRoot "volume-$number.png"
  if (-not (Test-Path -LiteralPath $imagePath)) {
    Invoke-WebRequest -Uri $captureUrl -OutFile $imagePath -UseBasicParsing -TimeoutSec 120
  }
  $ocr = Get-OcrLines $imagePath
  $dateRange = if ($verifiedRanges.ContainsKey($volume)) {
    Get-VerifiedDateRange $volume $verifiedRanges[$volume]
  } else {
    Get-DateRange $imagePath $ocr
  }
  $candidates = Get-ContentCandidates $ocr
  $byVolume[$volume] = [ordered]@{
    volume = $volume
    label = if ($volume -eq 0) { "Volume Zero" } else { "Volume $volume" }
    sourceUrl = $sourceUrl
    capturedImage = (Resolve-Path -LiteralPath $imagePath).Path
    imageWidth = $ocr.width
    imageHeight = $ocr.height
    ocrLines = $ocr.lines
    items = $candidates
    itemCount = $candidates.Count
    dateRange = $dateRange
    reviewStatus = "ocr-unreviewed"
  }
  Write-Host ("Volume {0}: {1} candidate items" -f $number, $candidates.Count)
}

$volumes = @($byVolume.Values | Sort-Object { [int]$_.volume })
foreach ($savedVolume in $volumes) {
  $number = [int]$savedVolume.volume
  if ($verifiedRanges.ContainsKey($number)) {
    $verifiedRange = Get-VerifiedDateRange $number $verifiedRanges[$number]
    if ($savedVolume.PSObject.Properties.Name -contains 'dateRange') {
      $savedVolume.dateRange = $verifiedRange
    } else {
      $savedVolume | Add-Member -NotePropertyName dateRange -NotePropertyValue $verifiedRange
    }
  }
  if ($number -eq 24 -and $null -ne $curatedVolume24) {
    foreach ($property in @{
      curatedItems = @($curatedVolume24.items)
      curatedItemCount = @($curatedVolume24.items).Count
      curationStatus = 'worked-example-curated'
      curationPolicy = $curatedVolume24.curationPolicy
    }.GetEnumerator()) {
      if ($savedVolume.PSObject.Properties.Name -contains $property.Key) { $savedVolume.($property.Key) = $property.Value }
      else { $savedVolume | Add-Member -NotePropertyName $property.Key -NotePropertyValue $property.Value }
    }
  }
}
$output = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  title = "History of the National Wrestling Alliance"
  promotionId = "nwa"
  source = "https://wrestlingcoverempire.weebly.com/nwahistory.html"
  sourceType = "fan-created DVD cover contents"
  dataPolicy = [ordered]@{
    staged = $true
    containsResults = $false
    notes = "OCR candidates must be reviewed against the cover before activation. Do not infer winners, match order beyond cover order, or event dates beyond the printed text."
  }
  volumes = $volumes
  stats = [ordered]@{
    volumes = $volumes.Count
    candidateItems = @($volumes | ForEach-Object items).Count
    reviewedVolumes = @($volumes | Where-Object reviewStatus -eq "reviewed").Count
    dateRangesCaptured = @($volumes | Where-Object { $null -ne $_.dateRange.start }).Count
    dateRangesNeedingReview = @($volumes | Where-Object { $null -eq $_.dateRange.start }).Count
  }
}

$json = $output | ConvertTo-Json -Depth 12
[IO.File]::WriteAllText($outputFile, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
Write-Host "Wrote $($output.stats.volumes) volumes and $($output.stats.candidateItems) candidate items to $outputFile"
