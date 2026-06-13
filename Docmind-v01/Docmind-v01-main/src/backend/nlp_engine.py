import sys
import json
import spacy
import re

# تحميل مودل اللغة الإنجليزية الصغير والسريع
try:
    nlp = spacy.load("en_core_web_sm")
except:
    # في حالة لم يتم تحميل المودل، نرجع خطأ JSON
    print(json.dumps({"error": "Model 'en_core_web_sm' not found. Run: python -m spacy download en_core_web_sm"}))
    sys.exit(1)

def extract_metadata(text):
    doc = nlp(text)
    
    # 1. استخراج الإيميلات باستخدام Regex (لأنها أدق من NLP أحياناً)
    emails = re.findall(r'[\w\.-]+@[\w\.-]+', text)
    
    # 2. استخراج الكيانات (Dates, Money, Organizations)
    dates = []
    money = []
    orgs = []
    
    for ent in doc.ents:
        if ent.label_ == "DATE":
            dates.append(ent.text)
        elif ent.label_ == "MONEY":
            money.append(ent.text)
        elif ent.label_ == "ORG":
            orgs.append(ent.text)

    # 3. تنظيف البيانات (إزالة التكرار)
    return {
        "summary": text[:100] + "..." if len(text) > 100 else text,
        "emails": list(set(emails)),
        "dates": list(set(dates)),
        "money": list(set(money)),
        "organizations": list(set(orgs)),
        "language": "en" # يمكن تطويره للكشف عن اللغة
    }

if __name__ == "__main__":
    # قراءة النص من الـ Arguments القادمة من Node.js
    try:
        input_text = sys.argv[1]
        result = extract_metadata(input_text)
        print(json.dumps(result)) # طباعة النتيجة كـ JSON ليقرأها Node.js
    except Exception as e:
        print(json.dumps({"error": str(e)}))