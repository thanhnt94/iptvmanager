import requests
import json
from datetime import datetime, timezone, timedelta

# API URL
BASE_URL = "http://localhost:5030/api/livetv"

# Login to get token (replace with your admin credentials)
# Since you have an admin user, you can use the token from your browser, 
# or for this test script, we will just interact directly with the DB since we are on the server.

print("--- Vui lòng sử dụng API trên Swagger UI hoặc liên kết Admin Panel để thêm ---")
