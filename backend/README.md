# FastAPI backend

Run from this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Copy `.env.example` to `.env`. With no Google configuration, the API uses an in-memory demo sheet so the UI remains runnable. Set `GOOGLE_SERVICE_ACCOUNT_JSON` and `DEMO_SHEET_ID` to enable live Google Sheets reads and writes.
