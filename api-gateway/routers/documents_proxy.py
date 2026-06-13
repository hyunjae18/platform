from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Body
from typing import Optional
import httpx
import logging
from datetime import datetime

from config import get_settings
from load_balancer import get_balancer
from security import get_current_user, TokenPayload   # your corrected security.py

logger = logging.getLogger("api_gateway")
router = APIRouter(prefix="/api/documents", tags=["documents"])
settings = get_settings()

_document_balancer = get_balancer("document", settings.DOCUMENT_SERVICE_URLS)
_archive_balancer = get_balancer("archive", settings.ARCHIVE_SERVICE_URLS)
_ocr_balancer = get_balancer("ocr-documents", settings.OCR_SERVICE_URLS)


async def store_original_in_archive(
    client: httpx.AsyncClient,
    *,
    request: Request,
    document_id: str,
    file: UploadFile,
    file_content: bytes,
    enterprise_id: str,
) -> dict:
    auth_header = request.headers.get("Authorization", "")
    try:
        response = await client.post(
            f"{_archive_balancer.next_url()}/archive/store",
            params={"documentId": document_id},
            files={"file": (file.filename, file_content, file.content_type)},
            headers={
                "Authorization": auth_header,
                "X-Enterprise-ID": enterprise_id,
            },
        )
    except httpx.RequestError as exc:
        logger.error("Archive service unreachable: %s", exc)
        raise HTTPException(status_code=503, detail="Archive service unavailable")

    if response.status_code not in (200, 201):
        logger.error("Archive service returned %s: %s", response.status_code, response.text[:500])
        raise HTTPException(
            status_code=502,
            detail="Document metadata was not saved because archive storage failed",
        )

    return response.json()

@router.get("")
@router.get("/")
async def get_documents(current_user: TokenPayload = Depends(get_current_user)):
    """
    List documents belonging to the authenticated user.
    The document service will filter by X-Enterprise-ID header.
    """
    logger.info(
        "Getting documents for user %s enterprise=%s",
        current_user.sub,
        current_user.enterprise_id,
    )
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                f"{_document_balancer.next_url()}/documents",
                headers={
                    "X-User-ID": current_user.sub,
                    "X-User-Role": current_user.role,
                    "X-User-Email": current_user.email,
                    "X-Enterprise-ID": current_user.enterprise_id,
                }
            )
            logger.info(f"Document service responded with status: {response.status_code}")
            return response.json()
        except httpx.ConnectError as e:
            logger.error(f"Cannot connect to document service: {e}")
            raise HTTPException(status_code=503, detail="Document service unavailable")

@router.get("/{document_id}")
async def get_document(
    document_id: str,
    current_user: TokenPayload = Depends(get_current_user)
):
    """Fetch a single document (must belong to the user or be admin)."""
    logger.info(
        "Fetching document %s for user %s enterprise=%s",
        document_id,
        current_user.sub,
        current_user.enterprise_id,
    )
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.get(
                f"{_document_balancer.next_url()}/documents/{document_id}",
                headers={
                    "X-User-ID": current_user.sub,
                    "X-Enterprise-ID": current_user.enterprise_id,
                }
            )
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Document not found")
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError as e:
            logger.error(f"Cannot connect to document service: {e}")
            raise HTTPException(status_code=503, detail="Document service unavailable")

