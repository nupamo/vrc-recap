param(
  [Parameter(Mandatory = $true)]
  [string[]] $InputFolders,

  [Parameter(Mandatory = $true)]
  [string] $OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Get-PhotoDate([System.IO.FileInfo] $File) {
  $match = [regex]::Match(
    $File.BaseName,
    '(?<year>20\d{2})[-_](?<month>\d{2})[-_](?<day>\d{2})[ _-](?<hour>\d{2})[-_](?<minute>\d{2})[-_](?<second>\d{2})'
  )
  if ($match.Success) {
    try {
      return [datetime]::new(
        [int] $match.Groups['year'].Value,
        [int] $match.Groups['month'].Value,
        [int] $match.Groups['day'].Value,
        [int] $match.Groups['hour'].Value,
        [int] $match.Groups['minute'].Value,
        [int] $match.Groups['second'].Value,
        [datetimekind]::Local
      )
    } catch {
      # Fall back to the filesystem timestamp below.
    }
  }
  return $File.LastWriteTime
}

$records = [System.Collections.Generic.List[object]]::new()
foreach ($folder in $InputFolders) {
  Get-ChildItem -LiteralPath $folder -Recurse -File | Where-Object {
    $_.Extension -match '^\.(png|jpg|jpeg|webp)$'
  } | ForEach-Object {
    $records.Add([pscustomobject]@{ File = $_; Date = Get-PhotoDate $_ })
  }
}
$records = @($records | Sort-Object Date, @{ Expression = { $_.File.FullName } })
if ($records.Count -eq 0) {
  throw "지원하는 사진을 찾지 못했습니다."
}

$eraCount = 9
$yearGroups = @($records | Group-Object { $_.Date.Year } | Sort-Object { [int] $_.Name })
$useYearPlan = $yearGroups.Count -le $eraCount
$yearAllocations = @{}
$yearOffsets = @{}
$yearPositions = @{}
if ($useYearPlan) {
  foreach ($group in $yearGroups) {
    $year = [int] $group.Name
    $yearAllocations[$year] = 1
    $yearPositions[$year] = 0
  }
  $remainingEras = $eraCount - $yearGroups.Count
  while ($remainingEras -gt 0) {
    $bestYear = 0
    $bestScore = -1.0
    foreach ($group in $yearGroups) {
      $year = [int] $group.Name
      $score = [Math]::Sqrt($group.Count) / $yearAllocations[$year]
      if ($score -gt $bestScore) {
        $bestYear = $year
        $bestScore = $score
      }
    }
    $yearAllocations[$bestYear] += 1
    $remainingEras -= 1
  }
  $offset = 0
  foreach ($group in $yearGroups) {
    $year = [int] $group.Name
    $yearOffsets[$year] = $offset
    $offset += $yearAllocations[$year]
  }
}

$pixelValues = 16 * 9 * 3
$sums = [System.Collections.Generic.List[long[]]]::new()
$counts = [int[]]::new($eraCount)
$dates = [System.Collections.Generic.List[System.Collections.Generic.List[datetime]]]::new()
for ($era = 0; $era -lt $eraCount; $era += 1) {
  $sums.Add([long[]]::new($pixelValues))
  $dates.Add([System.Collections.Generic.List[datetime]]::new())
}

$decoded = 0
$skipped = 0
for ($index = 0; $index -lt $records.Count; $index += 1) {
  $record = $records[$index]
  if ($useYearPlan) {
    $year = $record.Date.Year
    $yearCount = ($yearGroups | Where-Object { [int] $_.Name -eq $year }).Count
    $localEra = [Math]::Min(
      $yearAllocations[$year] - 1,
      [Math]::Floor($yearPositions[$year] * $yearAllocations[$year] / $yearCount)
    )
    $era = $yearOffsets[$year] + $localEra
    $yearPositions[$year] += 1
  } else {
    $era = [Math]::Min($eraCount - 1, [Math]::Floor($index * $eraCount / $records.Count))
  }
  $image = $null
  $bitmap = $null
  $graphics = $null
  try {
    $image = [System.Drawing.Image]::FromFile($record.File.FullName)
    $bitmap = [System.Drawing.Bitmap]::new(16, 9, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($image, 0, 0, 16, 9)

    for ($y = 0; $y -lt 9; $y += 1) {
      for ($x = 0; $x -lt 16; $x += 1) {
        $color = $bitmap.GetPixel($x, $y)
        $offset = ($y * 16 + $x) * 3
        $sums[$era][$offset] += [Math]::Min(15, [Math]::Round($color.R / 17.0, [MidpointRounding]::AwayFromZero))
        $sums[$era][$offset + 1] += [Math]::Min(15, [Math]::Round($color.G / 17.0, [MidpointRounding]::AwayFromZero))
        $sums[$era][$offset + 2] += [Math]::Min(15, [Math]::Round($color.B / 17.0, [MidpointRounding]::AwayFromZero))
      }
    }
    $counts[$era] += 1
    $dates[$era].Add($record.Date)
    $decoded += 1
  } catch {
    $skipped += 1
  } finally {
    if ($null -ne $graphics) { $graphics.Dispose() }
    if ($null -ne $bitmap) { $bitmap.Dispose() }
    if ($null -ne $image) { $image.Dispose() }
  }

  if (($index + 1) % 250 -eq 0 -or $index + 1 -eq $records.Count) {
    Write-Output ("LOCAL_MEMORY_PASS {0}/{1}" -f ($index + 1), $records.Count)
  }
}

$moments = [System.Collections.Generic.List[object]]::new()
for ($era = 0; $era -lt $eraCount; $era += 1) {
  if ($counts[$era] -eq 0) { continue }
  $memoryPixels = [System.Collections.Generic.List[int]]::new()
  for ($pixel = 0; $pixel -lt $pixelValues; $pixel += 1) {
    $memoryPixels.Add([int] [Math]::Round($sums[$era][$pixel] / $counts[$era]))
  }
  $red = 0
  $green = 0
  $blue = 0
  for ($pixel = 0; $pixel -lt 16 * 9; $pixel += 1) {
    $red += $memoryPixels[$pixel * 3]
    $green += $memoryPixels[$pixel * 3 + 1]
    $blue += $memoryPixels[$pixel * 3 + 2]
  }
  $accentRed = [int] ([Math]::Round($red / 144.0) * 17)
  $accentGreen = [int] ([Math]::Round($green / 144.0) * 17)
  $accentBlue = [int] ([Math]::Round($blue / 144.0) * 17)
  $accent = '#{0:x2}{1:x2}{2:x2}' -f $accentRed, $accentGreen, $accentBlue
  $middleDate = $dates[$era][[Math]::Floor($dates[$era].Count / 2)]
  $moments.Add([ordered]@{
    date = $middleDate.ToString('o')
    photoCount = $counts[$era]
    accent = $accent
    memoryPixels = @($memoryPixels)
  })
}

$payload = [ordered]@{
  schema = 'vrchat-public-memory-sample/v1'
  privacy = [ordered]@{
    originalPixelsIncluded = $false
    filenamesIncluded = $false
    worldNamesIncluded = $false
    playerNamesIncluded = $false
    quantization = '16x9 RGB 4-bit/channel, averaged into 9 chronological eras'
  }
  totalFiles = $records.Count
  decodedPhotos = $decoded
  skippedPhotos = $skipped
  startDate = $records[0].Date.ToString('o')
  endDate = $records[$records.Count - 1].Date.ToString('o')
  moments = @($moments)
}

$json = $payload | ConvertTo-Json -Depth 8 -Compress
$absoluteOutput = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.File]::WriteAllText($absoluteOutput, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output ("PUBLIC_SAMPLE_READY decoded={0} skipped={1} eras={2}" -f $decoded, $skipped, $moments.Count)
