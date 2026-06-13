# DocMind Platform

DocMind is a document intelligence platform for uploading, archiving, processing, classifying, searching, and managing enterprise documents.

The project is built as a microservice system:

- React/Vite frontend for users and admins.
- Node identity/admin server for the current local auth flow.
- FastAPI API gateway for routing frontend calls to microservices.
- NestJS document and archive services.
- OCR, metadata extraction, classification, and semantic search services.
- MongoDB, RabbitMQ, Elasticsearch, Qdrant, and MinIO-compatible object storage.
- Optional Keycloak-based external authentication adapter.

For detailed implementation notes and history, see [DOCMIND_PIPELINE_AND_CHANGES.md](DOCMIND_PIPELINE_AND_CHANGES.md).

## Repository Layout

```text
.
├── Docmind-v01/Docmind-v01-main/     # Frontend and local Node identity/admin server
├── api-gateway/                      # FastAPI gateway
├── document-service/                 # NestJS document upload/status service
├── archive-service/                  # NestJS archive service using MinIO/mc storage
├── metadata_service/                 # Metadata extraction and Qdrant indexing
├── categoryclass/classifier-service/ # Document classification service
├── ocr_microservice9/ocr_service/    # OCR service
├── semantic_search_microservice/     # Elasticsearch semantic search service
├── external-auth-service/            # Optional NestJS Keycloak adapter
├── scripts/                          # Docker recovery/build helper scripts
├── docker-compose.yml                # Main Docker stack
└── docker-compose.external-auth.yml  # Optional auth override for Keycloak adapter
```

## Main Pipeline

1. A user uploads a document from the frontend dashboard.
2. The API gateway forwards the request to the document service.
3. The document service archives the original file through the archive service.
4. The archive service stores the original file in MinIO-compatible object storage.
5. RabbitMQ events trigger OCR, classification, metadata extraction, and search indexing.
6. OCR extracts text from supported files.
7. Metadata extraction detects dates, people, organizations, places, contacts, IDs, keywords, language, and document type.
8. Classification assigns a category.
9. Semantic search indexes extracted text and metadata in Elasticsearch.
10. Admin/user dashboards show document state, processed/failed counts, search results, metadata, notifications, and health information.

The important design rule is: the original file should be archived before the AI pipeline runs, so failed OCR or classification does not lose the document.

## Services

| Service | Default Port | Purpose |
| --- | ---: | --- |
| Frontend | 8080 | React/Vite user interface |
| Node identity/admin server | 3001 | Current local auth, users, support, notifications |
| API gateway | 8001 | Frontend API entrypoint |
| Document service | 3000 | Uploads, document records, statuses |
| Archive service | 3007 | Original file archive, restore, download |
| OCR services | 8000 internal | OCR workers |
| Classifier services | 8002 internal | Document classification |
| Metadata service | 8004 | Metadata extraction and Qdrant indexing |
| Semantic search services | 8003 internal | Elasticsearch indexing/search |
| MongoDB | 27017 | Service databases |
| RabbitMQ | 5672 / 15672 | Event queue and management UI |
| Elasticsearch | 9200 | Search index |
| Qdrant | 6333 | Metadata vector store |
| Local MinIO | 9000 / 9001 | Local object storage |
| Keycloak optional | 8081 | External auth admin UI |
| External auth adapter optional | 3010 | Keycloak-to-DocMind auth bridge |

## Prerequisites

- Docker Desktop or Docker Engine.
- Node.js 20+ for local frontend/backend development.
- Python dependencies are installed inside service containers.
- Git.
- Optional: NVIDIA GPU support for GPU-backed classifier/OCR containers.

## Environment Files

Local `.env` files are intentionally ignored by Git.

You need local env files for services that require secrets or local endpoints, especially:

```text
archive-service/.env
api-gateway/.env
Docmind-v01/Docmind-v01-main/server/.env
categoryclass/classifier-service/.env
ocr_microservice9/ocr_service/.env
```

Do not commit real secrets, Gmail app passwords, MinIO credentials, or production tokens.

## Docker Run

From the repository root:

```powershell
cd "C:\Users\ZAKAR\Bureau\CS\Projects For Fun\soundous"
docker compose up -d
```

To rebuild one service:

```powershell
docker compose up -d --build archive-service
```

To rebuild the full stack:

