# DocMind Platform Pipeline, Fixes, and Next Architecture Steps

Last updated: 2026-06-13

This document explains the current DocMind concept, the microservice pipeline, the main mismatches that were found, what was changed to fix them, and how to extend the system with Keycloak authentication and richer enterprise-admin audit metrics.

## 1. Product Concept

DocMind is a document intelligence platform. The intended user flow is:

1. A user uploads a document from the web dashboard.
2. The original file is archived safely in object storage.
3. OCR extracts text when the file type is supported.
4. Metadata extraction detects people, organizations, places, dates, contact information, IDs, document numbers, keywords, language, and document category.
5. Classification assigns a document type/category.
6. Semantic search indexes the extracted text and metadata.
7. The frontend dashboard shows status, metadata, search results, archive download, failed jobs, and admin controls.

The important rule is that the original file must be preserved even if OCR, classification, metadata extraction, or search indexing fails.

## 2. Current Architecture

The system is split into a frontend, a Node identity/admin server, a FastAPI gateway, and several microservices.

### Frontend

Path:

```text
Docmind-v01/Docmind-v01-main
```

Main responsibilities:

- Landing pages and product pages.
- Login/signup/profile flows.
- User dashboard for upload, browse, semantic search, notifications, and document details.
- Admin dashboard for users, support inbox, failed jobs, system health, storage, and audit-style views.

Key files touched:

```text
src/pages/Support.tsx
src/pages/Dashboard.tsx
src/pages/AdminDashboard.tsx
src/components/DashboardSection.tsx
src/components/SolutionsSection.tsx
src/components/PricingSection.tsx
src/components/FeaturesSection.tsx
src/components/Footer.tsx
src/components/HeroSection.tsx
src/pages/Guide.tsx
```

### Node Identity/Admin Server

Path:

```text
Docmind-v01/Docmind-v01-main/server
```

Main responsibilities:

- Local identity model.
- JWT issuing.
- User/admin management.
- Notifications.
- Support messages.
- Fallback document stats.
- Email/outbox support.

Key file touched:

```text
server/src/server.ts
server/.env
server/package.json
server/package-lock.json
```

### API Gateway

Path:

```text
api-gateway
```

Main responsibilities:

- Browser-facing microservice gateway.
- JWT validation.
- Routing to document, OCR, metadata, classification, search, archive, and Node backend.
- Admin combined stats.
- Reprocess orchestration.

Key files touched:

```text
api-gateway/routers/documents_proxy.py
api-gateway/routers/admin_proxy.py
```

### Document Service

Path:

```text
document-service
```

Main responsibilities:

- Document metadata persistence in MongoDB.
- Tracks document status.
- Receives OCR/classification/search completion messages.
- Admin stats and failed documents.

Key files touched:

```text
document-service/src/admin/admin.service.ts
```

### Archive Service

Path:

```text
archive-service
```

Main responsibilities:

- Stores original files in MinIO/S3-compatible archive storage.
- Downloads original files.
- Tracks archive metadata in MongoDB.

Earlier fix summary:

- Added `mc` CLI storage driver.
- Configured direct archive endpoint.
- Avoided hot/cold copy/delete when hot and cold bucket are the same bucket.

Important storage target:

```text
MC_ENDPOINT=http://docmind-archive.duckdns.org:9010
MINIO_HOT_BUCKET=docmind-archive
MINIO_COLD_BUCKET=docmind-archive
```

### OCR Service

Path:

```text
ocr_microservice9/ocr_service
```

Main responsibilities:

- Converts supported file types into text.
- Publishes OCR text to downstream queues.
- Sends text to metadata extraction.
- Sends text to classification/search flow.

Supported upload flow currently includes:

- PDF
- Images
- WebP
- TXT
- DOC/DOCX
- PPT/PPTX

The quality of metadata depends strongly on OCR quality. If OCR reads `0liver.adamsQexample.com`, the metadata rules can repair some mistakes, but better OCR is still the correct long-term fix.

### Metadata Service

Path:

```text
metadata_service
```

Main responsibilities:

- Extracts structured metadata from OCR text.
- Stores metadata in Qdrant.
- Now also pushes metadata into Elasticsearch semantic search chunks.

Key files touched:

```text
metadata_service/extractor.py
metadata_service/api.py
```

Important logic:

- Deterministic extraction rules were added.
- GLiNER is disabled by default for faster/stable startup.
- Better phone filtering avoids treating IDs/dates/times as phone numbers.
- Better certificate/resume detection.
- Arabic/French/English certificate cases improved.

