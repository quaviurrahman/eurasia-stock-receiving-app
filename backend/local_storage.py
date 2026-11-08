"""Disk-backed file storage, used only for self-hosted installs (LOCAL_STORAGE_DIR set)."""
import mimetypes
from pathlib import Path


class LocalStore:
    def __init__(self, base: str):
        self.base = Path(base).resolve()
        self.base.mkdir(parents=True, exist_ok=True)

    def _full(self, path: str) -> Path:
        full = (self.base / path).resolve()
        if self.base not in full.parents:
            raise ValueError("Invalid path")
        return full

    def put(self, path: str, data: bytes) -> dict:
        full = self._full(path)
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(data)
        return {"path": path, "size": len(data)}

    def get(self, path: str):
        full = self._full(path)
        if not full.is_file():
            raise FileNotFoundError(path)
        return full.read_bytes(), mimetypes.guess_type(full.name)[0] or "application/octet-stream"