```powershell
docker compose up -d --build
```

For safer heavy builds on Docker Desktop, use:

```powershell
.\scripts\docker-build-safe.ps1
```

For Docker Desktop recovery:

```powershell
.\scripts\docker-recover.ps1
```

## Frontend

Path:

```text
Docmind-v01/Docmind-v01-main
```

Typical local run:

```powershell
cd Docmind-v01/Docmind-v01-main
npm install
npm run dev
```

The frontend normally talks to the API gateway at:

```text
http://localhost:8001
```

## Current Authentication

The default auth flow uses the Node identity/admin server:

```text
Docmind-v01/Docmind-v01-main/server
```

The API gateway proxies auth requests to this service through `NODE_AUTH_URL`.

Main routes:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
GET  /api/auth/validate
POST /api/auth/request-password-reset
POST /api/auth/reset-password
```

## Optional Keycloak Authentication

An optional Keycloak proof-of-concept exists in:

```text
external-auth-service/
```

It keeps the same DocMind auth routes, authenticates users through Keycloak, then issues a DocMind-compatible JWT for the existing gateway.

The adapter also mirrors Keycloak user profiles into MongoDB `docmind_identity.users` on register/login. Passwords stay in Keycloak; MongoDB only stores readable platform metadata such as role, status, approval state, enterprise id, and `keycloakId`.

Start only Keycloak and the adapter:

```powershell
docker compose --profile external-auth up -d keycloak-postgres keycloak external-auth-service
```

Run the full stack using the Keycloak adapter:

```powershell
$env:DOCMIND_SMTP_PASS="your-gmail-app-password"
docker compose -f docker-compose.yml -f docker-compose.external-auth.yml --profile external-auth up -d --build
```

Keycloak admin UI:

```text
http://localhost:8081
```

More details: [external-auth-service/README.md](external-auth-service/README.md).

## Archive Storage

The archive service supports MinIO-compatible object storage.

The current reliable path uses the MinIO `mc` client inside the archive service container. This was added because direct SDK uploads were not consistently reaching the TrueNAS MinIO/S3 endpoint.

Important archive variables:

```text
ARCHIVE_STORAGE_DRIVER=mc
MC_ALIAS=docmind
MC_ENDPOINT=http://docmind-archive.duckdns.org:9010
MINIO_HOT_BUCKET=docmind-archive
MINIO_COLD_BUCKET=docmind-archive
```

If `ping docmind-archive.duckdns.org` fails, that does not automatically mean archive is broken. Ping uses ICMP and can be blocked. What matters is TCP connectivity to the MinIO port:

```powershell
Test-NetConnection docmind-archive.duckdns.org -Port 9010
```

## Useful Checks

Show running containers:

```powershell
docker ps
```

Show service logs:

```powershell
docker compose logs --tail 100 api-gateway
docker compose logs --tail 100 document-service
docker compose logs --tail 100 archive-service
docker compose logs --tail 100 metadata-service-1
```

Check API gateway:

```text
http://localhost:8001/health
```

RabbitMQ UI:

```text
http://localhost:15672
```

Local MinIO UI:

```text
http://localhost:9001
```

Elasticsearch:

```text
http://localhost:9200
```

Qdrant:

```text
http://localhost:6333
```

## Git Notes

The root `.gitignore` excludes:

- `.env` files.
- `node_modules`.
- `dist` and build output.
- Python caches.
- local Docker/data folders.
- `mc.exe`.
- large model weights such as `.safetensors`.

This keeps the repository uploadable and avoids committing local secrets or generated artifacts.

## Known Limitations

- Existing local Mongo users are not automatically migrated to Keycloak.
- Some OCR/model files are still large and may be better moved to external model storage later.
- Existing old Elasticsearch documents may need reindexing to receive improved metadata.
- The full reprocess flow exists conceptually, but should be expanded into a complete archive-download-to-pipeline retry workflow.
- Production deployment should replace development credentials in Compose with real secrets management.

## Recommended Next Steps

1. Add `.env.example` files for each service.
2. Move large OCR/classifier models to external storage or Git LFS.
3. Add a full audit log model and admin audit view.
4. Add a proper failed-document reprocess workflow.
5. Decide whether to keep local auth or fully migrate to Keycloak.
6. Reindex old documents after metadata/search improvements.
