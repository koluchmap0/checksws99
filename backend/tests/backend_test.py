"""
Backend tests for Bonmont Email Checker API.
NOTE: Several endpoints make real HTTP requests to bonmont.com (slow, up to 15-30s).
"""
import os
import io
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
    with open(env_path) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _load_backend_url()

TIMEOUT = 60


@pytest.fixture
def api_client():
    s = requests.Session()
    return s


# ---- Root / welcome ----
class TestRoot:
    def test_root_welcome(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "message" in data
        assert isinstance(data["message"], str)
        assert len(data["message"]) > 0


# ---- Single email check (real external request) ----
class TestCheckEmail:
    def test_check_invalid_email(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/check-email",
            json={"email": "nonexistent12345@gmail.com"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == "nonexistent12345@gmail.com"
        assert data["status"] in ("invalid", "valid", "error")
        # Expect invalid for a clearly non-registered email
        print(f"Single check status: {data['status']} detail={data.get('detail')}")
        assert data["status"] == "invalid"

    def test_check_email_missing_field(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/check-email", json={}, timeout=30)
        assert r.status_code == 422


# ---- File upload batch check (real external) ----
class TestCheckEmailsFile:
    def test_upload_txt_file(self, api_client):
        content = "nonexistent99999@gmail.com\nanother_fake_1234@gmail.com\n"
        files = {"file": ("emails.txt", io.BytesIO(content.encode()), "text/plain")}
        r = api_client.post(f"{BASE_URL}/api/check-emails-file", files=files, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 2
        assert isinstance(data["results"], list)
        assert len(data["results"]) == 2
        for item in data["results"]:
            assert "email" in item
            assert "status" in item
        print(f"Batch results: {data['results']}")

    def test_upload_empty_file(self, api_client):
        files = {"file": ("empty.txt", io.BytesIO(b"no-emails-here\n"), "text/plain")}
        r = api_client.post(f"{BASE_URL}/api/check-emails-file", files=files, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 0
        assert "error" in data


# ---- Checker script download ----
class TestCheckerScript:
    def test_download_script(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/checker-script", timeout=30)
        assert r.status_code == 200, r.text
        assert "argparse" in r.text or "def main" in r.text
        assert "bonmont.com" in r.text
