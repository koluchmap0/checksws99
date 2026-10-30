"""
Backend tests for Bonmont Email Checker API.
NOTE: Several endpoints make real HTTP requests to bonmont.com (slow, up to 15-30s).
"""
import os
import io
import json
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


# ---- SSE streaming batch check (real external) ----
class TestCheckEmailsStream:
    def test_stream_two_emails(self, api_client):
        content = "nonexistent77777@gmail.com\nanother_fake_9876@gmail.com\n"
        files = {"file": ("emails.txt", io.BytesIO(content.encode()), "text/plain")}
        r = api_client.post(
            f"{BASE_URL}/api/check-emails-stream",
            files=files,
            timeout=90,
            stream=True,
        )
        assert r.status_code == 200, r.text
        assert "text/event-stream" in r.headers.get("content-type", "")

        events = []
        raw_lines = []
        for raw in r.iter_lines(decode_unicode=True):
            if not raw:
                continue
            raw_lines.append(raw)
            assert raw.startswith("data: "), f"Line not SSE formatted: {raw}"
            payload = json.loads(raw[len("data: "):])
            events.append(payload)

        types = [e.get("type") for e in events]
        print(f"SSE event types: {types}")
        # Verify start, result(s), complete
        assert types[0] == "start", f"first event should be start, got {types}"
        assert types[0] == "start" and events[0]["total"] == 2
        assert types[-1] == "complete", f"last event should be complete, got {types}"
        assert events[-1]["total"] == 2

        result_events = [e for e in events if e.get("type") == "result"]
        assert len(result_events) == 2, f"expected 2 result events, got {len(result_events)}"
        for i, re_ev in enumerate(result_events, start=1):
            assert "result" in re_ev
            assert "email" in re_ev["result"]
            assert "status" in re_ev["result"]
            assert re_ev["processed"] == i
            assert re_ev["total"] == 2
            assert "progress" in re_ev
        # progress should reach 100 on last result
        assert result_events[-1]["progress"] == 100.0

    def test_stream_empty_file(self, api_client):
        files = {"file": ("empty.txt", io.BytesIO(b"no-valid-lines\n"), "text/plain")}
        r = api_client.post(
            f"{BASE_URL}/api/check-emails-stream",
            files=files,
            timeout=30,
            stream=True,
        )
        assert r.status_code == 200, r.text
        events = []
        for raw in r.iter_lines(decode_unicode=True):
            if not raw:
                continue
            assert raw.startswith("data: ")
            events.append(json.loads(raw[len("data: "):]))
        assert len(events) == 1
        assert events[0]["type"] == "error"


# ---- Checker script download ----
class TestCheckerScript:
    def test_download_script(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/checker-script", timeout=30)
        assert r.status_code == 200, r.text
        assert "argparse" in r.text or "def main" in r.text
        assert "bonmont.com" in r.text