@router.post("/upload")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    extractedText: Optional[str] = Form(None),
    current_user: TokenPayload = Depends(get_current_user)
):
    """
    Upload a document. Runs OCR if the file type is supported.
    The document is stored with ownerId = current_user.sub.
    """
    extracted_text = extractedText or ""
    user_id = current_user.sub
    enterprise_id = current_user.enterprise_id

    # Validate enterprise_id – if missing, token might be invalid
    if not enterprise_id:
        logger.error("No enterprise_id in token for user %s", user_id)
        raise HTTPException(status_code=400, detail="Missing enterprise ID in authentication token")

    logger.info(
        "Uploading document for user=%s enterprise=%s",
        user_id, enterprise_id
    )

    file_content = await file.read()
    file_size = len(file_content)
    content_type = file.content_type or "application/octet-stream"

    # OCR‑supported types (same as OCR service)
    ocr_supported = (
        content_type.startswith('image/') or
        content_type == 'application/pdf' or
        content_type in [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.ms-powerpoint'
        ]
    )

    unsupported_warning = None
    ocr_documentId = None

    if ocr_supported:
        try:
            ocr_url = _ocr_balancer.next_url()
            logger.info(f"Sending {file.filename} ({content_type}) to OCR service at {ocr_url}")
            files = {'file': (file.filename, file_content, content_type)}
            
            # Explicitly build headers – ensure X-Enterprise-ID is present
            ocr_headers = {
                "X-Enterprise-ID": enterprise_id
            }
            logger.debug(f"OCR request headers: {ocr_headers}")

            async with httpx.AsyncClient(timeout=300.0) as ocr_client:
                ocr_response = await ocr_client.post(
                    f"{ocr_url}/ocr/extract",
                    files=files,
                    headers=ocr_headers,
                )
                
                if ocr_response.status_code == 200:
                    ocr_data = ocr_response.json()
                    logger.info("OCR Response received")
                    if "ocr_result" in ocr_data:
                        extracted_text = ocr_data["ocr_result"].get("raw_text", "")
                        ocr_documentId = ocr_data["ocr_result"].get("documentId")
                    else:
                        extracted_text = ocr_data.get("raw_text", "")
                        ocr_documentId = ocr_data.get("documentId")
                    logger.info(f"OCR extracted {len(extracted_text)} characters, docId={ocr_documentId}")
                else:
                    # Log full error for debugging
                    logger.warning(
                        f"OCR failed with status {ocr_response.status_code}, "
                        f"body: {ocr_response.text[:500]}"
                    )
                    # Do not raise – we still want to save the document without OCR
        except Exception as e:
            logger.error(f"OCR processing failed: {type(e).__name__}: {e}", exc_info=True)
            # Continue without OCR – document will be saved but without extracted text
    else:
        unsupported_warning = (
            f"Unsupported document type for OCR: {content_type}. "
            "The original file was archived, but no text was extracted."
        )
        logger.info(f"Skipping OCR for unsupported type: {content_type}")

    # Use OCR's document ID if available, otherwise generate one
    if ocr_documentId:
        documentId = ocr_documentId
        logger.info(f"Using OCR document ID: {documentId}")
    else:
        documentId = f"doc_{int(datetime.now().timestamp())}_{file.filename.replace(' ', '_')}"
        logger.info(f"Generated document ID: {documentId}")

    document_data = {
        "documentId": documentId,
        "name": file.filename,
        "type": content_type,
        "size": file_size,
        "ownerId": user_id,
        "enterprise_id": enterprise_id,
        "extractedText": extracted_text
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            archive_result = await store_original_in_archive(
                client,
                request=request,
                document_id=documentId,
                file=file,
                file_content=file_content,
                enterprise_id=enterprise_id,
            )

            response = await client.post(
                f"{_document_balancer.next_url()}/documents/process",
                json=document_data,
                headers={
                    "X-User-ID": user_id,
                    "X-User-Role": current_user.role,
                    "X-Enterprise-ID": enterprise_id,
                    "Content-Type": "application/json"
                }
            )
            if response.status_code not in (200, 201):
                logger.error(f"Document service returned {response.status_code}: {response.text}")
                raise HTTPException(status_code=response.status_code, detail="Upload failed")
            result = response.json()
            result["ocr_supported"] = ocr_supported
            result["ocr_applied"] = bool(extracted_text)
            result["text_length"] = len(extracted_text)
            result["documentId"] = documentId
            result["archive"] = archive_result
            if unsupported_warning:
                result["warning"] = unsupported_warning
            logger.info(f"Upload complete - Document ID: {documentId}")
            return result
        except HTTPException:
            raise
        except httpx.ConnectError as e:
            logger.error(f"Cannot connect to document service: {e}")
            raise HTTPException(status_code=503, detail="Document service unavailable")


@router.put("/{document_id}/metadata")
async def update_document_metadata(
    document_id: str,
    payload: dict = Body(...),
    current_user: TokenPayload = Depends(get_current_user),
):
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.put(
                f"{_document_balancer.next_url()}/documents/{document_id}/metadata",
                json=payload,
                headers={
                    "X-User-ID": current_user.sub,
                    "X-User-Role": current_user.role,
                    "X-Enterprise-ID": current_user.enterprise_id,
                    "Content-Type": "application/json",
                },
            )
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Document not found")
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError as e:
            logger.error(f"Cannot connect to document service: {e}")
            raise HTTPException(status_code=503, detail="Document service unavailable")


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    request: Request,
    current_user: TokenPayload = Depends(get_current_user),
):
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            archive_response = await client.delete(
                f"{_archive_balancer.next_url()}/archive/{document_id}",
                headers={
                    "Authorization": request.headers.get("Authorization", ""),
                    "X-User-ID": current_user.sub,
                    "X-User-Role": current_user.role,
                    "X-Enterprise-ID": current_user.enterprise_id,
                },
            )
            if archive_response.status_code not in (200, 204, 404):
                logger.error(
                    "Archive delete returned %s: %s",
                    archive_response.status_code,
                    archive_response.text[:500],
                )
                raise HTTPException(
                    status_code=502,
                    detail="Document metadata was not deleted because archive cleanup failed",
                )

            response = await client.delete(
                f"{_document_balancer.next_url()}/documents/{document_id}",
                headers={
                    "X-User-ID": current_user.sub,
                    "X-User-Role": current_user.role,
                    "X-Enterprise-ID": current_user.enterprise_id,
                },
            )
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Document not found")
            response.raise_for_status()
            result = response.json() if response.content else {"message": "Deleted", "documentId": document_id}
            if isinstance(result, dict):
                result["archiveDeleted"] = archive_response.status_code != 404
            return result
        except httpx.ConnectError as e:
            logger.error(f"Cannot connect to document or archive service: {e}")
            raise HTTPException(status_code=503, detail="Document or archive service unavailable")
