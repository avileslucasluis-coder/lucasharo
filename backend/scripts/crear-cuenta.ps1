$ErrorActionPreference = 'Stop'
$accountInput = $null
$dbInput = $null
$passwordInput = $null
$confirmInput = $null
try {
    Write-Host 'Crear una cuenta en Neon sin habilitar el registro publico.'
    $dbInput = Read-Host 'Pega la conexion DIRECTA de Neon (entrada oculta)' -AsSecureString
    $accountName = Read-Host 'Nombre completo'
    $accountEmail = Read-Host 'Correo para recuperar la cuenta'
    $accountRuc = Read-Host 'Cedula de 10 digitos o RUC de 13 digitos'
    $passwordInput = Read-Host 'Nueva clave de 12 a 128 caracteres' -AsSecureString
    $confirmInput = Read-Host 'Repite la nueva clave' -AsSecureString
    $accountInput = @{
        databaseUrl = [System.Net.NetworkCredential]::new('', $dbInput).Password
        nombre = $accountName
        ruc = $accountRuc
        email = $accountEmail
        password = [System.Net.NetworkCredential]::new('', $passwordInput).Password
    }
    if ($accountInput.password -cne [System.Net.NetworkCredential]::new('', $confirmInput).Password) {
        throw 'Las claves no coinciden. Ejecuta de nuevo el comando.'
    }
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $accountInput | ConvertTo-Json -Compress | & node (Join-Path $PSScriptRoot 'crear-cuenta.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'La cuenta no se creo. Revisa el mensaje anterior.' }
} finally {
    $accountInput = $null
    if ($dbInput) { $dbInput.Dispose() }
    if ($passwordInput) { $passwordInput.Dispose() }
    if ($confirmInput) { $confirmInput.Dispose() }
}
