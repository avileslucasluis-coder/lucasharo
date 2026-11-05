$ErrorActionPreference = 'Stop'
$conexionRevision = Read-Host 'Pega la conexión directa de Neon (solo lectura de comprobación)' -AsSecureString
$conexionAnterior = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')
try {
  $env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $conexionRevision).Password
  & node (Join-Path $PSScriptRoot 'check-database.cjs')
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'La base todavía no está lista. Revisa los nombres de migraciones o el aviso anterior.'
  } else {
    Write-Host 'Migraciones y columnas ATS verificadas. No se modificaron datos.'
  }
} finally {
  [Environment]::SetEnvironmentVariable('DATABASE_URL', $conexionAnterior, 'Process')
  $conexionRevision.Dispose()
  Remove-Variable conexionRevision, conexionAnterior -ErrorAction SilentlyContinue
}
