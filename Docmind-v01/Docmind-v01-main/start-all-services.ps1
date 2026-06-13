# Docmind Multi-Service Startup Script for Windows PowerShell
# This script starts all necessary services in the correct order

param(
    [switch]$SkipFrontend,
    [switch]$SkipServer,
    [switch]$SkipGateway
)

# Color output
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Error-Custom { Write-Host $args -ForegroundColor Red }
function Write-Info { Write-Host $args -ForegroundColor Cyan }

$RootDir = "D:\Docmind-v01-main"
$ServerDir = "$RootDir\server"
$GatewayDir = "D:\api-gatwat"

Write-Info "════════════════════════════════════════════════════"
Write-Info "   Docmind Multi-Service Startup Script"
Write-Info "════════════════════════════════════════════════════"

# Check if Node.js and npm are installed
Write-Info ""
Write-Info "Checking prerequisites..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error-Custom "✗ Node.js not found. Please install Node.js first."
    exit 1
}
Write-Success "✓ Node.js found: $(node --version)"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error-Custom "✗ Python not found. Please install Python first."
    exit 1
}
Write-Success "✓ Python found: $(python --version)"

# Start Frontend (Vite - Port 3000)
if (-not $SkipFrontend) {
    Write-Info ""
    Write-Info "────────────────────────────────────────────────────"
    Write-Info "1. Starting Vite Frontend (Port 3000)..."
    Write-Info "────────────────────────────────────────────────────"
    
    if (-not (Test-Path "$RootDir\node_modules")) {
        Write-Info "Installing frontend dependencies..."
        Set-Location $RootDir
        npm install --quiet
    }
    
    # Open new terminal for frontend
    Start-Process powershell -ArgumentList "-NoExit -Command {
        Set-Location '$RootDir'
        Write-Host 'Starting Vite frontend...' -ForegroundColor Cyan
        npm run dev
    }"
    
    Write-Success "✓ Frontend starting (check new terminal)"
    Start-Sleep -Seconds 3
}

# Start Node.js Auth Server (Port 3001)
if (-not $SkipServer) {
    Write-Info ""
    Write-Info "────────────────────────────────────────────────────"
    Write-Info "2. Starting Node.js Auth Server (Port 3001)..."
    Write-Info "────────────────────────────────────────────────────"
    
    if (-not (Test-Path "$ServerDir\node_modules")) {
        Write-Info "Installing server dependencies..."
        Set-Location $ServerDir
        npm install --quiet
    }
    
    # Set PORT environment variable
    $env:PORT = 3001
    $env:JWT_SECRET = "change-me-must-match-nodejs-jwt-secret"
    $env:MONGODB_URI = "mongodb://127.0.0.1:27017/docmind_identity"
    $env:DOCUMENT_SERVICE_URL = "http://127.0.0.1:3000/documents"
    
    # Open new terminal for server
    Start-Process powershell -ArgumentList "-NoExit -Command {
        Set-Location '$ServerDir'
        `$env:PORT = 3001
        `$env:JWT_SECRET = 'change-me-must-match-nodejs-jwt-secret'
        `$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/docmind_identity'
        `$env:DOCUMENT_SERVICE_URL = 'http://127.0.0.1:3000/documents'
        Write-Host 'Starting Node.js Auth Server...' -ForegroundColor Cyan
        npm start
    }"
    
    Write-Success "✓ Auth Server starting (check new terminal)"
    Start-Sleep -Seconds 2
}

# Start API Gateway (Python - Port 8001)
if (-not $SkipGateway) {
    Write-Info ""
    Write-Info "────────────────────────────────────────────────────"
    Write-Info "3. Starting API Gateway (Port 8001)..."
    Write-Info "────────────────────────────────────────────────────"
    
    Set-Location $GatewayDir
    
    # Check if virtual environment exists
    if (-not (Test-Path "$GatewayDir\venv")) {
        Write-Info "Creating Python virtual environment..."
        python -m venv venv
    }
    
    # Activate venv and install requirements
    & "$GatewayDir\venv\Scripts\Activate.ps1"
    if (Test-Path "$GatewayDir\requirements.txt") {
        Write-Info "Installing Python dependencies..."
        pip install -q -r requirements.txt
    }
    
    # Open new terminal for gateway
    Start-Process powershell -ArgumentList "-NoExit -Command {
        Set-Location '$GatewayDir'
        & '$GatewayDir\venv\Scripts\Activate.ps1'
        Write-Host 'Starting API Gateway...' -ForegroundColor Cyan
        python main.py
    }"
    
    Write-Success "✓ API Gateway starting (check new terminal)"
}

Write-Info ""
Write-Info "════════════════════════════════════════════════════"
Write-Info "   Service Startup Complete!"
Write-Info "════════════════════════════════════════════════════"
Write-Info ""
Write-Info "Services should now be running at:"
Write-Success "  • Frontend:    http://localhost:3000"
Write-Success "  • Auth Server: http://localhost:3001"
Write-Success "  • API Gateway: http://localhost:8001"
Write-Info ""
Write-Info "Check the new terminal windows for logs."
Write-Info "Press Ctrl+C in each terminal to stop services."
Write-Info ""
