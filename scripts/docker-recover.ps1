param(
  [switch]$Prune
)

$ErrorActionPreference = "Continue"

Write-Host "Stopping stale Docker Desktop and build processes..."
$processes = @(
  "docker",
  "docker-compose",
  "docker-buildx",
  "com.docker.build",
  "com.docker.backend",
  "docker-agent",
  "Docker Desktop"
)

foreach ($name in $processes) {
  Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host "Resetting WSL Docker backend..."
wsl --shutdown
Start-Sleep -Seconds 8

$dockerDesktop = Join-Path $Env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
if (!(Test-Path $dockerDesktop)) {
  throw "Docker Desktop executable was not found at $dockerDesktop"
}

Write-Host "Starting Docker Desktop..."
Start-Process -FilePath $dockerDesktop -WindowStyle Hidden

Write-Host "Waiting for Docker engine..."
for ($i = 1; $i -le 36; $i++) {
  docker version *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Docker engine is ready."
    break
  }
  Start-Sleep -Seconds 5
}

docker version
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Docker Desktop is still returning an engine error."
  Write-Host "Restart Windows, then run this script again."
  exit 1
}

if ($Prune) {
  Write-Host "Pruning stopped containers, unused images, volumes, and build cache..."
  docker compose down -v --remove-orphans
  docker builder prune -af
  docker buildx prune -af
  docker system prune -af --volumes
}

