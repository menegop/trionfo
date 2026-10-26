# Prepara la cartella della PWA per GitHub Pages su Windows.
# Scarica i runtime ufficiali, opzionalmente copia il modello ONNX e controlla i file.
# Esempi:
#   powershell -ExecutionPolicy Bypass -File .\PREPARA_GITHUB_PAGES.ps1
#   powershell -ExecutionPolicy Bypass -File .\PREPARA_GITHUB_PAGES.ps1 -ModelPath 'C:\trionfo\export\trionfo_v14.onnx'
param([string]$ModelPath = '')
$ErrorActionPreference = 'Stop'
$version = '1.20.1'
$root = $PSScriptRoot
$vendor = Join-Path $root 'vendor'
$models = Join-Path $root 'models'
New-Item -ItemType Directory -Force -Path $vendor,$models | Out-Null
$base = "https://cdn.jsdelivr.net/npm/onnxruntime-web@$version/dist"
$resources = @(
  @{ name = 'ort.wasm.min.js'; minimum = 10000 },
  @{ name = 'ort-wasm-simd-threaded.mjs'; minimum = 1000 },
  @{ name = 'ort-wasm-simd-threaded.wasm'; minimum = 100000 }
)
Write-Host "Preparazione Trionfo PWA / GitHub Pages" -ForegroundColor Cyan
Write-Host "ONNX Runtime Web $version (WASM CPU, no CDN at runtime)"
foreach ($resource in $resources) {
  $name = $resource.name
  $target = Join-Path $vendor $name
  if ((Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -ge $resource.minimum) {
    Write-Host "Gia presente: $name"
    continue
  }
  $downloaded = $false
  for ($attempt = 1; $attempt -le 3 -and -not $downloaded; $attempt++) {
    $tmp = "$target.part"
    try {
      Write-Host "Scarico $name (tentativo $attempt)..."
      Invoke-WebRequest -Uri "$base/$name" -OutFile $tmp -UseBasicParsing -TimeoutSec 180 -ErrorAction Stop
      if ((Get-Item -LiteralPath $tmp).Length -lt $resource.minimum) { throw "Download incompleto: $name" }
      Move-Item -LiteralPath $tmp -Destination $target -Force
      $downloaded = $true
    } catch {
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
      Write-Warning $_.Exception.Message
      if ($attempt -eq 3) { throw "Download non riuscito: $name" }
      Start-Sleep -Seconds 2
    }
  }
}
$licenseUrl = "https://cdn.jsdelivr.net/npm/onnxruntime-web@$version/LICENSE"
$licenseFile = Join-Path $vendor 'LICENSE.onnxruntime-web.txt'
if (-not (Test-Path $licenseFile)) {
  try { Invoke-WebRequest -Uri $licenseUrl -OutFile $licenseFile -UseBasicParsing -TimeoutSec 60 }
  catch { Write-Warning "Licenza non scaricata, leggere https://github.com/microsoft/onnxruntime/blob/main/LICENSE" }
}
if ($ModelPath) {
  $source = (Resolve-Path -LiteralPath $ModelPath -ErrorAction Stop).Path
  if (-not $source.ToLowerInvariant().EndsWith('.onnx')) { throw 'Il modello deve essere un file .onnx' }
  $destination = Join-Path $models 'trionfo_v14.onnx'
  if ($source -ne $destination) { Copy-Item -LiteralPath $source -Destination $destination -Force }
  $metaSrc = [IO.Path]::ChangeExtension($source, '.json')
  if (Test-Path -LiteralPath $metaSrc) {
    Copy-Item -LiteralPath $metaSrc -Destination (Join-Path $models 'trionfo_v14.json') -Force
  }
}
$model = Join-Path $models 'trionfo_v14.onnx'
if (-not (Test-Path -LiteralPath $model)) {
  Write-Warning "MANCA IL MODELLO: $model"
  Write-Host 'Esportalo dal progetto Python e copia models/trionfo_v14.onnx prima di pubblicare.' -ForegroundColor Yellow
  Write-Host 'Il sito puo caricarsi senza modello, ma la V14 e i regret non funzioneranno.' -ForegroundColor Yellow
  Write-Host 'Download completato, ma preparazione per la pubblicazione NON completa.' -ForegroundColor Yellow
  exit 2
} elseif ((Get-Item -LiteralPath $model).Length -lt 100000) {
  throw "Il modello ONNX sembra troppo piccolo: $model"
} else {
  Write-Host "Modello ONNX pronto: $([math]::Round((Get-Item $model).Length/1MB,2)) MB" -ForegroundColor Green
}
$staticFiles = @('index.html','styles.css','app.js','game.js','ai.js','onnx_tutor.js','pwa.js','sw.js','manifest.webmanifest', 'icons/trionfo-192.png','icons/trionfo-512.png','icons/trionfo-maskable-512.png')
foreach ($name in $staticFiles) { if (-not (Test-Path -LiteralPath (Join-Path $root $name))) { throw "File sito assente: $name" } }
Write-Host 'Moduli ONNX e struttura PWA verificati. Carica la CARTELLA INTERA su GitHub, con index.html nella radice.' -ForegroundColor Green
