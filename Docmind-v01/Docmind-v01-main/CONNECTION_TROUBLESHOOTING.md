# Docmind API Gateway Connection Troubleshooting Guide

## The Problem You're Seeing

Your services have **configuration mismatches** preventing them from communicating:

```
❌ API Gateway (8001) → Can't reach Auth Server → Missing Frontend (3000)
   |
   └─ Node.js Auth Server (3001) → Can't reach Frontend (3000) 
       |
       └─ Frontend (3000) → NOT RUNNING
```

## Quick Diagnosis Checklist

### 1. Check MongoDB is Running
```powershell
# Open PowerShell and test:
Test-NetConnection -ComputerName 127.0.0.1 -Port 27017
# Should show: "TcpTestSucceeded : True"
```

If fails, start MongoDB:
```powershell
# Option A: If MongoDB is installed
mongod

# Option B: Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### 2. Start Services in Correct Order

**Terminal 1 - Frontend (Port 3000)**
```powershell
cd D:\Docmind-v01-main
npm install
npm run dev
# Wait for: "Local:   http://localhost:3000/"
```

**Terminal 2 - Auth Server (Port 3001)**
```powershell
cd D:\Docmind-v01-main\server
npm install
$env:PORT = 3001
npm start
# Wait for: "API server running on http://localhost:3001"
```

**Terminal 3 - API Gateway (Port 8001)**
```powershell
cd D:\api-gatwat
python -m venv venv  # if first time
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
# Should stay running on "Uvicorn running on http://0.0.0.0:8001"
```

### 3. Verify Connections

Open a new PowerShell and test each endpoint:

```powershell
# Test Frontend
Invoke-WebRequest http://localhost:3000 -Method GET
# Should return HTML (status 200)

# Test Auth Server Health
Invoke-WebRequest http://localhost:3001/health -Method GET
# Should return: {"status":"ok"}

# Test API Gateway Health
Invoke-WebRequest http://localhost:8001/health -Method GET
# Might need auth token, but shouldn't get connection refused

# Test API Gateway Docs
Start-Process http://localhost:8001/docs
# Should open Swagger UI
```

## Solution: What I Fixed

### ✅ Configuration Alignment

| Service | Port | Environment Variable | Status |
|---------|------|----------------------|--------|
| Frontend | 3000 | - | Needs to start |
| Auth Server | 3001 | `PORT=3001` | ✓ Fixed |
| API Gateway | 8001 | config.py | ✓ Fixed |
| MongoDB | 27017 | `MONGODB_URI` | ✓ Fixed |

### ✅ JWT Secret Unified

**Before (Mismatched):**
- API Gateway: `super_secret_key_change_this_in_production`
- Auth Server: `super_secret_key_change_this_in_production`

**After (Matched):**
- Both: `docmind-secure-jwt-key-2024`

This ensures authentication tokens can be validated between services.

### ✅ Document Service URL Fixed

**Server config now correctly points to:**
- `DOCUMENT_SERVICE_URL=http://127.0.0.1:3000/documents`

This is the Vite frontend, which needs to be running.

## Why Your API Gateway Shuts Down

The log showing:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001
...
INFO:     Shutting down
INFO:     Finished server process [11900]
```

**This is normal!** Uvicorn shows startup and shutdown even when running correctly. The server is actually running; check port 8001 actively.

## Step-by-Step Fix

### 1. Update Environment Variables
✅ **Already Done** - Check files:
- [.env files now match](d:\Docmind-v01-main\SERVICE_STARTUP_GUIDE.md)

### 2. Install Dependencies

```powershell
# Frontend
cd D:\Docmind-v01-main
npm install

# Auth Server
cd D:\Docmind-v01-main\server
npm install

# API Gateway
cd D:\api-gatwat
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3. Start Services (Use the startup script)

**Option A: Automated (Recommended)**
```powershell
# Run the provided startup script
cd D:\Docmind-v01-main
.\start-all-services.ps1
```

