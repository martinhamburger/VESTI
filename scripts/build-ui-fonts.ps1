param(
  [string]$LexendRoot = $env:VESTI_LEXEND_ROOT,
  [string]$SourceHanRoot = $env:VESTI_SOURCEHAN_SC_ROOT,
  [string]$OutputDir = "$PSScriptRoot\..\frontend\public\fonts"
)

# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/build-ui-fonts.ps1 `
#     -LexendRoot "D:\path\to\Lexend\static" `
#     -SourceHanRoot "D:\path\to\SourceHanSansSC"

$ErrorActionPreference = "Stop"

function Assert-PathExists {
  param(
    [string]$PathValue,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $PathValue)) {
    throw "$Label not found: $PathValue"
  }
}

function Build-Subset {
  param(
    [string]$InputFile,
    [string]$OutputFile,
    [string]$UnicodeRange
  )

  Write-Host "Building $OutputFile"
  & pyftsubset $InputFile `
    "--unicodes=$UnicodeRange" `
    "--flavor=woff2" `
    "--output-file=$OutputFile" `
    "--layout-features=*" `
    "--name-IDs=*" `
    "--name-legacy" `
    "--name-languages=*" `
    "--glyph-names" `
    "--symbol-cmap" `
    "--legacy-cmap" `
    "--notdef-glyph" `
    "--notdef-outline" `
    "--recommended-glyphs" `
    "--no-hinting"
}

if ([string]::IsNullOrWhiteSpace($LexendRoot)) {
  throw "Missing -LexendRoot. Example: D:\path\to\Lexend\static"
}

if ([string]::IsNullOrWhiteSpace($SourceHanRoot)) {
  throw "Missing -SourceHanRoot. Example: D:\path\to\SourceHanSansSC"
}

Assert-PathExists -PathValue $LexendRoot -Label "Lexend source directory"
Assert-PathExists -PathValue $SourceHanRoot -Label "Source Han source directory"

if (-not (Get-Command pyftsubset -ErrorAction SilentlyContinue)) {
  throw "pyftsubset not found. Install fonttools first (pip install fonttools brotli)."
}

$resolvedOutputDir = Resolve-Path -LiteralPath $OutputDir -ErrorAction SilentlyContinue
if (-not $resolvedOutputDir) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$latinUnicodeRange = "U+0000-00FF,U+0100-024F,U+0259,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF,U+2C60-2C7F,U+A720-A7FF"
$cjkUnicodeRange = "U+3000-303F,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF,U+20000-2A6DF,U+2A700-2B73F,U+2B740-2B81F,U+2B820-2CEAF"

$jobs = @(
  @{
    Input = Join-Path $LexendRoot "Lexend-Regular.ttf"
    Output = Join-Path $OutputDir "Lexend-UI-400.woff2"
    Range = $latinUnicodeRange
  },
  @{
    Input = Join-Path $LexendRoot "Lexend-Medium.ttf"
    Output = Join-Path $OutputDir "Lexend-UI-500.woff2"
    Range = $latinUnicodeRange
  },
  @{
    Input = Join-Path $LexendRoot "Lexend-SemiBold.ttf"
    Output = Join-Path $OutputDir "Lexend-UI-600.woff2"
    Range = $latinUnicodeRange
  },
  @{
    Input = Join-Path $SourceHanRoot "SourceHanSansSC-Regular.otf"
    Output = Join-Path $OutputDir "SourceHanSansSC-UI-400.woff2"
    Range = $cjkUnicodeRange
  },
  @{
    Input = Join-Path $SourceHanRoot "SourceHanSansSC-Medium.otf"
    Output = Join-Path $OutputDir "SourceHanSansSC-UI-500.woff2"
    Range = $cjkUnicodeRange
  },
  @{
    Input = Join-Path $SourceHanRoot "SourceHanSansSC-Bold.otf"
    Output = Join-Path $OutputDir "SourceHanSansSC-UI-600.woff2"
    Range = $cjkUnicodeRange
  }
)

foreach ($job in $jobs) {
  Assert-PathExists -PathValue $job.Input -Label "Source font file"
  Build-Subset -InputFile $job.Input -OutputFile $job.Output -UnicodeRange $job.Range
}

Write-Host "Done. Generated fonts in $OutputDir"
