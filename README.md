# Sheets Sync

Real-time Google Sheets to web synchronization for the Bajaj Earths technical task.

## Stack

- Frontend: React, Vite, JavaScript, Tailwind CSS v4, Lucide icons
- Backend: Python, FastAPI, gspread, Google Sheets API
- Live updates: FastAPI polling every 3 seconds plus WebSocket push
- Hosting target: Vercel/Netlify for the frontend and Render/Railway for the backend

## Structure

```text
frontend/
	src/App.jsx          dashboard and sync state
	src/api.js           REST and WebSocket contract
	src/styles.css       Tailwind theme and motion
	vite.config.js
backend/
	app/main.py          REST routes, WebSocket endpoint, polling lifecycle
	app/models.py        request and snapshot models
	app/sheet_service.py Google Sheets adapter and demo fallback
	app/config.py        environment settings
```

## Run Locally

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

Frontend, in a second terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. Without Google credentials, the backend uses an in-memory demo sheet seeded with four rows, so the complete UI and API flow is runnable locally.

## Google Sheets Setup

1. Enable the Google Sheets API in Google Cloud.
2. Create a service account and share the target spreadsheet with its email as Editor.
3. Set these backend variables in `backend/.env`:

```env
FRONTEND_ORIGIN=http://localhost:5173
POLL_INTERVAL_SECONDS=3
DEMO_SHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_OAUTH_CLIENT_JSON=path/to/oauth_client.json
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
SESSION_SECRET=generate-a-long-random-secret
```

Credentials stay server-side and are never bundled into React.

## Sync Contract

- `GET /api/sheets?mode=demo` reads data from `A1:C`; the UI supplies its own Column A/B/C labels separately.
- `PUT /api/sheets/rows/{row_number}?mode=demo` writes only the selected row range.
- `POST /api/sheets/rows?mode=demo` appends one row.
- The background task diffs snapshots every three seconds and broadcasts changes over `/ws/sync`.
- The frontend applies pushed snapshots without a page reload.

Google Sheets has no native edit webhook for this workflow, so polling provides an expected 3-5 second sheet-to-web propagation window with a simple free-tier deployment.

## Personal Mode

Personal mode is implemented with Google authorization-code OAuth, an HttpOnly in-memory session cookie, Google Picker selection, create-new-sheet support, and session-scoped polling/WebSocket updates. Set `VITE_GOOGLE_API_KEY` in the frontend environment for Picker. Enable Google Sheets API, Google Drive API, and Google Picker API in Google Cloud.

For production, set `FRONTEND_ORIGIN`, `GOOGLE_OAUTH_REDIRECT_URI`, and the OAuth client redirect URI to the deployed domains. Keep `GOOGLE_OAUTH_CLIENT_JSON`, `GOOGLE_SERVICE_ACCOUNT_JSON`, and `SESSION_SECRET` backend-only.

## Deployment

Build the frontend with `npm run build` and deploy `frontend/dist` to Vercel or Netlify. Run the backend with `uvicorn app.main:app --host 0.0.0.0 --port $PORT` on Render or Railway. Set `VITE_API_URL` and `VITE_WS_URL` when the services use separate deployed origins.

Persistent sessions, conflict resolution, multiple tabs, and rate-limit handling remain future extensions as specified by the PRD.