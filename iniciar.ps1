param([switch]$SinCompilar)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$backendPath = Join-Path $projectRoot 'backend'
$frontendPath = Join-Path $projectRoot 'sistema_tributario_rimpe'

function Invoke-Checked {
  param([string]$Program, [string[]]$Arguments)
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo al ejecutar $Program (codigo $LASTEXITCODE)."
  }
}

function Test-DockerEngine {
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & docker info --format '{{.ServerVersion}}' 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
  } finally { $ErrorActionPreference = $previousPreference }
}

foreach ($program in @('node', 'npm.cmd', 'docker', 'flutter.bat')) {
  if (-not (Get-Command $program -ErrorAction SilentlyContinue)) {
    throw "Falta instalar $program o agregarlo al PATH."
  }
}

Push-Location $backendPath
try {
  if (-not (Test-Path -LiteralPath '.env')) {
    $jwtSecret = & node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar la clave de sesion.' }
    $environmentText = (Get-Content -LiteralPath '.env.example' -Raw).Replace('CAMBIAR_POR_UN_VALOR_ALEATORIO_LARGO', $jwtSecret)
    Set-Content -LiteralPath '.env' -Value $environmentText -Encoding UTF8
  }

  $apiPort = 3000
  foreach ($environmentLine in (Get-Content -LiteralPath '.env')) {
    if ($environmentLine -match '^\s*PORT\s*=\s*"?(\d+)"?\s*$') { $apiPort = [int]$Matches[1] }
  }
  $systemUrl = "http://localhost:$apiPort"
  try {
    $existingSystem = Invoke-RestMethod -Uri "$systemUrl/api/health" -TimeoutSec 2
    if ($existingSystem.status -eq 'ok' -and $existingSystem.database -eq 'connected') {
      Write-Host "El sistema ya esta funcionando en $systemUrl"
      return
    }
  } catch {
    # Todavia no hay una API disponible: continuar con el arranque.
  }

  if (-not (Test-DockerEngine)) {
    $dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (Test-Path -LiteralPath $dockerDesktop) {
      Write-Host 'Iniciando Docker Desktop...'
      Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
      $dockerReady = $false
      for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Seconds 2
        if (Test-DockerEngine) { $dockerReady = $true; break }
      }
      if (-not $dockerReady) { throw 'Docker no pudo iniciar. Revisa su ventana y vuelve a intentar.' }
    } else {
      throw 'Inicia Docker Desktop antes de continuar.'
    }
  }

  Invoke-Checked 'docker' @('compose', 'up', '-d', '--wait', 'db')
  if (-not (Test-Path -LiteralPath 'node_modules')) { Invoke-Checked 'npm.cmd' @('ci') }
  Invoke-Checked 'npm.cmd' @('run', 'prisma:generate')
  Invoke-Checked 'npm.cmd' @('run', 'db:deploy')
  Invoke-Checked 'npm.cmd' @('run', 'seed')

  if (-not $SinCompilar -or -not (Test-Path -LiteralPath 'dist\main.js')) {
    Invoke-Checked 'npm.cmd' @('run', 'build')
  }
  if (-not $SinCompilar -or -not (Test-Path -LiteralPath 'public\index.html')) {
    Push-Location $frontendPath
    try {
      Invoke-Checked 'flutter.bat' @('pub', 'get')
      Invoke-Checked 'flutter.bat' @('build', 'web', '--release', '--dart-define=API_BASE_URL=')
    } finally { Pop-Location }
    New-Item -ItemType Directory -Path (Join-Path $backendPath 'public') -Force | Out-Null
    Copy-Item -Path (Join-Path $frontendPath 'build\web\*') -Destination (Join-Path $backendPath 'public') -Recurse -Force
  }

  Write-Host "Abre $systemUrl. Para detener la API, presiona Ctrl+C."
  Invoke-Checked 'npm.cmd' @('run', 'start:prod')
} finally { Pop-Location }
