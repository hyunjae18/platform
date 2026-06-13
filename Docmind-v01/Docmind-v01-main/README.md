# DocMind Runtime Guide

## What changed

This project is now wired as a real frontend-to-gateway-to-service flow instead of reading mostly static local JSON.
It also has a local fallback mode so the app still works when the API gateway or document microservice is not running.

- `src/lib/api.ts`
  Uses `VITE_API_GATEWAY_URL`, defaults to `http://localhost:8001`, and sends requests under `/api`.
- `server/src/server.ts`
  Acts as the identity, profile, workflow, admin, password-reset, metadata-extraction, and local fallback service.
- `../../api-gateway/main.py`
  Proxies frontend API traffic to the right backend service.
- `../../document-service`
  Stores uploaded document metadata in MongoDB and exposes live document endpoints.
- `../../archive-service`
  Stores original uploaded files in MinIO hot storage, then moves them to cold storage when archived.

## Service layout

- Frontend: `Docmind-v01-main` on Vite's dev port, usually `http://localhost:5173`
- API gateway: `api-gateway` on `http://localhost:8001`
- Identity/workflow service: `Docmind-v01-main/server` on `http://localhost:3001`
- Document service: `document-service` on `http://localhost:3000`
- Archive service: `archive-service` on `http://localhost:3007`
- MinIO: API on `http://localhost:9000`, console on `http://localhost:9001`
- Metadata extraction: `POST /api/metadata/extract` or `POST /api/extract` through the gateway
- Semantic search: Qdrant-backed search service on `http://localhost:8003`

## Mongo databases

Each service now has its own Mongo database name:

- Identity/auth/workflows: `docmind_identity`
- Documents: `docmind_documents`
- Archive service: `docmind_archive`
- Metadata extraction: Qdrant, not MongoDB

If you use a single Mongo server, keep the same host and only change the database name in each URI.

## Main features now wired

- Login and registration use live Mongo-backed users.
- Admin users now land in `/admin` and normal users land in `/dashboard`.
- Dashboard document list loads from the document microservice.
- Dashboard upload sends files through the API gateway, runs OCR when supported, stores the original file in archive hot storage, then saves metadata in the document service.
- If the document microservice is offline, uploads and document listing fall back to the backend Mongo collection so the UI still works.
- Workflow test page uses live workflow endpoints.
- Forgot-password creates reset tokens and prepares a real reset link.
- Reset-password page submits the new password to the backend.
- Support page now saves support requests, creates confirmation email/outbox messages, and exposes a live chat style flow.
- Platform notifications are available through `/api/notifications` and shown from the dashboard bell menu.
- Terms, privacy, settings, and workflow pages now exist so the routes are no longer broken.

## How to run locally

### Option 1: Docker compose

From the repo root:

```bash
docker-compose up --build
```

Important ports:

- Frontend: run manually with Vite, usually `5173`
- Gateway: `8001`
- Identity service: `3001` if you run the Node service locally beside compose
- Document service: `3000`
- Archive service: `3007`
- MinIO API/console: `9000` / `9001`
- MongoDB: `27017`
- Qdrant: `6333`

### Option 2: Run services manually

### Smallest working setup

If you want the fastest local setup with the fewest moving pieces:

1. Start MongoDB
2. Start the backend on `3001`
3. Set `VITE_API_GATEWAY_URL=http://localhost:3001` for the frontend fallback mode
4. Start the frontend with Vite

That is enough for:

- login
- signup
- dashboard
- upload
- local search fallback
- forgot password
- workflow test
- notifications
- support form and live chat storage

The document microservice, gateway, Qdrant, and semantic search service become optional in that mode.

### Full manual setup

1. Start MongoDB.
2. Start Qdrant if you want semantic search.
3. Start the identity/workflow backend:

```bash
cd Docmind-v01/Docmind-v01-main/server
npm install
npm run dev
```

4. Start the document service:

