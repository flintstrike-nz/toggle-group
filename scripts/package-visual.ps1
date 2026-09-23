param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot '..\pbiviz.json')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$configFullPath = Resolve-Path $ConfigPath
$versionFilePath = Join-Path $repoRoot 'version.json'

Write-Host 'Updating Power BI visual version...'
$configContent = Get-Content -Raw -Path $configFullPath
$config = $configContent | ConvertFrom-Json

$versionParts = $config.visual.version -split '\.'
if ($versionParts.Count -ne 4) {
    throw "Expected a 4-part version string in pbiviz.json, found '$($config.visual.version)'."
}

$versionParts[3] = [string]([int]$versionParts[3] + 1)
$config.visual.version = ($versionParts -join '.')

$jsonContent = $config | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($configFullPath, $jsonContent, [System.Text.UTF8Encoding]::new($false))

$versionInfo = @{ version = $config.visual.version }
[System.IO.File]::WriteAllText($versionFilePath, ($versionInfo | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
Write-Host "Updated visual version to $($config.visual.version)"
Write-Host "Saved visual version to version.json"

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
Push-Location $repoRoot
try {
    npx pbiviz package
}
finally {
    Pop-Location
}