### Semantic Search Service

Path:

```text
semantic_search_microservice
```

Main responsibilities:

- Indexes extracted text in Elasticsearch.
- Embeds text for vector search.
- Supports semantic, keyword, and hybrid search.
- Now receives metadata updates after extraction.

Key files touched:

```text
semantic_search_microservice/es_client.py
semantic_search_microservice/main.py
semantic_search_microservice/rabbitmq_consumer.py
semantic_search_microservice/Dockerfile
```

Important fixes:

- Metadata shape normalization was added.
- Search scores are normalized to `0..1`.
- Frontend filters search results under 50%.
- Metadata update endpoint was added:

```text
POST /search/metadata/update
```

### Classifier Service

Path:

```text
categoryclass/classifier-service
```

Main responsibilities:

- Classifies document text.
- Publishes category/type to document service and semantic search.

Key files touched:

```text
categoryclass/classifier-service/classifier_engine.py
categoryclass/classifier-service/requirements.txt
```

Important fixes:

- Rule-based overrides were added for obvious document types:
  - Resume
  - Certificate
  - Student Record
  - Invoice
  - Contract
  - Identity
  - Medical
  - Form
- GPU/CUDA PyTorch support is restored in `requirements.txt`.

## 3. Current Processing Pipeline

### Upload Path

Frontend:

```text
Dashboard.tsx -> POST /api/documents/upload
```

Gateway:

```text
api-gateway/routers/documents_proxy.py
```

Flow:

1. Frontend sends file as multipart form data.
2. Gateway reads the file.
3. Gateway checks whether OCR supports the content type.
4. Gateway sends original file to archive service.
5. If OCR-supported, gateway sends file to OCR service.
6. Gateway saves document record in document service with extracted text if available.
7. Document service status becomes:
   - `processed` if extracted text exists.
   - `uploaded` if no text exists.
   - `failed` if a downstream service reports failure.
8. OCR service publishes downstream messages to metadata/classifier/search.
9. Metadata service stores metadata in Qdrant and updates Elasticsearch.
10. Classifier updates category/type.
11. Search service indexes searchable chunks.

### Unsupported Document Types

Before:

- Unsupported file type silently skipped OCR.
- User saw normal success.

Now:

- Gateway returns:

```json
{
  "ocr_supported": false,
  "ocr_applied": false,
  "warning": "Unsupported document type for OCR..."
}
```

- Frontend shows a warning toast.
- Original file is still archived.

### Archive Path

The original file is stored before document metadata is saved. This prevents losing the original when OCR/classification/search fails.

Archive service uses `mc` because direct MinIO SDK/domain behavior was unreliable with the TrueNAS/MinIO endpoint.

### Metadata to Search Path

Before:

- Metadata was stored in Qdrant.
- Elasticsearch chunks often showed:

```json
"keywords": "",
"metadata": {}
```

Reason:

- Search service expected flat fields like `person_name`, `phone`, `registration_number`.
- Metadata service returned nested frontend metadata like `entities.people`, `contact_info.phones`, `document_numbers.registration`.

Now:

- Search service normalizes either shape.
- Metadata service calls:

```text
SEARCH_SERVICE_URL/search/metadata/update
```

Example normalized fields:

```text
entities.people[0] -> person_name
entities.organizations[0] -> organization
contact_info.phones[0] -> phone
contact_info.emails[0] -> email
document_numbers.registration -> registration_number
dates[0] -> date
keywords[] -> keywords text
```

### Search Relevance Path

Before:

- Elasticsearch/vector raw scores were shown as percentages in the frontend.
- A score like `1` or `0.02` did not mean a true 100% or 2%.

Now:

- Search service normalizes scores relative to the best hit in each result set.
- Frontend filters out results below `0.5`.

This means the dashboard displays only documents that are at least 50% as relevant as the best result returned for that query.

## 4. Dashboard Logic Fixes

### Missing Documents Count

Problem:

- Dashboard showed total `18`, processed `16`, and the other two were invisible.

Reason:

- UI only counted:
  - `processed`
  - `processing`
  - `failed`

It did not show:

- `uploaded`
- `reprocessing`
- other pending statuses

Fix:

- Added `Pending` / `Pending Review`.
- `reprocessing` counts with processing.
- Anything not processed/processing/reprocessing/failed counts as pending.

### Document Type Filter

Problem:

- Clicking `Educational (1)` launched a semantic search for the word `educational`.
- Semantic search returned many unrelated documents.

