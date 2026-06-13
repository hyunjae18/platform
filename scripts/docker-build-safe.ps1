$ErrorActionPreference = "Stop"
$env:COMPOSE_PARALLEL_LIMIT = "1"
$env:DOCKER_BUILDKIT = "1"
$env:BUILDKIT_PROGRESS = "plain"

Write-Host "Checking Docker engine..."
docker version

Write-Host "Starting infrastructure..."
docker compose up -d rabbitmq mongodb minio elasticsearch qdrant

Write-Host "Building app services..."
docker compose build --progress=plain api-gateway archive-service document-service metadata-service-1
docker compose up -d api-gateway archive-service document-service metadata-service-1

Write-Host "Building classifier once, then starting both classifier containers..."
docker compose build --progress=plain classifier-service-1
docker compose up -d classifier-service-1 classifier-service-2

Write-Host "Building semantic search once, then starting both search containers..."
docker compose build --progress=plain semantic-search-service-1
docker compose up -d semantic-search-service-1 semantic-search-service-2

Write-Host "Building OCR once, then starting all OCR containers..."
docker compose build --progress=plain ocr-service-1
docker compose up -d ocr-service-1
Write-Host "Waiting 90 seconds for OCR model cache to initialize before starting replicas..."
Start-Sleep -Seconds 90
docker compose up -d ocr-service-2 ocr-service-3

Write-Host "Final service state:"
docker compose ps
