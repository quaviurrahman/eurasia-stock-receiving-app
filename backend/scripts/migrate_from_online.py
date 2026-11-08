"""One-time copy of all data (records, photos, signatures) from the online app into this local install.

Usage (inside the backend container):
  python scripts/migrate_from_online.py --source https://ONLINE-URL --email ADMIN_EMAIL --password 'ADMIN_PASSWORD'
"""
import argparse
import os
import sys
import tempfile
import zipfile
from pathlib import Path

import requests
from bson import json_util
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from local_storage import LocalStore  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="Online app URL, e.g. https://myapp.emergent.host")
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--no-files", action="store_true", help="Skip photos/signatures")
    args = ap.parse_args()

    base = args.source.rstrip("/")
    print(f"Signing in to {base} ...")
    r = requests.post(f"{base}/api/auth/login", json={"email": args.email, "password": args.password}, timeout=60)
    if r.status_code != 200:
        sys.exit(f"Login failed ({r.status_code}): {r.text[:200]}")
    token = r.json()["access_token"]

    print("Downloading full export (this can take a few minutes) ...")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    with requests.get(
        f"{base}/api/admin/backup",
        params={"includeFiles": str(not args.no_files).lower()},
        headers={"Authorization": f"Bearer {token}"},
        stream=True,
        timeout=900,
    ) as resp:
        if resp.status_code != 200:
            sys.exit(f"Export failed ({resp.status_code}). Is the online app published with the latest code?")
        for chunk in resp.iter_content(1024 * 1024):
            tmp.write(chunk)
    tmp.close()

    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    store = LocalStore(os.environ["LOCAL_STORAGE_DIR"])
    files = 0
    with zipfile.ZipFile(tmp.name) as z:
        for n in z.namelist():
            if n.startswith("db/") and n.endswith(".json"):
                name = n[3:-5]
                docs = json_util.loads(z.read(n))
                db[name].delete_many({})
                if docs:
                    db[name].insert_many(docs)
                print(f"  {name}: {len(docs)}")
            elif n.startswith("files/") and not n.endswith("/"):
                store.put(n[6:], z.read(n))
                files += 1
        manifest = json_util.loads(z.read("manifest.json"))
    os.unlink(tmp.name)
    print(f"  files: {files}")
    if manifest.get("missingFiles"):
        print(f"  WARNING: {len(manifest['missingFiles'])} file(s) could not be read on the online side")
    print("Done. Restart the backend, then sign in with your ONLINE admin account.")


if __name__ == "__main__":
    main()
