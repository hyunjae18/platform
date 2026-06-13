# GLiNER Metadata Extraction - PowerShell + Real OCR Format Support

## What Changed

### 1. PowerShell Support
Your previous error was because you ran **bash** commands in **PowerShell**.

**Wrong (bash syntax in PowerShell):**
```powershell
TOKENS=$(curl -s -X POST ...)   # FAILS
```

**Correct (PowerShell native):**
```powershell
$TOKENS = Invoke-RestMethod -Uri "http://localhost:8004/token" -Method POST -ContentType "application/json" -Body '{"service_name":"doc-processor"}'
$ACCESS = $TOKENS.access_token
```

### 2. OCR Format Support
Your real OCR output has this structure:
```json
{
  "ocr_result": {
    "raw_text": "...",
    "lines": [{"text": "...", "confidence": 0.98}]
  }
}
```

My old code expected:
```json
{
  "pages": [{"blocks": [{"text": "..."}]}]
}
```

**Now both formats work.** The extractor auto-detects the format.

---

## Quick Start (PowerShell)

### 1. Start services
```powershell
cd gliner_jwt_powershell
docker compose up --build -d
```

### 2. Wait for model download (~1-2 minutes)
```powershell
# Watch logs
docker logs -f gliner-extractor

# Or wait 60 seconds
Start-Sleep -Seconds 60
```

### 3. Test health
```powershell
Invoke-RestMethod -Uri "http://localhost:8004/health" -Method GET
```

### 4. Get tokens
```powershell
$TOKENS = Invoke-RestMethod -Uri "http://localhost:8004/token" -Method POST `
  -ContentType "application/json" `
  -Body '{"service_name": "doc-processor"}'

$ACCESS = $TOKENS.access_token
$REFRESH = $TOKENS.refresh_token

Write-Host "Access token: $ACCESS"
```

### 5. Extract metadata (with your real OCR format)

Create a file `test_ocr.json` with your actual OCR output, then:

```powershell
$BODY = Get-Content -Raw -Path "test_ocr.json"

$HEADERS = @{
    "Authorization" = "Bearer $ACCESS"
    "Content-Type" = "application/json"
}

$RESULT = Invoke-RestMethod -Uri "http://localhost:8004/extract" -Method POST `
  -Headers $HEADERS -Body $BODY

$RESULT | ConvertTo-Json -Depth 10
```

### 6. Refresh token
```powershell
$REFRESH_BODY = '{"refresh_token": "' + $REFRESH + '"}'
$NEW_TOKENS = Invoke-RestMethod -Uri "http://localhost:8004/refresh" -Method POST `
  -ContentType "application/json" -Body $REFRESH_BODY

$NEW_ACCESS = $NEW_TOKENS.access_token
```

---

## Using curl.exe (Windows has curl too)

If you prefer curl, use `curl.exe` (not `curl` which is PowerShell alias):

```powershell
# Get token
curl.exe -s -X POST http://localhost:8004/token `
  -H "Content-Type: application/json" `
  -d '{"service_name":"doc-processor"}'

# Extract (save OCR to file first)
curl.exe -s -X POST http://localhost:8004/extract `
  -H "Authorization: Bearer $ACCESS" `
  -H "Content-Type: application/json" `
  -d @test_ocr.json
```

---

## Test with Your Real Document (Certificat de Vie)

Save this as `certificat_vie.json`:

```json
{
  "document_id": "cert-vie-2024-001",
  "ocr_result": {
    "raw_text": "CERTIFICAT DE VIE\nشهادة الحياة\nNous, soussignés :\nCertifions que M/Mme\nTASSADIT MOUHOUBI\nNé(e) le : 12/10/1944\nRésidant à : PK 17 06000 BEJAIA RP ALGERIE\nEst vivant(e) pour s'être présenté(e) aujourd'hui devant nous\nIKHLEF. M\nP/LE Président des Assemblées\nRépublique Algérienne",
    "languages_detected": ["fr", "ar"]
  }
}
```

Then run:
```powershell
$BODY = Get-Content -Raw -Path "certificat_vie.json"
$RESULT = Invoke-RestMethod -Uri "http://localhost:8004/extract" -Method POST `
  -Headers @{Authorization="Bearer $ACCESS"; "Content-Type"="application/json"} `
  -Body $BODY
$RESULT | ConvertTo-Json -Depth 10
```

---

## Files

| File | Purpose |
|------|---------|
| `extractor.py` | **Fixed**: Handles both OCR formats (pages/blocks AND raw_text/lines) |
| `security.py` | JWT auth |
| `qdrant.py` | Vector DB |
| `test.py` | Pytest suite |
| `Dockerfile` | Fixed build |
| `docker-compose.yml` | App + Qdrant |
| `README.md` | This file |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| PowerShell says `curl` is not recognized | Use `Invoke-RestMethod` or `curl.exe` |
| `The term 'TOKENS=$' is not recognized` | You ran bash syntax in PowerShell. Use `$VAR = ...` |
| Container not starting | Run `docker logs gliner-extractor` to see the error |
| Model download timeout | Pre-download: `python -c "from gliner import GLiNER; GLiNER.from_pretrained('urchade/gliner_multi-v2.1')"` |
| OCR format not recognized | The code now auto-detects. If still failing, paste your JSON and I'll adapt |
