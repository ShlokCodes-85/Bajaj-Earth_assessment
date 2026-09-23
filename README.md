# Bajaj Earths Sheets Sync

Real-time Google Sheets to web synchronization for the Bajaj Earths technical task. The deployed application is available at:

- Frontend: `https://bajaj-earth-assessment-m1w3-kkma0s2a9.vercel.app/`
- Backend: `https://bajaj-earth-assessment.onrender.com`

## Stack

- Frontend: React, Vite, JavaScript, Tailwind CSS v4, Lucide icons
- Backend: Python, FastAPI, gspread, Google Sheets API
- Live updates: FastAPI polling every 10 seconds plus WebSocket push
- Deployment: Vercel frontend with a Render FastAPI backend

The application uses one Python backend service. There is no separate Node.js API layer.

## Structure

```text
Bajaj-Earth_assessment/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── config.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── personal_sheet_service.py
│   │   └── sheet_service.py
│   ├── README.md
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   ├── bajaj-earths-logo.png
│   │   ├── privacy.html
│   │   └── terms.html
│   ├── src/
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── vercel.json
│   └── vite.config.js
├── .gitignore
├── LICENSE
└── README.md```

## Run Locally

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Create env files and add appropriate api keys
uvicorn app.main:app --reload --port 8000
```

Frontend, in a second terminal:

```powershell
cd frontend
npm install
Create env files and add appropriate api keys
npm run dev
```

Open `https://bajaj-earth-assessment-m1w3-kkma0s2a9.vercel.app/`. Without Google credentials, the backend uses an in-memory demo sheet seeded with four rows, so the complete demo UI and API flow is runnable locally.

## Google Sheets Setup

1. Enable the Google Sheets API in Google Cloud.
2. Create a service account and share the target spreadsheet with its email as Editor.
3. For Personal mode, also enable the Google Drive API and Google Picker API.
4. Create a Google OAuth web client and add the callback URL shown below.
5. Set these backend variables in `backend/.env`:

```env
FRONTEND_ORIGIN=http://your-frontend-domain
POLL_INTERVAL_SECONDS=10
DEMO_SHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_OAUTH_CLIENT_JSON=path/to/oauth_client.json
GOOGLE_OAUTH_REDIRECT_URI=http://your-backend-domain/api/auth/google/callback
SESSION_SECRET=generate-a-long-random-secret
```

Credentials stay server-side and are never bundled into React.

## Sync Contract

- `GET /api/sheets?mode=demo` reads data from `A1:C`; the UI supplies its own Column A/B/C labels separately.
- `PUT /api/sheets/rows/{row_number}?mode=demo` writes only the selected row range.
- `POST /api/sheets/rows?mode=demo` appends one row.
- `DELETE /api/sheets/rows/{row_number}?mode=demo` removes one complete row and shifts later rows up.
- The background task diffs snapshots every ten seconds and broadcasts changes over `/ws/sync`.
- The frontend applies pushed snapshots without a page reload.

Google Sheets has no native edit webhook for this workflow, so polling provides an expected 3–5 second sheet-to-web propagation window with a simple free-tier deployment. Free-tier cold starts may add extra delay after inactivity.

## Personal Mode

Personal mode is implemented with Google authorization-code OAuth, an HttpOnly in-memory session cookie, Google Picker selection, create-new-sheet support, and session-scoped polling/WebSocket updates. Set `VITE_GOOGLE_API_KEY` in the frontend environment for Picker. Enable Google Sheets API, Google Drive API, and Google Picker API in Google Cloud.

For production, set `FRONTEND_ORIGIN`, `GOOGLE_OAUTH_REDIRECT_URI`, and the OAuth client redirect URI to the deployed domains. Keep `GOOGLE_OAUTH_CLIENT_JSON`, `GOOGLE_SERVICE_ACCOUNT_JSON`, and `SESSION_SECRET` backend-only.

## Deployment

### Vercel frontend

Set the Vercel project root directory to `frontend`.

```text
Install command: npm ci
Build command: npm run build
Output directory: dist
```

Set these Vercel environment variables:

```env
VITE_API_URL=https://your-backend-domain
VITE_WS_URL=wss://your-backend-domain
VITE_GOOGLE_API_KEY=your_browser_restricted_google_api_key
```

`VITE_GOOGLE_API_KEY` is required only for the Personal mode Google Picker.

### Render backend

Set the Render service root directory to `backend`.

```text
Build command: pip install -r requirements.txt
Start command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health check path: /api/health
```

Set these Render environment variables:

```env
ENVIRONMENT=production
FRONTEND_ORIGIN=https://your-frontend-domain
POLL_INTERVAL_SECONDS=10
DEMO_SHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_JSON=your_complete_service_account_json
GOOGLE_OAUTH_CLIENT_JSON=your_complete_oauth_client_json
GOOGLE_OAUTH_REDIRECT_URI=https://your-backend-domain/api/auth/google/callback
SESSION_SECRET=your_long_random_secret
```

The Google OAuth consent configuration must include:

```text
https://your-backend-domain/api/auth/google/callback
```

The backend CORS allowlist includes the deployed Vercel origin and local development origin. The `FRONTEND_ORIGIN` setting is also included so a custom frontend domain can be added without changing application code.

## Known limitations and future extensions

- Personal sessions and OAuth tokens are stored in memory and reset on a backend restart or redeploy.
- Conflict resolution for simultaneous cell edits is not implemented.
- Multiple spreadsheet tabs are not supported.
- Authentication is Google OAuth only; email/password authentication is out of scope.
- Rate-limit handling for heavy concurrent polling is not implemented.
