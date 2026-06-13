# Docmind Service Connection Verification Script

param(
    [switch]$Verbose
)

function Write-Status { Write-Host $args[0] -ForegroundColor Cyan -NoNewline; Write-Host " $($args[1])" -ForegroundColor $args[2] }
function Write-Success { Write-Host "✓" -ForegroundColor Green }
function Write-Failed { Write-Host "✗" -ForegroundColor Red }
function Write-Pending { Write-Host "⧐" -ForegroundColor Yellow }

# Clear screen
Clear-Host

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Docmind Service Connection Verification                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$results = @()

# Helper function to test endpoint
function Test-Endpoint {
    param(
        [string]$Url,
        [string]$ServiceName,
        [int]$Port,
        [string]$Method = "GET"
    )
    
    Write-Host "Testing $ServiceName (Port $Port)..." -NoNewline
    
    try {
        $response = Invoke-WebRequest -Uri $Url -Method $Method -TimeoutSec 2 -ErrorAction Stop
        Write-Success
        return @{Service = $ServiceName; Status = "OK"; Port = $Port; StatusCode = $response.StatusCode}
    }
    catch [System.Net.Http.HttpRequestException] {
        Write-Failed
        return @{Service = $ServiceName; Status = "UNREACHABLE"; Port = $Port; Error = "Connection refused"}
    }
    catch [System.Net.WebException] {
        Write-Failed
        return @{Service = $ServiceName; Status = "UNREACHABLE"; Port = $Port; Error = $_.Exception.Message}
    }
    catch {
        Write-Failed
        return @{Service = $ServiceName; Status = "ERROR"; Port = $Port; Error = $_.Exception.Message}
    }
}

# Test each service
Write-Host ""
Write-Host "─── Network Connectivity ───────────────────────────────────" -ForegroundColor Cyan
Write-Host ""

$results += Test-Endpoint "http://localhost:3000" "Frontend (Vite)" 3000
$results += Test-Endpoint "http://localhost:3001/health" "Auth Server" 3001
$results += Test-Endpoint "http://localhost:8001/health" "API Gateway" 8001
$results += Test-Endpoint "mongodb://127.0.0.1:27017" "MongoDB" 27017

Write-Host ""
Write-Host "─── Service Port Listening ─────────────────────────────────" -ForegroundColor Cyan
Write-Host ""

$ports = @(3000, 3001, 8001, 27017)
foreach ($port in $ports) {
    Write-Host "Port $port..." -NoNewline
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connection) {
        Write-Success
    } else {
        Write-Failed
    }
}

Write-Host ""
Write-Host "─── Configuration Check ────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""

# Check .env files
$envFiles = @(
    "D:\Docmind-v01-main\server\.env",
    "D:\api-gatwat\.env"
)

foreach ($envFile in $envFiles) {
    $fileName = Split-Path $envFile -Leaf
    Write-Host "Checking $fileName..." -NoNewline
    
    if (Test-Path $envFile) {
        Write-Success
        
        # Check for JWT_SECRET
        $content = Get-Content $envFile
        if ($content | Select-String "JWT_SECRET") {
            $jwtLines = $content | Select-String "JWT_SECRET"
            foreach ($line in $jwtLines) {
                Write-Host "  $line" -ForegroundColor Gray
            }
        }
    } else {
        Write-Failed
        Write-Host "  File not found: $envFile" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "─── Dependencies Check ─────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "Node.js..." -NoNewline
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Success
    Write-Host "  $(node --version)" -ForegroundColor Gray
} else {
    Write-Failed
    Write-Host "  Not installed" -ForegroundColor Red
}

# Check npm
Write-Host "npm..." -NoNewline
if (Get-Command npm -ErrorAction SilentlyContinue) {
    Write-Success
    Write-Host "  $(npm --version)" -ForegroundColor Gray
} else {
    Write-Failed
    Write-Host "  Not installed" -ForegroundColor Red
}

# Check Python
Write-Host "Python..." -NoNewline
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Success
    Write-Host "  $(python --version)" -ForegroundColor Gray
} else {
    Write-Failed
    Write-Host "  Not installed" -ForegroundColor Red
}

# Check node_modules
Write-Host "Frontend dependencies..." -NoNewline
if (Test-Path "D:\Docmind-v01-main\node_modules") {
    Write-Success
} else {
    Write-Pending
    Write-Host "  Run: npm install (in D:\Docmind-v01-main)" -ForegroundColor Yellow
}

Write-Host "Server dependencies..." -NoNewline
if (Test-Path "D:\Docmind-v01-main\server\node_modules") {
    Write-Success
} else {
    Write-Pending
    Write-Host "  Run: npm install (in D:\Docmind-v01-main\server)" -ForegroundColor Yellow
}

Write-Host "Python venv..." -NoNewline
if (Test-Path "D:\api-gatwat\venv") {
    Write-Success
} else {
    Write-Pending
    Write-Host "  Run: python -m venv venv (in D:\api-gatwat)" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

$okCount = ($results | Where-Object {$_.Status -eq "OK"}).Count
$totalCount = $results.Count

if ($okCount -eq $totalCount) {
    Write-Host "✓ All services are running and connected!" -ForegroundColor Green
} else {
    Write-Host "⚠ Some services are not responding" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Services Status:" -ForegroundColor Cyan
    foreach ($result in $results) {
        if ($result.Status -eq "OK") {
            Write-Host "  ✓ $($result.Service): OK" -ForegroundColor Green
        } else {
            Write-Host "  ✗ $($result.Service): $($result.Status)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "To start services, use one of these commands:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  # Automated startup:" -ForegroundColor Gray
    Write-Host "  D:\Docmind-v01-main\start-all-services.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # Or manually in separate terminals:" -ForegroundColor Gray
    Write-Host "  cd D:\Docmind-v01-main && npm run dev" -ForegroundColor Cyan
    Write-Host "  cd D:\Docmind-v01-main\server && npm start" -ForegroundColor Cyan
    Write-Host "  cd D:\api-gatwat && python main.py" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "For detailed troubleshooting, see:" -ForegroundColor Cyan
Write-Host "  D:\Docmind-v01-main\CONNECTION_TROUBLESHOOTING.md" -ForegroundColor Cyan
Write-Host ""
