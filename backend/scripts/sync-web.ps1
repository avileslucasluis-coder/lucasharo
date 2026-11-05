$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$webBuild = Join-Path $projectRoot 'sistema_tributario_rimpe\build\web'
$publicPath = Join-Path $projectRoot 'backend\public'
if (!(Test-Path -LiteralPath (Join-Path $webBuild 'main.dart.js'))) { throw 'Compila Flutter web antes de sincronizar.' }
Copy-Item -Path (Join-Path $webBuild '*') -Destination $publicPath -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'sistema_tributario_rimpe\web\retire-worker.js') -Destination (Join-Path $publicPath 'flutter_service_worker.js') -Force
Write-Output 'Interfaz sincronizada; se conservaron las páginas de recuperación.'
