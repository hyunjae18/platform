# OCR Microservice — Arabic / French / English

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   OCR Microservice                       │
│                  (FastAPI + EasyOCR)                     │
│                                                         │
│  POST /ocr/extract  ──► EasyOCR (AR + FR + EN)         │
│                           │                             │
│                    Structured Output                    │
│               { line_1: text, confidence }              │
└──────────────┬──────────────────────┬───────────────────┘
               │                      │
        RabbitMQ Publisher      FastAPI HTTP Client
               │                      │
               ▼                      ▼
   ┌──────────────────┐    ┌─────────────────────────┐
   │ metadata-service │    │   classifier-service     │
   │  (queue consumer)│    │  POST /classify/document │
   └──────────────────┘    └─────────────────────────┘
```

## Services

| Service | Port | Description |
|---|---|---|
| ocr-service | 8000 | Main OCR extraction API |
| metadata-service | 8001 | Receives OCR results via RabbitMQ |
| classifier-service | 8002 | Classifies documents by type & category |
| RabbitMQ | 5672 / 15672 | Message broker |

## Quick Start

```bash
docker-compose up --build
```

## API Usage

```bash
curl -X POST http://localhost:8000/ocr/extract \
  -F "file=@document.pdf" \
  -F "language=ar+fr+en"
```
