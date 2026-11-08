# Restore a local backup made by backup.ps1.  Usage:  .\restore.ps1 -Folder ..\backups\20260601-1200
param([Parameter(Mandatory = $true)][string]$Folder)
$ErrorActionPreference = "Stop"
$deploy = Split-Path -Parent $PSScriptRoot
$Folder = (Resolve-Path $Folder).Path
Set-Location $deploy

$confirm = Read-Host "This REPLACES all current data. Type RESTORE to continue"
if ($confirm -ne "RESTORE") { exit 1 }

$dbName = (Get-Content "local.env" | Where-Object { $_ -match "^DB_NAME=" }) -replace "^DB_NAME=", ""
docker compose cp "$Folder\db.archive" mongo:/tmp/db.archive
docker compose exec -T mongo mongorestore --drop --nsInclude "$dbName.*" --archive=/tmp/db.archive --gzip
if (Test-Path "$Folder\uploads.tgz") {
    docker compose cp "$Folder\uploads.tgz" backend:/tmp/uploads.tgz
    docker compose exec -T backend sh -c "cd /data && tar xzf /tmp/uploads.tgz"
}
Write-Host "Restore complete." -ForegroundColor Green
