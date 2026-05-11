import os
from supabase import create_client

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not url or not key:
    print("Missing Supabase credentials")
    exit(1)

supabase = create_client(url, key)
# Supabase python client doesn't support raw SQL queries easily via data API.
# We might need to use the postgres URL or just do it.
