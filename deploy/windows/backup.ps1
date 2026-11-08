# Local backup: MongoDB dump + uploaded photos/signatures into deploy\backups\<timestamp>\
$ErrorActionPreference = "Stop"
$deploy = Split-Path -Parent $PSScriptRoot
Set-Location $deploy

$dbName = (Get-Content "local.env" | Where-Object { $_ -match "^DB_NAME=" }) -replace "^DB_NAME=", ""
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$out = Join-Path $deploy "backups\$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null

docker compose exec -T mongo mongodump --db $dbName --archive=/tmp/db.archive --gzip
docker compose cp mongo:/tmp/db.archive "$out\db.archive"
docker compose exec -T backend sh -c "cd /data && tar czf /tmp/uploads.tgz uploads"
docker compose cp backend:/tmp/uploads.tgz "$out\uploads.tgz"

Write-Host "Backup saved to $out" -ForegroundColor Green
