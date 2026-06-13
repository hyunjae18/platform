#!/usr/bin/env python3
"""
GLiNER Metadata Extraction – Core logic with hybrid regex and document-specific rules
"""
import os
import re
from typing import Dict, Any, Optional, List
import torch
from gliner import GLiNER

MODEL_NAME = os.getenv("GLINER_MODEL", "urchade/gliner_multi-v2.1")
DEVICE = os.getenv("DEVICE", "cpu")

GLINER_LABELS = [
    "organization", "person", "date", "phone", "email",
    "address", "country", "city", "amount", "currency",
    "invoice number", "contract number", "registration number",
    "passport number", "national identity card", "purchase order"
]

class GLiNERExtractor:
    def __init__(self, model_name: str = MODEL_NAME, device: str = DEVICE):
        print(f"[LOAD] Loading GLiNER: {model_name}")
        self.model = GLiNER.from_pretrained(model_name)
        if device == "cuda" and torch.cuda.is_available():
            self.model = self.model.to("cuda")
            print("[LOAD] Using CUDA")
        else:
            print("[LOAD] Using CPU")
        self.model.eval()
        print("[LOAD] Ready")

    def _flatten_ocr(self, ocr_json: Dict[str, Any]) -> str:
        """Handle OCR formats."""[cite: 3]
        texts = []
        if "pages" in ocr_json:
            for page in ocr_json["pages"]:
                for block in page.get("blocks", []):
                    t = block.get("text", "").strip()
                    if t:
                        texts.append(t)
        elif "ocr_result" in ocr_json:
            ocr = ocr_json["ocr_result"]
            if "raw_text" in ocr and ocr["raw_text"]:
                return ocr["raw_text"]
            for line in ocr.get("lines", []):
                t = line.get("text", "").strip()
                if t:
                    texts.append(t)
        elif "lines" in ocr_json:
            for line in ocr_json["lines"]:
                t = line.get("text", "").strip() if isinstance(line, dict) else str(line).strip()
                if t:
                    texts.append(t)
        elif "raw_text" in ocr_json:
            return ocr_json["raw_text"]
        return "\n".join(texts)

    def _detect_languages(self, text: str) -> List[str]:[cite: 3]
        langs = set()
        if re.search(r"[\u0600-\u06FF]", text):
            langs.add("ar")
        fr_markers = {"le", "la", "de", "des", "et", "en", "un", "une", "pour", "les",
                      "du", "au", "avec", "dans", "sur", "facture", "contrat", "certificat",
                      "nom", "prénom", "adresse", "tél", "date", "n°", "montant", "total",
                      "certifions", "soussignés", "république", "algérienne", "démocratique"}
        text_lower = text.lower()
        if any(w in text_lower for w in fr_markers):
            langs.add("fr")
        if re.search(r"[a-zA-Z]{4,}", text) and "fr" not in langs:
            langs.add("en")
        if not langs:
            langs.add("fr")
        return sorted(langs)

    def _classify_document_type(self, text: str) -> str:
        """Classifies across structured, semi-structured, unstructured, and identity documents."""
        t = text.lower()
        scores = {
            "certificate": 0, "form": 0,          # Structured
            "invoice": 0, "purchase_order": 0,    # Semi-structured
            "contract": 0, "official_letter": 0,  # Unstructured
            "identity_document": 0                 # Visual/Identity
        }
        kw = {
            "certificate": ["certificat", "certificate", "attestation", "certified", "شهادة", "تصريح", "diploma"],
            "form": ["formulaire", "form", "demande", "application form", "استمارة", "نموذج"],
            "invoice": ["facture", "invoice", "montant", "total", "ht", "ttc", "دفع", "فاتورة", "devis"],
            "purchase_order": ["purchase order", "bon de commande", "po n°", "order date", "order no"],
            "contract": ["contrat", "contract", "agreement", "accord", "parties", "article", "عقد", "اتفاق"],
            "official_letter": ["lettre", "letter", "monsieur", "madame", "objet", "السيد", "موضوع", "إلى"],
            "identity_document": ["passport", "passeport", "national id", "carte d'identité", "biometric", "الرقم الوطني", "date of birth", "lieu de naissance"]
        }
        for doc_type, words in kw.items():
            scores[doc_type] = sum(2 if w in t else 0 for w in words)
        
        best = max(scores, key=scores.get)
        return best if scores[best] > 0 else "unstructured_memo"

    def _parse_date(self, raw: str) -> Optional[str]:[cite: 3]
        arabic_to_western = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
        raw = raw.translate(arabic_to_western)
        m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw)
        if m:
            return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
        m = re.search(r"(\d{1,2})-(\d{1,2})-(\d{4})", raw)
        if m:
            return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
        ar_months = {
            "يناير": "01", "فبراير": "02", "مارس": "03", "أبريل": "04",
            "مايو": "05", "يونيو": "06", "يوليو": "07", "أغسطس": "08",
            "سبتمبر": "09", "أكتوبر": "10", "نوفمبر": "11", "ديسمبر": "12",
        }
        m = re.search(r"(\d{1,2})\s+(\w+)\s+(\d{4})", raw)
        if m:
            day, month_str, year = m.groups()
            month = ar_months.get(month_str, "01")
            return f"{year}-{month}-{day.zfill(2)}"
        return raw if re.match(r"\d{4}-\d{2}-\d{2}", raw) else None

    def _extract_keywords(self, text: str, top_n: int = 8) -> List[str]:[cite: 3]
        stop = {"le", "la", "de", "et", "à", "un", "une", "des", "du", "au", "en", "pour",
                "par", "sur", "avec", "les", "the", "and", "of", "to", "in", "a", "is", "for",
                "في", "من", "على", "إلى", "عن", "مع", "هذا", "التي", "الذي"}
        words = re.findall(r"[\w\u0600-\u06FF]+", text.lower())
        freq: Dict[str, int] = {}
        for w in words:
            if w not in stop and len(w) > 2 and not w.isdigit():
                freq[w] = freq.get(w, 0) + 1
        return [w for w, _ in sorted(freq.items(), key=lambda x: x[1], reverse=True)[:top_n]]

    def _regex_fallbacks(self, text: str, entities: Dict[str, List[str]]) -> Dict[str, List[str]]:
        """Enhanced regex validation layers targeting global and localized formats."""
        # 1. High-precision Multi-lingual Phone Regex (Handles spaces, dots, dashes, and international prefixes)
        phone_pattern = r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,3}\)?[-.\s]?\d{2,3}[-.\s]?\d{2,4}[-.\s]?\d{2,4}"
        found_phones = re.findall(phone_pattern, text)
        cleaned_phones = [p.strip() for p in found_phones if len(re.sub(r'\D', '', p)) >= 8]
        if cleaned_phones:
            entities["phone"] = list(set(entities.get("phone", []) + cleaned_phones))

        # 2. Email Verification[cite: 3]
        if not entities.get("email"):
            entities["email"] = re.findall(r"[\w.-]+@[\w.-]+\.\w+", text)

        # 3. Identity Document Numbers (Passports & National ID Cards)
        passport_pattern = r"\b[A-Z]{1,2}\d{7,8}\b"  # Standard alphanumeric passport layouts
        found_passports = re.findall(passport_pattern, text)
        if found_passports:
            entities["passport number"] = list(set(entities.get("passport number", []) + found_passports))

        national_id_pattern = r"\b\d{9,18}\b"  # Generic Numeric Unique National IDs / NINs
        found_ids = re.findall(national_id_pattern, text)
        if found_ids:
            entities["national identity card"] = list(set(entities.get("national identity card", []) + found_ids))

        # 4. Semi-structured identifiers (Invoices & Purchase Orders)
        if not entities.get("invoice number"):
            inv_pattern = r"(?:facture|invoice|inv|n°)[\s:]*([\w\-\/]+)"
            entities["invoice number"] = re.findall(inv_pattern, text, re.IGNORECASE)

        po_pattern = r"(?:purchase order|po|commande)[\s:]*([\w\-\/]+)"
        found_pos = re.findall(po_pattern, text, re.IGNORECASE)
        if found_pos:
            entities["purchase order"] = found_pos

        # 5. Financial extraction fallbacks[cite: 3]
        if not entities.get("amount") or not entities.get("currency"):
            found = re.findall(
                r"(\d{1,3}(?:[\s.,]\d{3})*(?:[,.]\d{2})?)\s*(DA|DZD|EUR|USD|€|\$|دج)",
                text, re.IGNORECASE
            )
            if found:
                entities["amount"] = [f[0].replace(" ", "").replace(",", ".") for f in found]
                entities["currency"] = [f[1].upper() for f in found]

        return entities

    def extract(self, ocr_json: Dict[str, Any]) -> Dict[str, Any]:
        text = self._flatten_ocr(ocr_json)
        if not text.strip():
            return {"document_type": "other", "languages": []}

        # GLiNER dynamic zero-shot parsing pass
        ents = self.model.predict_entities(text, GLINER_LABELS, threshold=0.25)

        buckets: Dict[str, List[str]] = {label: [] for label in GLINER_LABELS}
        for e in ents:
            label = e["label"].lower().strip()
            val = e["text"].strip()
            if label in buckets:
                buckets[label].append(val)

        # Merge structural rules and regular expressions
        buckets = self._regex_fallbacks(text, buckets)

        # Extract explicit structural type
        doc_type = self._classify_document_type(text)

        result = {
            "document_type": doc_type,
            "organization_name": buckets["organization"][0] if buckets["organization"] else None,
            "person_name": buckets["person"][0] if buckets["person"] else None,
            "date": self._parse_date(buckets["date"][0]) if buckets["date"] else None,
            "invoice_number": buckets["invoice number"][0] if buckets["invoice number"] else None,
            "contract_number": buckets["contract number"][0] if buckets["contract number"] else None,
            "registration_number": buckets["registration number"][0] if buckets["registration number"] else None,
            "phone": buckets["phone"][0] if buckets["phone"] else None,
            "email": buckets["email"][0] if buckets["email"] else None,
            "address": buckets["address"][0] if buckets["address"] else None,
            "country": buckets["country"][0] if buckets["country"] else None,
            "city": buckets["city"][0] if buckets["city"] else None,
            "amount": float(buckets["amount"][0]) if buckets["amount"] else None,
            "currency": buckets["currency"][0].upper() if buckets["currency"] else None,
            "keywords": self._extract_keywords(text),
            "languages": self._detect_languages(text),
            # New document specific tokens passed directly to backend to enrich structural vectors
            "custom_fields": {
                "passport_number": buckets["passport number"] if buckets["passport number"] else [],
                "national_id": buckets["national identity card"] if buckets["national identity card"] else [],
                "purchase_order_number": buckets["purchase order"] if buckets["purchase order"] else [],
                "all_phones": buckets["phone"],
                "all_people": buckets["person"]
            }
        }

        return result