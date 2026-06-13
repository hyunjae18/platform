# Microservices Integration Guide

This guide explains how to connect your existing DocMind app with these microservices:

- `document-and-metadata-extraction-microservices`
- `alfresco-integration-microservice`
- `archive-microservice`

It is written for the current DocMind structure in this repo:

- Frontend: Vite/React on `http://localhost:5173`
- Browser-facing API gateway: FastAPI on `http://localhost:8001`
- Identity/workflow backend: Express on `http://localhost:3001`
- MongoDB for users/admin
- Optional Redis cache

## Goal

Use `api-gateway/main.py` as the browser-facing gateway and `server/src/server.ts` for identity, profile, workflows, notifications, and admin user state.

Recommended architecture:

1. Frontend calls the FastAPI gateway only.
2. The gateway validates JWTs and routes requests to the correct service.
3. The Node backend owns identity/admin user state, while document work goes to:
   - extraction service
   - Alfresco service
   - archive service

This keeps tokens, roles, approval flow, and admin policy in one place.

## Suggested topology

Use these service roles:

- `docmind-frontend`: React UI
- `api-gateway`: main browser-facing API gateway
- `docmind-backend`: Node identity/workflow service
- `docmind-mongo`: user/admin database
- `docmind-redis`: optional cache
- `extraction-service`: OCR, text extraction, metadata extraction
- `alfresco-service`: Alfresco upload/search/folder/document actions
- `archive-service`: archive/retention/archive retrieval actions

## Before you start

Make sure you already have these working on your machine:

- Docker Desktop or Docker Engine
- MongoDB
- The three microservice repos cloned locally
- Their `.env` files or docker configuration ready

## Recommended local folder layout

Example:

```text
projects/
  Docmind-v01-main/
  document-and-metadata-extraction-microservices/
  alfresco-integration-microservice/
  archive-microservice/
```

This is not required, but it makes Docker and path mapping easier.

## Step 1: Decide the ports

Choose fixed ports and keep them stable.

Recommended example:

```text
DocMind frontend      5173
API gateway           8001
Node identity service 3001
MongoDB               27017
Redis                 6379
Document service      3000
Archive service       3007
```

If your existing microservices already use different ports, keep those and just update the DocMind backend env.

## Step 2: Add backend environment variables

Update `server/.env` in this repo.

Example:

```env
PORT=3001
JWT_SECRET=docmind-secure-jwt-key-2024
MONGODB_URI=mongodb://127.0.0.1:27017/docmind_identity
ADMIN_EMAIL=admin@docmind.local
ADMIN_PASSWORD=Admin123!
NAS_PATH=/mnt/sda2/Docmind-v01-main

REDIS_URL=redis://127.0.0.1:6379

API_GATEWAY_URL=http://127.0.0.1:8001
```

## Step 3: Put all services on the same Docker network

If you are running the services with Docker, create one shared network:

```bash
docker network create docmind-net
```

Then attach every container to `docmind-net`.

If all services are in one `docker-compose.yml`, define:

```yaml
networks:
  docmind-net:
    driver: bridge
```

and attach every service to that network.

## Step 4: Start infrastructure first

Start the dependencies first:

1. MongoDB
2. Redis
3. Alfresco itself, if your Alfresco microservice depends on a live Alfresco server

Example:

```bash
docker ps
docker network ls
```

Confirm Mongo and Redis are reachable before starting DocMind.

## Step 5: Start the three microservices

Start each microservice and confirm the health route or base route responds.

What to verify for each one:

### Extraction service

It should accept document/text input and return extracted text and metadata.

Minimum things to confirm:

- port is exposed
- OCR dependencies are installed
- request body format is known
- success response shape is known

### Alfresco service

It should be able to:

- authenticate to Alfresco
- upload documents
- create folders if needed
- fetch document metadata or node info

### Archive service

It should be able to:

- archive a document
- move/store it in archive storage
- return archive status
- restore or fetch archive records if that feature exists

## Step 6: Verify each service manually before connecting DocMind

Do not wire everything at once.

Test each service directly first with Postman, curl, or Swagger.

Examples:

```bash
curl http://127.0.0.1:3001
curl http://127.0.0.1:3002
curl http://127.0.0.1:3003
curl http://127.0.0.1:8001/api/health
```

If a service does not answer directly, fix that service first before trying gateway integration.

## Step 7: Make DocMind backend the only public API for the frontend

This is the most important rule.

The frontend should not call the three microservices directly.

Instead:

- frontend -> DocMind backend
- DocMind backend -> microservices

Why:

- one place for auth
- one place for role checking
- easier debugging
- no CORS mess between frontend and many services
- easier future deployment

## Step 8: Integration points inside DocMind backend

Your current gateway file is:

- [server.ts](/mnt/sda2/Docmind-v01-main/src/backend/src/server.ts:1)

These are the recommended wiring points.

### A. Extraction service

Current relevant route:

- [server.ts](/mnt/sda2/Docmind-v01-main/src/backend/src/server.ts:708)

Recommended change:

- replace the current local Python extraction route with a forwarding call to `EXTRACTION_SERVICE_URL`
- or keep Python as fallback and prefer the external extraction microservice first

Recommended gateway route:

```text
POST /api/extraction/process
```

Possible flow:

1. frontend uploads file to DocMind backend
2. DocMind backend forwards file/text to extraction service
3. extraction service returns text, metadata, confidence, category
4. DocMind backend stores or forwards final result to frontend