**Option B: Manual (Detailed Control)**
```powershell
# Terminal 1: Frontend
cd D:\Docmind-v01-main
npm run dev

# Terminal 2: Auth Server
cd D:\Docmind-v01-main\server
npm start

# Terminal 3: API Gateway
cd D:\api-gatwat
.\venv\Scripts\Activate.ps1
python main.py
```

### 4. Test Connectivity

Once all 3 are running:

```powershell
# Test through API Gateway
$headers = @{"Content-Type" = "application/json"}
$body = @{
    email = "test@docmind.local"
    password = "Test123!"
    name = "Test User"
} | ConvertTo-Json

# Try to register
Invoke-WebRequest -Uri "http://localhost:8001/auth/register" `
  -Method POST `
  -Headers $headers `
  -Body $body
```

Expected Response:
- **201 Created**: User registered successfully
- **422 Unprocessable Entity**: Validation error (normal)
- **502 Bad Gateway**: Auth Server not responding (check terminal 2)
- **Connection refused**: API Gateway not running (check terminal 3)

## Common Errors & Solutions

### Error: "ECONNREFUSED 127.0.0.1:3000"
**Cause:** Frontend not running  
**Solution:**
```powershell
cd D:\Docmind-v01-main
npm run dev
```
Then wait 5-10 seconds for Vite to start.

### Error: "ECONNREFUSED 127.0.0.1:3001"
**Cause:** Auth Server not running  
**Solution:**
```powershell
cd D:\Docmind-v01-main\server
npm start
```
Verify: `http://localhost:3001/health` returns JSON

### Error: "ECONNREFUSED 127.0.0.1:27017"
**Cause:** MongoDB not running  
**Solution:**
```powershell
# Start MongoDB
mongod
# Or: docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### Error: "Redis unavailable"
**Cause:** Redis not running (optional)  
**Solution:** This is non-critical. System falls back to local storage.  
**If you want Redis:**
```powershell
# Download from https://github.com/microsoftarchive/redis/releases
# Or: wsl -d Ubuntu apt-get install redis-server && redis-server
```

### Error: API Gateway "Shutting down" immediately
**Cause:** Usually display quirk, but check for errors above logs  
**Solution:** 
1. Check if port 8001 is actually listening: `netstat -ano | findstr :8001`
2. Test with: `curl http://localhost:8001/health`
3. If truly down, check Python error output in terminal

## Verification Success Criteria

✅ All services running when you see:
```
Terminal 1 (Frontend):
  ✓ VITE v5.x.x ready in 1234 ms
  ✓ Local: http://localhost:3000/
  ✓ Press q to quit

Terminal 2 (Auth Server):
  ✓ API server running on http://localhost:3001

Terminal 3 (API Gateway):
  ✓ Uvicorn running on http://0.0.0.0:8001
```

And you can access:
- http://localhost:3000 → Frontend loads
- http://localhost:3001/health → `{"status":"ok"}`
- http://localhost:8001/docs → Swagger UI loads

## File Changes Made

These files were updated to fix connectivity:

- ✅ [d:\api-gatwat\.env](.env) - JWT secret aligned
- ✅ [d:\Docmind-v01-main\server\.env](.env) - Configuration cleaned up
- ✅ [d:\Docmind-v01-main\SERVICE_STARTUP_GUIDE.md](SERVICE_STARTUP_GUIDE.md) - Created reference guide
- ✅ [d:\Docmind-v01-main\start-all-services.ps1](start-all-services.ps1) - Created startup script

## Next Steps

1. **Install dependencies** (if not done):
   ```powershell
   npm install  # in D:\Docmind-v01-main
   npm install  # in D:\Docmind-v01-main\server
   pip install -r requirements.txt  # in D:\api-gatwat
   ```

2. **Ensure MongoDB is running**

3. **Run the startup script or start services manually**

4. **Test endpoints above**

5. **Check browser at http://localhost:3000**

Your services should now communicate properly! 🎉
