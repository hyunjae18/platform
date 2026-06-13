# Docmind Multi-Service Startup Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Vite React) - Port 3000                  │
│  - Runs in browser                                  │
│  - Communicates with API Gateway                    │
└────────────────┬────────────────────────────────────┘
                 │
                 │ HTTP requests
                 ▼
┌─────────────────────────────────────────────────────┐
│  API Gateway (FastAPI/Python) - Port 8001           │
│  - Routes requests to microservices                 │
│  - Handles JWT authentication                       │
└────┬────────┬────────┬──────────────────────────────┘
     │        │        │
     ▼        ▼        ▼
┌────────┐ ┌────────┐ ┌────────────────────────────┐
│OCR Svc │ │Search  │ │Classification Service      │
│Port 8000│ │Port 8003│ │Port 8002                  │
└────────┘ └────────┘ └────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  Node.js Auth Server - Port 3001                    │
│  - Manages user auth & MongoDB                      │
│  - Provides JWT tokens                              │
└─────────────────────────────────────────────────────┘
```

## Startup Order

### Step 1: Start MongoDB (if not already running)
```powershell
# On Windows with MongoDB installed
mongod
# Or if using Docker:
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### Step 2: Start Node.js Auth Server
```powershell
cd D:\Docmind-v01-main\server
npm install  # if needed
npm start
# Runs on http://localhost:3001
```

### Step 3: Start Vite Frontend
```powershell
cd D:\Docmind-v01-main
npm install  # if needed
npm run dev
# Runs on http://localhost:3000
```

### Step 4: Start API Gateway (Python)
```powershell
cd D:\api-gatwat
# Create/activate virtual environment if needed
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
# Runs on http://localhost:8001
```

### Step 5: Start Microservices (Optional/As Needed)
```powershell
# OCR Service (Port 8000)
# Search Service (Port 8003)
# Classification Service (Port 8002)
# Metadata Service (Port 8004)
# Archiving Service (Port 3007)
```

## Verification Checklist

- [ ] MongoDB running
- [ ] Node.js Server at http://localhost:3001/health
- [ ] Frontend at http://localhost:3000
- [ ] API Gateway at http://localhost:8001/health
- [ ] Test auth: `POST http://localhost:3001/auth/login`
- [ ] Test gateway: `GET http://localhost:8001/health` (after auth)

## Common Issues & Solutions

### "ECONNREFUSED 127.0.0.1:3000"
**Problem**: Frontend not running  
**Solution**: Start Vite with `npm run dev` in the main directory

### "ECONNREFUSED 127.0.0.1:3001"
**Problem**: Node.js auth server not running  
**Solution**: Start Node.js server: `cd server && npm start`

### API Gateway shuts down immediately
**Problem**: May be normal (Uvicorn display quirk) or a router import error  
**Solution**: Check router files for syntax errors, test with `python -m pytest`

### Redis unavailable
**Problem**: Redis cache service not running  
**Solution**: Optional - system falls back to local storage. Install Redis if needed:
```powershell
# Download from https://github.com/microsoftarchive/redis/releases
# Or use WSL2: wsl -d Ubuntu apt-get install redis-server
```

## Environment Variables

Create `.env` files in each service:

### server/.env
```
PORT=3001
JWT_SECRET=change-me-must-match-nodejs-jwt-secret
MONGODB_URI=mongodb://127.0.0.1:27017/docmind_identity
DOCUMENT_SERVICE_URL=http://127.0.0.1:3000/documents
REDIS_URL=redis://127.0.0.1:6379
```

### api-gatwat/.env
```
JWT_SECRET=change-me-must-match-nodejs-jwt-secret
NODE_AUTH_URL=http://localhost:3001
OCR_SERVICE_URL=http://localhost:8000
SEARCH_SERVICE_URL=http://localhost:8003
CLASSIFICATION_SERVICE_URL=http://localhost:8002
METADATA_SERVICE_URL=http://localhost:8004
ARCHIVING_SERVICE_URL=http://localhost:3007
```