Fix:

- Sidebar document type buttons now filter local loaded documents exactly:

```text
doc.documentType === selectedType
```

Semantic search is still used only when the user types into the search bar.

### Notifications

Upload now gives more honest feedback:

- Uploading
- Uploaded with OCR/indexing started
- Uploaded but OCR unsupported
- Upload failed

### Security Settings

Before:

- Button linked to a route that was not really implemented.

Now:

- Button shows a `Coming soon` toast.

## 5. Admin Dashboard Fixes

### System Health

Before:

- Admin health only showed a few services.

Now:

- Admin health checks:
  - API Gateway
  - Auth API
  - Document Service
  - Archive Service
  - Metadata Service
  - Semantic Search
  - Classifier Service
  - OCR Service
  - Storage

### Support Inbox

Before:

- Support page had fake live chat.
- Support route marked messages as `answered` immediately.

Now:

- Support is email-only.
- Messages are saved as `open`.
- Admin replies manually by email.
- SMTP support was added through Node server environment variables.

### Audit Log

Current implementation:

- A simple admin tab shows user activity from the loaded user directory:
  - user name
  - email
  - role
  - status
  - approval status
  - last login

This is a lightweight audit view, not yet a full event-sourced audit log.

## 6. Landing/Product Copy Cleanup

Removed or softened claims that were not true yet:

- `500+ enterprises`
- `10M+ documents`
- hard-coded `99.7% OCR accuracy`
- `99.9% uptime SLA`
- `Tailored solutions for every industry`
- fake live chat wording

The landing page now focuses on real current workflows:

- OCR
- metadata extraction
- classification
- archive storage
- semantic search
- admin controls

## 7. Docker Desktop Problem and Why It Happens

The recurring Docker Desktop failure is not a normal container bug. It is Docker Desktop's engine/build API getting stuck.

Observed errors:

```text
rpc error: code = Unavailable desc = error reading from server: EOF
request returned 500 Internal Server Error for API route ... dockerDesktopLinuxEngine
Cannot remove Docker Compose application
```

Most likely causes in this project:

1. Multiple huge AI images were building in parallel.
2. OCR had 3 services with the same build context.
3. Classifier had 2 services with the same build context.
4. Semantic search had 2 services with the same build context.
5. CUDA PyTorch and model downloads are very large.
6. BuildKit/Docker Desktop ran out of stable memory/CPU/pipe state.
7. Docker Desktop UI then could not stop/remove the Compose app because the engine API was broken.

### Docker Fixes Added

Duplicate services now share explicit image names:

```yaml
image: soundous-ocr-service:latest
image: soundous-classifier-service:latest
image: soundous-semantic-search-service:latest
```

This lets you build the image once and start multiple containers from it.

Added `.dockerignore` files to avoid sending build junk and caches into image builds.

Added scripts:

```text
scripts/docker-recover.ps1
scripts/docker-build-safe.ps1
```

### Safe Docker Recovery

Use this when Docker Desktop starts returning API 500:

```powershell
cd "C:\Users\ZAKAR\Bureau\CS\Projects For Fun\soundous"
.\scripts\docker-recover.ps1 -Prune
```

If Docker still returns API 500 after that, restart Windows.

### Safe Build

Do not run one giant `docker compose up -d --build` for all services.

Use:

```powershell
.\scripts\docker-build-safe.ps1
```

This script:

- sets `COMPOSE_PARALLEL_LIMIT=1`
- starts infrastructure first
- builds app services
- builds classifier once
- builds semantic search once
- builds OCR once
- then starts all duplicate containers from the shared images

## 8. GPU Classifier Setup

Classifier is configured for GPU:

```yaml
DEVICE: "cuda"
NVIDIA_VISIBLE_DEVICES: all
NVIDIA_DRIVER_CAPABILITIES: compute,utility
gpus: all
```

Classifier requirements use CUDA PyTorch:

```text
--extra-index-url https://download.pytorch.org/whl/cu121
torch==2.2.2+cu121
```

Before relying on GPU, test Docker GPU support:

```powershell
docker run --rm --gpus all nvidia/cuda:12.1.1-base-ubuntu22.04 nvidia-smi
```

If that fails, the classifier cannot use GPU until NVIDIA driver / WSL2 GPU / Docker Desktop GPU runtime is fixed.

## 9. Keycloak Integration Plan

Keycloak should become the external identity provider. The clean approach is:

