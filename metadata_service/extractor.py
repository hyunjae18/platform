#!/usr/bin/env python3
"""
Metadata extraction core logic.

The extractor can use GLiNER when explicitly enabled, but the default path is a
deterministic rules engine tuned for noisy OCR. The rules prefer precision over
guessing so words like "positive attitude" do not become places and long student
IDs do not become phone numbers.
"""
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    import torch
    from gliner import GLiNER
except Exception:
    torch = None
    GLiNER = None

MODEL_NAME = os.getenv("GLINER_MODEL", "urchade/gliner_multi-v2.1")
DEVICE = os.getenv("DEVICE", "cpu")
GLINER_ENABLED = os.getenv("GLINER_ENABLED", "false").lower() in {"1", "true", "yes"}

GLINER_LABELS = [
    "organization",
    "person",
    "date",
    "phone",
    "email",
    "address",
    "country",
    "city",
    "amount",
    "currency",
    "invoice number",
    "contract number",
    "registration number",
]

SECTION_HEADINGS = {
    "professional",
    "summary",
    "professional summary",
    "work history",
    "skills",
    "education",
    "additional",
    "training",
    "cash handling",
    "friendliness",
    "teamwork",
    "time management",
    "verbal communication",
    "instruction following",
}

KNOWN_CITY_WORDS = {
    "alger",
    "algiers",
    "annaba",
    "biskra",
    "constantine",
    "oran",
    "manchester",
    "london",
}

ORG_HINTS = {
    "academy",
    "association",
    "bank",
    "college",
    "company",
    "direction",
    "institute",
    "library",
    "ministry",
    "ministere",
    "ministère",
    "programme",
    "school",
    "university",
    "universite",
    "université",
    "wilaya",
    "جامعة",
    "وزارة",
    "مديرية",
    "مدرسة",
    "معهد",
}


