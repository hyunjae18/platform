# api_gateway/test_connection.py
import httpx
import asyncio

async def test_connection():
    """Test if gateway can reach Node.js"""
    
    # Test 1: Direct Node.js connection
    print("Testing direct Node.js connection...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("http://localhost:3001/api/health")
            print(f"Node.js is reachable: {response.status_code}")
            print(f"   Response: {response.json()}")
        except Exception as e:
            print(f" Cannot reach Node.js: {e}")
            return
    
    # Test 2: Test login through gateway
    print("\nTesting login through gateway...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://localhost:8001/api/auth/login",
                json={
                    "email": "admin@docmind.local",
                    "password": "Admin123!"
                }
            )
            print(f"Gateway login response: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"   Token received: {data.get('token', 'No token')[:50]}...")
            else:
                print(f"   Error: {response.json()}")
        except Exception as e:
            print(f" Gateway login failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