1. Keycloak owns authentication.
2. DocMind keeps local user/profile/enterprise records.
3. API Gateway validates Keycloak JWTs.
4. Node server either trusts gateway headers or validates Keycloak tokens too.
5. Existing roles map from Keycloak claims into DocMind roles.

### Recommended Keycloak Setup

Create one realm:

```text
docmind
```

Create clients:

```text
docmind-frontend
docmind-api-gateway
docmind-admin
```

Frontend client:

- Type: public
- PKCE enabled
- Redirect URI:

```text
http://localhost:8080/*
```

Gateway/backend clients:

- Type: confidential if they need service-to-service token exchange.

### Claims Needed

DocMind currently expects:

```text
sub
email
role
enterpriseId
```

Keycloak should emit equivalent claims:

```json
{
  "sub": "keycloak-user-id",
  "email": "user@example.com",
  "preferred_username": "user",
  "realm_access": {
    "roles": ["docmind-member"]
  },
  "enterpriseId": "ENT_DEFAULT"
}
```

If `enterpriseId` is not native in Keycloak, add it as:

- User attribute, or
- Group attribute, or
- Client mapper.

Recommended groups:

```text
/enterprises/ENT_DEFAULT/admins
/enterprises/ENT_DEFAULT/members
```

Recommended realm roles:

```text
docmind-admin
docmind-member
enterprise-admin
```

### Frontend Changes

Replace local login with OIDC Authorization Code + PKCE.

Recommended package:

```text
oidc-client-ts
```

Frontend flow:

1. User clicks login.
2. Browser redirects to Keycloak.
3. Keycloak redirects back with code.
4. Frontend exchanges code for tokens.
5. Store access token in memory/session storage.
6. API calls send:

```http
Authorization: Bearer <keycloak_access_token>
```

### API Gateway Changes

Current gateway validates JWT using shared `JWT_SECRET`.

With Keycloak, change validation to JWKS:

```text
KEYCLOAK_ISSUER=http://localhost:8081/realms/docmind
KEYCLOAK_JWKS_URL=http://localhost:8081/realms/docmind/protocol/openid-connect/certs
KEYCLOAK_AUDIENCE=docmind-api-gateway
```

Gateway should:

1. Read bearer token.
2. Fetch/cache JWKS keys.
3. Validate:
   - signature
   - issuer
   - audience
   - expiration
4. Extract:
   - `sub`
   - `email`
   - role
   - enterpriseId
5. Forward headers to services:

```http
X-User-ID
X-User-Email
X-User-Role
X-Enterprise-ID
```

### Node Server Changes

Option A: Gateway-only trust

- Browser calls gateway only.
- Gateway forwards to Node with trusted headers.
- Node does not validate Keycloak token directly.
- Simpler, but gateway must be the only public entry.

Option B: Node validates Keycloak too

- Node also validates Keycloak JWT via JWKS.
- Better if frontend calls Node directly.

Recommended for this project:

- Use Option A long term.
- Make API Gateway the single browser-facing backend.

### User Provisioning

On first login:

1. Gateway extracts token claims.
2. Node `ensureExternalUser` creates local user if not found.
3. Local user stores:

```text
externalProvider=keycloak
externalSubject=<keycloak sub>
email
name
role
enterpriseId
status
approvalStatus
lastLoginAt
```

This preserves admin dashboard, audit, and enterprise ownership logic.

### Migration Steps

1. Add Keycloak container to `docker-compose.yml`.
2. Create realm/client/roles.
3. Add frontend OIDC login.
4. Add gateway JWKS validation.
5. Add local user provisioning in Node.
6. Keep old local login temporarily behind a feature flag:

```text
AUTH_PROVIDER=local|keycloak
```

7. Once stable, disable local password login.

## 10. Enterprise Admin Audit Metrics

You want enterprise admins to see user-level activity:

- how many files each user uploaded
- how many processed
- how many failed
- how many pending/reprocessing
- maybe storage used
- maybe last upload date

### Current Data Source

Document service already stores:

```text
ownerId
enterprise_id
status
size
uploadedAt
processedAt/indexedAt
errorMessage
reprocessCount
```

This is enough to calculate per-user upload metrics.

### Recommended API

Add endpoint in document service:

```text
GET /api/admin/users/document-stats
```

Response:

```json
[
  {
    "userId": "user-id",
    "enterpriseId": "ENT_DEFAULT",
    "totalUploads": 20,
    "processed": 16,
    "failed": 2,
    "pending": 1,
    "reprocessing": 1,
    "storageBytes": 12345678,
    "lastUploadedAt": "2026-06-13T10:00:00Z"
  }
]
```

