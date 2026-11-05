$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$correoAdmin = Read-Host 'Correo de tu cuenta existente (Enter: avileslucasluis@gmail.com)'
if ([string]::IsNullOrWhiteSpace($correoAdmin)) { $correoAdmin = 'avileslucasluis@gmail.com' }
$conexionAdmin = Read-Host 'Conexión de la base de datos' -AsSecureString
$confirmacionAdmin = Read-Host 'Escribe DESIGNAR ADMINISTRADOR para otorgarle acceso administrativo'
try {
  $entradaAdmin = @{
    email = $correoAdmin
    databaseUrl = [System.Net.NetworkCredential]::new('', $conexionAdmin).Password
    confirm = $confirmacionAdmin
  } | ConvertTo-Json -Compress
  $entradaAdmin | node (Join-Path $PSScriptRoot 'designar-admin.cjs')
  if ($LASTEXITCODE -ne 0) { Write-Host 'La activacion no se completo. Sigue la indicacion anterior.' }
} finally {
  Remove-Variable entradaAdmin, conexionAdmin -ErrorAction SilentlyContinue
}