### B. Alfresco service

Recommended gateway routes:

```text
POST /api/alfresco/upload
POST /api/alfresco/folders
GET  /api/alfresco/documents/:id
GET  /api/alfresco/search
```

Possible flow:

1. user uploads document
2. DocMind backend validates auth
3. DocMind backend sends binary or file path plus metadata to Alfresco microservice
4. Alfresco microservice stores it in Alfresco
5. Alfresco node id is returned
6. DocMind backend stores returned external id in its own document record

### C. Archive service

Recommended gateway routes:

```text
POST /api/archive
POST /api/archive/:id/restore
GET  /api/archive/:id/status
GET  /api/archive/search
```

Possible flow:

1. admin or workflow action requests archive
2. DocMind backend validates role
3. DocMind backend sends document id, metadata, and storage reference to archive service
4. archive service stores or marks the item as archived
5. returned archive id/status is saved by DocMind backend

## Step 9: Standardize the payload contract

Before coding the gateway calls, write down the exact request and response contracts.

For each service, define:

- base URL
- route path
- method
- headers
- auth mechanism
- request body
- success response
- error response

Use one table like this for each service:

```text
Service: Extraction
Route: POST /extract
Input: multipart/form-data or JSON
Output: { text, metadata, category, confidence }
Timeout: 60s
```

This avoids the usual “service is up but payload shape is wrong” problem.

## Step 10: Decide timeouts and retries

Recommended defaults:

- extraction: 60-120 seconds
- Alfresco: 30-60 seconds
- archive: 30-60 seconds

Recommended behavior:

- no retry for non-idempotent writes unless you use request ids
- limited retry for network timeout on safe reads
- clear error message back to frontend

## Step 11: Add health checks to the admin dashboard

Your admin dashboard already has service health cards.

Current relevant admin stats/service section:

- [server.ts](/mnt/sda2/Docmind-v01-main/src/backend/src/server.ts:479)

Extend it so the backend pings:

- extraction service
- Alfresco service
- archive service

Recommended health checks:

```text
GET /health
GET /status
GET /ping
```

If your microservices do not already expose one of these, add a simple `/health` route to each.

Then show:

- `online`
- `degraded`
- `offline`

inside the admin dashboard.

## Step 12: Logging

Use correlation-friendly logs.

For every request from DocMind backend to a microservice, log:

- route called
- target service
- document id
- user id
- response status
- duration

This will save a lot of time once multiple services are involved.

## Step 13: Recommended connection order

Do the integrations in this order:

1. Extraction service
2. Alfresco service
3. Archive service
4. Admin health integration

Reason:

- extraction is already conceptually present in this app
- Alfresco usually depends on validated upload flow
- archive is easier once document identity is stable

## Step 14: End-to-end test checklist

### Extraction

1. Login as approved user
2. Upload a document
3. Confirm DocMind backend receives it
4. Confirm extraction microservice receives it
5. Confirm extracted text/metadata come back
6. Confirm UI shows the extracted result

### Alfresco

1. Upload processed document
2. Store in Alfresco through gateway
3. Confirm Alfresco node id is returned
4. Confirm document can be retrieved from Alfresco

### Archive

1. Archive a document from admin or workflow
2. Confirm archive service receives the request
3. Confirm archive status is returned and stored
4. Confirm restore works if supported

### Admin dashboard

1. Open `/admin`
2. Confirm service health cards reflect extraction, Alfresco, and archive
3. Stop one microservice
4. Refresh admin dashboard
5. Confirm health state changes to degraded or offline

## Step 15: Common failure points

### Service starts but DocMind cannot reach it

Check:

- wrong port
- wrong hostname
- container not on same Docker network
- service bound to `localhost` instead of `0.0.0.0`

### Works in Postman but not from DocMind

Check:

- incorrect payload shape
- missing headers
- authentication between services
- multipart form field names

### Admin dashboard still shows green while service is dead

Check:

- you are not actually pinging the service from backend
- the status card is using static values

### User flow breaks during upload

Check:

- frontend is still calling the microservice directly
- backend route is not proxying correctly
- upload timeout too short

## Step 16: What I recommend you change next in this repo

These are the practical next steps inside DocMind:

1. Add the service URLs to `server/.env` and `api-gateway/.env`
2. Add a small HTTP client layer in backend for external services
3. Replace the local extraction route with service forwarding
4. Add new `/api/alfresco/*` routes
5. Add new `/api/archive/*` routes
6. Add real service ping checks into `/api/admin/stats`
7. Keep frontend talking only to the gateway

## Example backend env for full setup

```env
PORT=3001
JWT_SECRET=docmind-secure-jwt-key-2024
MONGODB_URI=mongodb://127.0.0.1:27017/docmind_identity
ADMIN_EMAIL=admin@docmind.local
ADMIN_PASSWORD=Admin123!
NAS_PATH=/mnt/sda2/Docmind-v01-main
REDIS_URL=redis://127.0.0.1:6379

API_GATEWAY_URL=http://127.0.0.1:8001
```

## Important note

This guide is accurate for integrating those services into the current DocMind repo structure, but I did not inspect the internal routes of your three local microservice repos from this workspace. That means:

- the architecture and connection steps here are solid
- the exact route names, payloads, and auth headers for those three services still need to be matched to the code inside those repos

Once you want, the next best step is for me to wire the backend gateway code for real. For that, point me to the local folders of those three microservice repos or paste their route files and docker compose files.