```bash
cd document-service
npm install
npm run start:dev
```

5. Start the API gateway:

```bash
cd api-gateway
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

6. Start the frontend:

```bash
cd Docmind-v01/Docmind-v01-main
npm install
npm run dev
```

## Environment variables

### Frontend

Create `Docmind-v01-main/.env` if you want an explicit API base:

```env
VITE_API_GATEWAY_URL=http://localhost:8001
```

### Identity/workflow backend

Create `Docmind-v01-main/server/.env`:

```env
PORT=3001
MONGODB_URI=mongodb://127.0.0.1:27017/docmind_identity
API_GATEWAY_URL=http://localhost:8001
APP_BASE_URL=http://localhost:5173
JWT_SECRET=docmind-secure-jwt-key-2024
REDIS_URL=redis://127.0.0.1:6379
ADMIN_EMAIL=admin@docmind.local
ADMIN_PASSWORD=Admin123!
EMAIL_FROM=noreply@docmind.local
```

### Document service

Create `document-service/.env`:

```env
MONGO_URI=mongodb://127.0.0.1:27017/docmind_documents
RABBITMQ_URL=amqp://127.0.0.1:5672
PORT=3000
```

### API gateway

Create `api-gateway/.env`:

```env
JWT_SECRET=docmind-secure-jwt-key-2024
ALGORITHM=HS256
NODE_AUTH_URL=http://127.0.0.1:3001
DOCUMENT_SERVICE_URLS=["http://127.0.0.1:3000"]
ARCHIVE_SERVICE_URLS=["http://127.0.0.1:3007"]
OCR_SERVICE_URLS=["http://127.0.0.1:8000"]
SEARCH_SERVICE_URLS=["http://127.0.0.1:8003"]
METADATA_SERVICE_URLS=["http://127.0.0.1:8004"]
```

## Email reset / verification setup

The forgot-password flow is live now, but real delivery depends on how you want to send email.

### Current default behavior

If you do nothing, reset emails are written to:

```text
Docmind-v01-main/server/src/data/email-outbox.json
```

That gives you a working local dev flow without blocking on SMTP.

### What to change for real email sending

Set this in `Docmind-v01-main/server/.env`:

```env
EMAIL_WEBHOOK_URL=https://your-mail-service-endpoint
```

The backend will `POST` this JSON payload:

```json
{
  "id": "email_xxx",
  "from": "noreply@docmind.local",
  "to": "user@example.com",
  "subject": "DocMind password reset",
  "text": "plain text body",
  "html": "<p>html body</p>",
  "resetUrl": "http://localhost:8080/reset-password?token=..."
}
```

You can point that webhook to:

- your own SMTP bridge
- a small Nodemailer service
- SendGrid/Mailgun/Resend wrapper
- any internal company notification service

If you prefer SMTP directly inside this backend later, the easiest place to swap the logic is the `sendEmailNotification()` function in `src/backend/src/server.ts`.

## New frontend routes

- `/forgot-password`
- `/reset-password`
- `/settings`
- `/workflows`
- `/support`
- `/terms`
- `/privacy`
- `/free-trial`

## Notes

- Uploads now go through the gateway's document route; the original file is archived to MinIO hot storage before document metadata is saved.
- The document service now keeps working even if RabbitMQ is down. Uploads still save to Mongo, and queue publishing is skipped with a warning.
- The metadata extraction flow still uses Qdrant and the existing Python path for semantic analysis.
- The admin dashboard stats now read document counts from the document microservice instead of local fake files.
- The backend has local document storage fallback so `login`, `signup`, `upload`, and `search` are not blocked by the document microservice being offline.
- PDF processing in the free-trial page now keeps going even when browser OCR is limited. The page still uploads the PDF, builds a fallback text preview when needed, and shows the metadata JSON result panel.
- RabbitMQ visibility is logged in the document service and metadata consumer terminals with explicit publish/receive messages.
