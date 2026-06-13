# metadata-service/api.py
import os
import uvicorn
import json
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
from qdrant import QdrantStore
from extractor import GLiNERExtractor
from security import create_access_token, create_refresh_token, verify_refresh_token

app = FastAPI(title="Metadata Extraction API")

# Initialize GLiNER
extractor = GLiNERExtractor(
    model_name=os.getenv("GLINER_MODEL", "urchade/gliner_multi-v2.1"),
    device=os.getenv("DEVICE", "cpu")
)

# Qdrant store
qdrant_store = QdrantStore(
    host=os.getenv("QDRANT_HOST", "qdrant"),
    port=int(os.getenv("QDRANT_PORT", "6333"))
)

# Expected request model (matches frontend)
class ExtractRequest(BaseModel):
    text: str
    docId: Optional[str] = None

def transform_to_frontend_metadata(extracted: Dict[str, Any]) -> Dict[str, Any]:
    entities = {"people": [], "places": [], "organizations": []}
    custom = extracted.get("custom_fields", {})
    
    # 1. Map Places & Organizations
    if extracted.get("organization_name"):
        entities["organizations"].append(extracted["organization_name"])
    if extracted.get("city"):
        entities["places"].append(extracted["city"])
    if extracted.get("country"):
        entities["places"].append(extracted["country"])
    if extracted.get("address"):
        entities["places"].append(extracted["address"])

    # 2. Map People (using the new all_people array from extractor)
    if custom.get("all_people"):
        entities["people"].extend(custom["all_people"])
    elif extracted.get("person_name"):
        entities["people"].append(extracted["person_name"])
        
    if custom.get("student_name"):
        entities["people"].extend(custom["student_name"])

    # Deduplicate entities
    entities["people"] = list(set(filter(None, entities["people"])))
    entities["places"] = list(set(filter(None, entities["places"])))
    entities["organizations"] = list(set(filter(None, entities["organizations"])))

    # 3. Map Contact Info (using the new regex-cleaned all_phones)
    contact_info = {"emails": [], "phones": []}
    if extracted.get("email"):
        contact_info["emails"].append(extracted["email"])
        
    if custom.get("all_phones"):
        contact_info["phones"].extend(custom["all_phones"])
    elif extracted.get("phone"):
        contact_info["phones"].append(extracted["phone"])
        
    if custom.get("mobile_number"):
        contact_info["phones"].extend(custom["mobile_number"])

    # Deduplicate contact info
    contact_info["emails"] = list(set(filter(None, contact_info["emails"])))
    contact_info["phones"] = list(set(filter(None, contact_info["phones"])))

    # 4. Map Dates
    dates = []
    if extracted.get("date"):
        dates.append(extracted["date"])

    # 5. Map Categories (including Resume and Identity Document)
    raw_category = extracted.get("document_type", "uncategorized").lower()
    
    category_mapping = {
        "form": "Form",
        "invoice": "Invoice",
        "contract": "Contract",
        "certificate": "Certificate",
        "resume": "Resume",
        "identity_document": "Identity Document",
        "purchase_order": "Purchase Order",
        "official_letter": "Official Letter"
    }
    
    category = category_mapping.get(raw_category, raw_category.capitalize())

    return {
        "category": category,
        "entities": entities,
        "contact_info": contact_info,
        "dates": dates,
        # Added identifiers specifically for vector indexing
        "identifiers": {
            "passport": custom.get("passport_number", []),
            "national_id": custom.get("national_id", []),
            "purchase_order": custom.get("purchase_order_number", []),
            "invoice_number": [extracted.get("invoice_number")] if extracted.get("invoice_number") else []
        }
    }

@app.post("/extract")
async def extract_metadata(request: Request):
    """
    Accept JSON body with 'text' and optional 'docId'.
    Returns extracted metadata, stores in Qdrant.
    """
    try:
        body = await request.json()
    except json.JSONDecodeError as e:
        print(f"[ERROR] Invalid JSON: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if "text" not in body:
        print(f"[ERROR] Missing 'text' field. Received: {body}")
        raise HTTPException(status_code=422, detail="Missing 'text' field")
    
    text = body["text"]
    doc_id = body.get("docId", "unknown")
    
    print(f"[EXTRACT] Received docId={doc_id}, text length={len(text)}")

    ocr_input = {"ocr_result": {"raw_text": text}}
    extracted = extractor.extract(ocr_input)
    frontend_metadata = transform_to_frontend_metadata(extracted)

    try:
        qdrant_store.store(
            doc_id=doc_id,
            metadata=frontend_metadata,
            text=text
        )
        print(f"[QDRANT] Stored doc {doc_id}")
    except Exception as e:
        print(f"[QDRANT] Storage failed: {e}")

    return frontend_metadata

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/token")
async def login(data: dict):
    service_name = data.get("service_name", "unknown")
    access = create_access_token(service_name)
    refresh = create_refresh_token(service_name)
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}

@app.post("/refresh")
async def refresh(data: dict):
    token = data.get("refresh_token")
    payload = verify_refresh_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    new_access = create_access_token(payload["service"])
    return {"access_token": new_access, "token_type": "bearer"}