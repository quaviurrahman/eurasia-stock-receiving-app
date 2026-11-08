# Builds and starts EurasiaStockIntake (MongoDB + API + web) in Docker.
$ErrorActionPreference = "Stop"
$deploy = Split-Path -Parent $PSScriptRoot
Set-Location $deploy

if (-not (Test-Path "local.env")) {
    Copy-Item "local.env.example" "local.env"
    Write-Host "Created deploy\local.env - edit it (JWT_SECRET, ADMIN_PASSWORD, CPIS_BASE_URL, CPIS_API_KEY) and run start.ps1 again." -ForegroundColor Yellow
    notepad "local.env"
    exit 1
}
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }

$net = (Get-Content ".env" | Where-Object { $_ -match "^CPIS_NETWORK=" }) -replace "^CPIS_NETWORK=", ""
if (-not $net) { $net = "cpis_shared" }
docker network inspect $net *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating shared Docker network '$net' for CPIS..."
    docker network create $net | Out-Null
}

docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw "docker compose failed" }

$port = (Get-Content ".env" | Where-Object { $_ -match "^APP_PORT=" }) -replace "^APP_PORT=", ""
if (-not $port) { $port = "8080" }
Write-Host ""
Write-Host "EurasiaStockIntake is running at http://localhost:$port" -ForegroundColor Green
Write-Host "Make sure your CPIS container is on network '$net':  docker network connect $net <cpis-container-name>"
