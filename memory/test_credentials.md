# Test Credentials

No authentication required for this application.
The app is an email checker utility - no login system.

## API Endpoints
- `POST /api/check-email` - body: `{"email": "test@example.com"}`
- `POST /api/check-emails-file` - multipart file upload (.txt or .csv)
- `POST /api/check-emails` - body: `{"emails": ["a@b.com"], "concurrency": 5, "delay": 0.5}`
- `GET /api/checker-script` - downloads checker.py
