$deploy = Split-Path -Parent $PSScriptRoot
Set-Location $deploy
docker compose down
