$ErrorActionPreference = 'Stop'
$taskPreviousEncoding = $OutputEncoding
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$taskName = Read-Host 'Nome do administrador'
$taskEmail = Read-Host 'Email do administrador'
$taskSecret = Read-Host 'Senha (12+ caracteres, maiuscula, minuscula e numero)' -AsSecureString
$taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
try {
 $taskPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
 $taskJson = @{name=$taskName;email=$taskEmail;password=$taskPassword} | ConvertTo-Json -Compress
 $taskJson | npm.cmd run admin:create
 if ($LASTEXITCODE -ne 0) { throw 'Administrador nao criado.' }
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer); $taskPassword=$null; $taskJson=$null; $OutputEncoding=$taskPreviousEncoding }