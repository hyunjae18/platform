import time
import requests
import json

API_URL = "http://localhost:8004"

# 1. Mimic your real OCR structure
payload = {
  "document_id": "qos-test-doc",
  "ocr_result": {
    "raw_text": "CERTIFICAT DE VIE\nNous, soussignés : Certifions que M/Mme TASSADIT MOUHOUBI\nNé(e) le : 12/10/1944\nRésidant à : PK 17 06000 BEJAIA RP ALGERIE",
    "languages_detected": ["fr"]
  }
}

def measure_api_qos():
    # Step A: Get Authentication Token [cite: 3]
    print("Fetching token from service...")
    token_resp = requests.post(f"{API_URL}/token", json={"service_name": "qos-tester"})
    token_data = token_resp.json()
    access_token = token_data["access_token"]
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    # Step B: Hit /extract and time the network roundtrip
    print("Sending document extraction request...")
    start_time = time.perf_counter()
    
    response = requests.post(f"{API_URL}/extract", json=payload, headers=headers)
    
    end_time = time.perf_counter()
    total_roundtrip_ms = (end_time - start_time) * 1000

    if response.status_code == 200:
        result = response.json()
        print("\n================ API QoS PERFORMANCE ================")
        print(f"Total API Roundtrip Time : {round(total_roundtrip_ms, 2)} ms")
        print(f"HTTP Status Code        : {response.status_code}")
        print("=====================================================\n")
        print("Response Body:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"Failed with status code {response.status_code}: {response.text}")

if __name__ == "__main__":
    measure_api_qos()
