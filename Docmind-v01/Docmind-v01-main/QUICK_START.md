# Docmind Quick Reference Card

## 🚀 Quick Start (30 seconds)

```powershell
# Option 1: Automated (Recommended)
cd D:\Docmind-v01-main
.\start-all-services.ps1

# Option 2: Manual (3 terminals)
# Terminal 1:
cd D:\Docmind-v01-main && npm run dev

# Terminal 2:
cd D:\Docmind-v01-main\server && npm start

# Terminal 3:
cd D:\api-gatwat && python main.py
```

## 🔍 Verify It's Working

```powershell
# Run verification script
.\verify-services.ps1

# Or manually test
curl http://localhost:3000      # Frontend
curl http://localhost:3001/health  # Auth Server
curl http://localhost:8001/health  # API Gateway
```

## 🏗️ Architecture

```
Frontend (3000)
     ↓
Auth Server (3001)
     ↓
API Gateway (8001)
     ↓
Microservices (8000, 8002, 8003, 8004)
     ↓
MongoDB (27017)
```

## 📍 Service Endpoints

| Service | Port | URL | Check |
|---------|------|-----|-------|
| Frontend | 3000 | http://localhost:3000 | Browser test |
| Auth | 3001 | http://localhost:3001/health | `{"status":"ok"}` |
| API Gateway | 8001 | http://localhost:8001/health | `{"status":"ok"}` |
| Swagger Docs | 8001 | http://localhost:8001/docs | UI loads |
| MongoDB | 27017 | localhost:27017 | Connection test |

## ⚙️ Key Configuration Files

- **Frontend env**: `.env` (auto-generated)
- **Auth Server env**: [server/.env](server/.env)
- **API Gateway env**: [api-gatwat/.env](../api-gatwat/.env)

## 🔐 Unified JWT Secret

✅ **Both services now use**: `docmind-secure-jwt-key-2024`

| File | Secret |
|------|--------|
| server/.env | `JWT_SECRET=docmind-secure-jwt-key-2024` |
| api-gatwat/.env | `JWT_SECRET=docmind-secure-jwt-key-2024` |

## 🐛 Troubleshooting

### "Connection refused on port 3000"
→ Frontend not running: `npm run dev`

### "Connection refused on port 3001"
→ Auth Server not running: `npm start` (in server folder)

### "Connection refused on port 8001"
→ API Gateway not running: `python main.py` (in api-gatwat)

### "Redis unavailable"
→ Normal - optional cache, system falls back to local storage

### "Cannot connect to MongoDB"
→ Start MongoDB: `mongod` or `docker run -d -p 27017:27017 mongo`

## 📋 Setup Checklist

- [ ] MongoDB installed/running
- [ ] Node.js installed (`node --version`)
- [ ] Python installed (`python --version`)
- [ ] Frontend dependencies: `npm install` (in root)
- [ ] Server dependencies: `npm install` (in server/)
- [ ] API Gateway venv: `python -m venv venv` (in api-gatwat/)
- [ ] API Gateway deps: `pip install -r requirements.txt`
- [ ] Environment files configured
- [ ] Services starting in order

## 🧪 Test Connectivity

### Register a user through API Gateway
```powershell
$headers = @{"Content-Type" = "application/json"}
$body = @{
    email = "test@example.com"
    password = "Test123!"
    name = "Test User"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8001/auth/register" `
  -Method POST `
  -Headers $headers `
  -Body $body
```

Expected responses:
- `201` = Success ✓
- `422` = Validation error (normal)
- `502` = Auth Server down (check Terminal 2)
- Connection refused = API Gateway down (check Terminal 3)

## 📚 Documentation

- [Full Troubleshooting Guide](CONNECTION_TROUBLESHOOTING.md)
- [Service Startup Guide](SERVICE_STARTUP_GUIDE.md)
- [Startup Script](start-all-services.ps1)
- [Verification Script](verify-services.ps1)

## 🎯 Success Criteria

All three should show:
```
Terminal 1: "Local: http://localhost:3000/"
Terminal 2: "API server running on http://localhost:3001"
Terminal 3: "Uvicorn running on http://0.0.0.0:8001"
```

And these should work:
- ✓ Browser: http://localhost:3000
- ✓ curl: http://localhost:3001/health
- ✓ curl: http://localhost:8001/health

## 🔧 Common Commands

```powershell
# Install all dependencies
npm install          # root
npm install          # server/
pip install -r requirements.txt  # api-gatwat/

# Start services
npm run dev          # frontend
npm start            # auth server
python main.py       # api gateway

# Test endpoints
curl http://localhost:3000
curl http://localhost:3001/health
curl http://localhost:8001/health
curl http://localhost:8001/docs

# Check what's running on each port
netstat -ano | findstr :3000
netstat -ano | findstr :3001
netstat -ano | findstr :8001
```

## ✅ What Was Fixed

1. **JWT Secret unified** across Auth Server and API Gateway
2. **Port configuration verified** (3001 for Auth, 8001 for Gateway)
3. **Environment variables cleaned up** in .env files
4. **Startup scripts created** for easier launch
5. **Verification tools added** for diagnosis

---

**Last Updated**: 2026-05-28  
**Status**: ✅ All services configured and ready to connect