class GLiNERExtractor:
    def __init__(self, model_name: str = MODEL_NAME, device: str = DEVICE):
        print(f"[LOAD] Loading GLiNER: {model_name}")
        self.model = None
        try:
            if not GLINER_ENABLED:
                raise RuntimeError("GLiNER disabled by GLINER_ENABLED=false")
            if GLiNER is None or torch is None:
                raise RuntimeError("GLiNER dependencies are not installed")
            self.model = GLiNER.from_pretrained(model_name)
            if device == "cuda" and torch.cuda.is_available():
                self.model = self.model.to("cuda")
                print("[LOAD] Using CUDA")
            else:
                print("[LOAD] Using CPU")
            self.model.eval()
            print("[LOAD] Ready")
        except Exception as exc:
            print(f"[LOAD] GLiNER unavailable, using regex fallback: {type(exc).__name__}: {exc}")

    def _flatten_ocr(self, ocr_json: Dict[str, Any]) -> str:
        texts = []
        if "pages" in ocr_json:
            for page in ocr_json["pages"]:
                for block in page.get("blocks", []):
                    value = block.get("text", "").strip()
                    if value:
                        texts.append(value)
        elif "ocr_result" in ocr_json:
            ocr = ocr_json["ocr_result"]
            if ocr.get("raw_text"):
                return ocr["raw_text"]
            for line in ocr.get("lines", []):
                value = line.get("text", "").strip()
                if value:
                    texts.append(value)
        elif "lines" in ocr_json:
            for line in ocr_json["lines"]:
                value = line.get("text", "").strip() if isinstance(line, dict) else str(line).strip()
                if value:
                    texts.append(value)
        elif ocr_json.get("raw_text"):
            return ocr_json["raw_text"]
        return "\n".join(texts)

    def _lines(self, text: str) -> List[str]:
        return [line.strip(" \t\r:;") for line in text.splitlines() if line.strip(" \t\r:;")]

    def _unique(self, values: List[str]) -> List[str]:
        seen = set()
        result = []
        for value in values:
            clean = re.sub(r"\s+", " ", str(value)).strip(" \t\r\n:;,.،")
            key = clean.lower()
            if clean and key not in seen:
                seen.add(key)
                result.append(clean)
        return result

    def _normalize_digits(self, text: str) -> str:
        return text.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789"))

    def _is_heading(self, value: str) -> bool:
        return value.lower().strip(" :") in SECTION_HEADINGS

    def _valid_date(self, year: int, month: int, day: int) -> Optional[str]:
        if year < 1900 or year > datetime.now().year + 15:
            return None
        try:
            return datetime(year, month, day).strftime("%Y-%m-%d")
        except ValueError:
            return None

    def _detect_languages(self, text: str) -> List[str]:
        langs = set()
        lower = text.lower()
        if re.search(r"[\u0600-\u06FF]", text):
            langs.add("ar")
        fr_markers = {"facture", "contrat", "certificat", "attestation", "republique", "ministere", "universite"}
        en_markers = {"summary", "skills", "education", "work", "customer", "school", "training", "experience"}
        if any(re.search(rf"\b{re.escape(word)}\b", lower) for word in fr_markers):
            langs.add("fr")
        if any(word in lower for word in en_markers) or re.search(r"[a-zA-Z]{4,}", text):
            langs.add("en")
        if not langs:
            langs.add("fr")
        return sorted(langs)

    def _classify_document_type(self, text: str) -> str:
        lower = text.lower()
        resume_score = sum(1 for word in ["professional summary", "work history", "skills", "education", "resume", "cv"] if word in lower)
        if resume_score >= 2:
            return "resume"
        has_arabic_certificate = "\u0634\u0647\u0627\u062f\u0629" in text
        has_student_registration = bool(re.search(r"\bUN\d{8,}\b", self._normalize_digits(text), re.IGNORECASE))
        has_university_signal = any(word in lower for word in ["universite", "université", "university"]) or "\u062c\u0627\u0645\u0639" in text
        if has_student_registration and has_university_signal:
            return "certificate"
        if has_arabic_certificate or any(word in lower for word in ["certificate", "certificat", "attestation"]):
            return "certificate"
        if resume_score:
            return "resume"
        if any(word in lower for word in ["facture", "invoice", "total", "ttc", "devis"]):
            return "invoice"
        if any(word in lower for word in ["contrat", "contract", "agreement", "accord"]):
            return "contract"
        if any(word in lower for word in ["formulaire", "form", "demande", "request"]):
            return "form"
        if any(word in lower for word in ["arrete", "decision", "direction", "commune", "wilaya", "ministere"]):
            return "administrative_document"
        return "other"

    def _extract_emails(self, text: str) -> List[str]:
        candidates = re.findall(r"[\w.+-]+(?:@|Q)[\w.-]+\.[A-Za-z]{2,}", text)
        emails = []
        for candidate in candidates:
            fixed = candidate.replace("Q", "@")
            local, _, domain = fixed.partition("@")
            if local.startswith("0") and len(local) > 1 and local[1].isalpha():
                local = f"o{local[1:]}"
            if local and domain:
                emails.append(f"{local}@{domain}".replace(" ", ""))
        return self._unique(emails)

    def _extract_phones(self, text: str) -> List[str]:
        phones = []
        for raw in re.findall(r"(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}", text):
            digits = re.sub(r"\D", "", raw)
            has_plus = raw.strip().startswith("+")
            has_separators = bool(re.search(r"[\s().-]", raw.strip()))
            if re.match(r"\s*20\d{2}", raw) or "." in raw:
                continue
            if 8 <= len(digits) <= 15 and (has_plus or has_separators):
                phones.append(raw)
        return self._unique(phones)

    def _extract_dates(self, text: str) -> List[str]:
        normalized = self._normalize_digits(text)
        dates = []
        month_map = {
            "janvier": 1,
            "fevrier": 2,
            "février": 2,
            "mars": 3,
            "avril": 4,
            "mai": 5,
            "juin": 6,
            "juillet": 7,
            "aout": 8,
            "août": 8,
            "septembre": 9,
            "octobre": 10,
            "novembre": 11,
            "decembre": 12,
            "décembre": 12,
            "january": 1,
            "february": 2,
            "march": 3,
            "april": 4,
            "may": 5,
            "june": 6,
            "july": 7,
            "august": 8,
            "september": 9,
            "october": 10,
            "november": 11,
            "december": 12,
        }
        for day, month, year in re.findall(r"\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b", normalized):
            parsed = self._valid_date(int(year), int(month), int(day))
            if parsed:
                dates.append(parsed)
        for year, month, day in re.findall(r"\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b", normalized):
            parsed = self._valid_date(int(year), int(month), int(day))
            if parsed:
                dates.append(parsed)
        for day, month_name, year in re.findall(
            r"\b(\d{1,2})\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)\s+(\d{4})\b",
            normalized,
            re.IGNORECASE,
        ):
            month = month_map.get(month_name.lower())
            if month:
                parsed = self._valid_date(int(year), month, int(day))
                if parsed:
                    dates.append(parsed)
        return self._unique(dates)

    def _extract_people(self, text: str) -> List[str]:
        lines = self._lines(text)
        people = []

        for line in lines[:8]:
            latin = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ' -]", "", line).strip()
            words = latin.split()
            if 2 <= len(words) <= 4 and latin.isupper() and not self._is_heading(latin):
                people.append(latin.title())
                break
            if re.fullmatch(r"[A-Z]{2,}(?:\s+[A-Z]{2,}){0,2}\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'\-]{2,}", latin):
                people.append(latin.title())
                break

        for line in lines:
            match = re.search(
                r"^\s*(?:client|name|full name|candidate)\s*[:\-]?\s*([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'\-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'\-]+){1,4})\s*$",
                line,
                re.IGNORECASE,
            )
            if match and not self._is_heading(match.group(1)):
                people.append(match.group(1))

        for idx, line in enumerate(lines):
            if "الطالب" in line or "الاسم" in line:
                window = lines[max(0, idx - 2): idx + 3]
                for candidate in window:
                    if re.fullmatch(r"[\u0600-\u06FF ]{4,40}", candidate) and candidate not in {"الطالب"}:
                        people.append(candidate)
                for candidate in window:
                    if re.fullmatch(r"[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){1,4}", candidate):
                        people.append(candidate)

        return self._unique(people)

    def _extract_places(self, text: str) -> Dict[str, List[str]]:
        places = []
        addresses = []
        for line in self._lines(text):
            if re.search(r"\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b", line, re.IGNORECASE):
                addresses.append(line)
            if re.search(r"\b(?:street|road|avenue|rue|حي|شارع)\b", line, re.IGNORECASE):
                addresses.append(line)
            for city in KNOWN_CITY_WORDS:
                if re.search(rf"\b{re.escape(city)}\b", line, re.IGNORECASE):
                    places.append(city.title())
            arabic_city = re.search(r"(?:ب[:：]?\s*|ولاية\s+|مدينة\s+)([\u0600-\u06FF]{3,20})", line)
            if arabic_city:
                places.append(arabic_city.group(1))
        return {"city": self._unique(places), "address": self._unique(addresses)}

    def _extract_organizations(self, text: str) -> List[str]:
        orgs = []
        for line in self._lines(text):
            lower = line.lower()
            role_split = re.split(r"\s+[|I]\s+", line)
            if len(role_split) == 2 and any(hint in role_split[1].lower() for hint in ORG_HINTS | {"look"}):
                orgs.append(role_split[1].strip())
                continue
            comma_tail = line.split(",")[-1].strip()
            if comma_tail != line and any(hint in comma_tail.lower() for hint in ORG_HINTS | {"look"}):
                orgs.append(comma_tail)
                continue
            if any(hint in lower or hint in line for hint in ORG_HINTS):
                if len(line) <= 90 and not self._is_heading(line) and "," not in line:
                    orgs.append(line.strip(" ,"))
        return self._unique(orgs)

    def _extract_registration_numbers(self, text: str) -> List[str]:
        normalized = self._normalize_digits(text)
        values = []
        values.extend(re.findall(r"\bUN\d{8,}\b", normalized, re.IGNORECASE))
        lines = self._lines(normalized)
        for idx, line in enumerate(lines):
            if re.search(r"رقم\s*التسجيل|registration|matricule|student\s*id", line, re.IGNORECASE):
                for candidate in lines[idx: idx + 3]:
                    match = re.search(r"\b(?:UN)?[A-Z0-9]{8,}\b", candidate, re.IGNORECASE)
                    if match:
                        values.append(match.group(0))
        return self._unique(values)

    def _extract_financial(self, text: str) -> Dict[str, List[str]]:
        normalized = self._normalize_digits(text)
        found = re.findall(
            r"(\d{1,3}(?:[\s.,]\d{3})*(?:[,.]\d{2})?)\s*(DA|DZD|EUR|USD|\$|€|دج)",
            normalized,
            re.IGNORECASE,
        )
        return {
            "amount": self._unique([item[0] for item in found]),
            "currency": self._unique([item[1].upper() for item in found]),
        }

    def _parse_amount(self, raw: str) -> Optional[float]:
        value = raw.replace(" ", "").replace("\u00a0", "")
        if "," in value and "." in value:
            value = value.replace(".", "").replace(",", ".")
        else:
            value = value.replace(",", ".")
        try:
            return float(value)
        except ValueError:
            return None

    def _extract_keywords(self, text: str, top_n: int = 8) -> List[str]:
        text = re.sub(r"[\w.+-]+(?:@|Q)[\w.-]+\.[A-Za-z]{2,}", " ", text)
        text = re.sub(r"(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}", " ", text)
        text = re.sub(r"\b[A-Z]{1,3}\d{8,}\b", " ", text, flags=re.IGNORECASE)
        stop = {
            "le", "la", "de", "et", "un", "une", "des", "du", "au", "en", "pour", "par",
            "sur", "avec", "les", "the", "and", "of", "to", "in", "for", "with", "from",
            "في", "من", "على", "إلى", "عن", "مع", "هذا", "هذه",
        }
        words = re.findall(r"[\w\u0600-\u06FF]+", text.lower())
        freq: Dict[str, int] = {}
        for word in words:
            if word not in stop and len(word) > 2 and not word.isdigit():
                freq[word] = freq.get(word, 0) + 1
        return [word for word, _ in sorted(freq.items(), key=lambda item: item[1], reverse=True)[:top_n]]

    def _regex_fallbacks(self, text: str, entities: Dict[str, List[str]]) -> Dict[str, List[str]]:
        places = self._extract_places(text)
        financial = self._extract_financial(text)
        fallback = {
            "email": self._extract_emails(text),
            "phone": self._extract_phones(text),
            "date": self._extract_dates(text),
            "person": self._extract_people(text),
            "organization": self._extract_organizations(text),
            "city": places["city"],
            "address": places["address"],
            "registration number": self._extract_registration_numbers(text),
            "amount": financial["amount"],
            "currency": financial["currency"],
            "invoice number": self._unique(re.findall(
                r"(?:facture|invoice)\s*(?:n[o°]?|number|numero|numéro)?\s*[:#°\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})",
                text,
                re.IGNORECASE,
            )),
            "contract number": self._unique(re.findall(
                r"(?:contrat|contract)\s*(?:n[o°]?|number|numero|numéro)?\s*[:#°\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})",
                text,
                re.IGNORECASE,
            )),
        }
        for label, values in fallback.items():
            if values:
                entities[label] = self._unique([*entities.get(label, []), *values])
        for label, values in entities.items():
            entities[label] = self._unique(values)
        return entities

    def extract(self, ocr_json: Dict[str, Any]) -> Dict[str, Any]:
        text = self._flatten_ocr(ocr_json)
        if not text.strip():
            return {"document_type": "other", "languages": []}

        buckets: Dict[str, List[str]] = {label: [] for label in GLINER_LABELS}
        if self.model is not None:
            for entity in self.model.predict_entities(text, GLINER_LABELS, threshold=0.35):
                label = entity["label"].lower().strip()
                value = entity["text"].strip()
                if label in buckets:
                    buckets[label].append(value)

        buckets = self._regex_fallbacks(text, buckets)
        parsed_dates = self._extract_dates(text)

        return {
            "document_type": self._classify_document_type(text),
            "organization_name": buckets["organization"][0] if buckets["organization"] else None,
            "person_name": buckets["person"][0] if buckets["person"] else None,
            "date": parsed_dates[0] if parsed_dates else None,
            "invoice_number": buckets["invoice number"][0] if buckets["invoice number"] else None,
            "contract_number": buckets["contract number"][0] if buckets["contract number"] else None,
            "registration_number": buckets["registration number"][0] if buckets["registration number"] else None,
            "phone": buckets["phone"][0] if buckets["phone"] else None,
            "email": buckets["email"][0] if buckets["email"] else None,
            "address": buckets["address"][0] if buckets["address"] else None,
            "country": buckets["country"][0] if buckets["country"] else None,
            "city": buckets["city"][0] if buckets["city"] else None,
            "amount": self._parse_amount(buckets["amount"][0]) if buckets["amount"] else None,
            "currency": buckets["currency"][0].upper() if buckets["currency"] else None,
            "keywords": self._extract_keywords(text),
            "languages": self._detect_languages(text),
            "custom_fields": {
                "all_entities": {
                    key.replace(" ", "_"): values for key, values in buckets.items() if values
                },
                "all_dates": parsed_dates,
            },
        }