Mongo aggregation:

```js
[
  { $match: { enterprise_id: enterpriseId } },
  {
    $group: {
      _id: "$ownerId",
      totalUploads: { $sum: 1 },
      processed: { $sum: { $cond: [{ $eq: ["$status", "processed"] }, 1, 0] } },
      failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
      pending: {
        $sum: {
          $cond: [
            { $not: [{ $in: ["$status", ["processed", "failed", "processing", "reprocessing"]] }] },
            1,
            0
          ]
        }
      },
      reprocessing: { $sum: { $cond: [{ $eq: ["$status", "reprocessing"] }, 1, 0] } },
      storageBytes: { $sum: "$size" },
      lastUploadedAt: { $max: "$uploadedAt" }
    }
  }
]
```

### Gateway Endpoint

Expose through API gateway:

```text
GET /api/admin/users/document-stats
```

Gateway forwards:

```http
X-Enterprise-ID
X-User-ID
X-User-Role
```

### Frontend Audit UI

In `AdminDashboard.tsx`, add an audit table:

Columns:

```text
User
Email
Role
Total uploads
Processed
Failed
Pending
Reprocessing
Storage
Last upload
Last login
```

The frontend should merge:

- Node `/api/admin/users`
- Gateway `/api/admin/users/document-stats`

Join key:

```text
user.id === stats.userId
```

### Better Long-Term Audit Log

The metrics above are document counters. A full audit log should also store events:

```text
user.login
user.logout
document.uploaded
document.ocr_completed
document.classified
document.metadata_extracted
document.indexed
document.failed
document.reprocessed
document.deleted
archive.downloaded
admin.user_created
admin.role_changed
admin.user_disabled
support.message_created
```

Recommended schema:

```json
{
  "eventId": "audit_xxx",
  "enterpriseId": "ENT_DEFAULT",
  "actorUserId": "admin-id",
  "targetUserId": "member-id",
  "documentId": "doc-id",
  "eventType": "document.uploaded",
  "severity": "info",
  "message": "User uploaded file invoice.pdf",
  "metadata": {
    "filename": "invoice.pdf",
    "fileSize": 12345,
    "status": "uploaded"
  },
  "createdAt": "2026-06-13T10:00:00Z"
}
```

This can live in:

- Node MongoDB if audit is mostly identity/admin.
- Document service MongoDB if audit is mostly document pipeline.
- A separate audit service later if the platform grows.

Recommended first step:

- Add `AuditEventModel` to Node server.
- Add `POST /api/audit/events` internal endpoint.
- Gateway/document service can call it for important events.
- Admin dashboard reads:

```text
GET /api/admin/audit/events
```

## 11. What Still Needs Work

### OCR Quality

Metadata is now better, but OCR still drives everything. Bad OCR examples:

```text
0liver.adamsQexample.com
03/2o22
جامعةبسكرة without spacing
```

The metadata rules can repair some cases, but the correct fix is OCR improvement.

### Search Existing Old Documents

Metadata-to-search updates now work for new extractions. Old Elasticsearch chunks that already have empty metadata will need reindex or metadata re-push.

Options:

1. Reprocess documents.
2. Add an admin endpoint to re-sync metadata from Qdrant/document service into Elasticsearch.
3. Delete Elasticsearch index and re-run indexing pipeline.

### Full Reprocess Flow

Current improvement:

- Admin reprocess tries to pull archived original and OCR it again.

Long-term ideal:

- Reprocess should publish a proper pipeline job:
  - archive download
  - OCR
  - metadata
  - classification
  - search
  - document status transitions
  - audit events

### Docker Stability

The safe build scripts reduce the chance of Docker Desktop wedging, but Docker Desktop can still break under very heavy builds. For a more stable future:

- Use a Linux Docker host for builds.
- Or use WSL Ubuntu Docker Engine directly.
- Or build heavy AI images once and push them to a registry.
- Avoid `docker compose up -d --build` for all services at once.

## 12. Recommended Next Implementation Order

1. Stabilize Docker with safe scripts and shared images.
2. Confirm GPU classifier with `nvidia-smi` container test.
3. Add user document metrics endpoint in document service.
4. Merge user metrics into admin audit table.
5. Add full audit event model.
6. Add Keycloak behind feature flag.
7. Reindex old documents so search has metadata.
8. Improve OCR model/preprocessing.

