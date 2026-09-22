import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleRequest

from .config import get_settings
from . import personal_sheet_service
from .auth import SESSION_COOKIE, complete_authorization, create_authorization_url, session_from_cookie, session_from_request, sessions
from .models import Mode, RowUpdate, SheetSelection, SheetSnapshot
from .sheet_service import SheetService

settings = get_settings()
sheet_service = SheetService(settings)


class ConnectionHub:
    def __init__(self):
        self.connections: dict[str, set[WebSocket]] = {"demo": set()}

    async def connect(self, channel: str, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(channel, set()).add(websocket)

    def disconnect(self, channel: str, websocket: WebSocket):
        self.connections.setdefault(channel, set()).discard(websocket)

    async def broadcast(self, channel: str, snapshot: SheetSnapshot):
        stale = []
        for websocket in self.connections.get(channel, set()):
            try:
                await websocket.send_json(snapshot.model_dump())
            except Exception:
                stale.append(websocket)
        for websocket in stale:
                self.disconnect(channel, websocket)


hub = ConnectionHub()
last_snapshots: dict[str, SheetSnapshot | None] = {"demo": None}


async def poll_demo_sheet():
    while True:
        try:
            snapshot = await asyncio.to_thread(sheet_service.read, "demo")
            previous = last_snapshots["demo"]
            if previous is not None and previous.rows != snapshot.rows:
                await hub.broadcast("demo", snapshot)
            last_snapshots["demo"] = snapshot
        except Exception:
            pass
        await asyncio.sleep(settings.poll_interval_seconds)


async def poll_personal_sheets():
    while True:
        for session_id, session in list(sessions.items()):
            if not session.sheet_id:
                continue
            try:
                snapshot = await asyncio.to_thread(personal_sheet_service.read, session)
                previous = last_snapshots.get(session_id)
                if previous is not None and previous.rows != snapshot.rows:
                    await hub.broadcast(session_id, snapshot)
                last_snapshots[session_id] = snapshot
            except Exception:
                continue
        await asyncio.sleep(settings.poll_interval_seconds)


@asynccontextmanager
async def lifespan(_: FastAPI):
    poller = asyncio.create_task(poll_demo_sheet())
    personal_poller = asyncio.create_task(poll_personal_sheets())
    yield
    poller.cancel()
    personal_poller.cancel()
    try:
        await poller
        await personal_poller
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Bajaj Earths Sheets Sync API", version="1.0.0", lifespan=lifespan)
allowed_origins = {
    "http://localhost:5173",
    "https://bajaj-earth-assessment-m1w3-dnt4j4gsm.vercel.app",
    settings.frontend_origin.rstrip("/"),
}
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(origin for origin in allowed_origins if origin),
    allow_origin_regex=r"https://[a-z0-9-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def read_sheet(mode: Mode) -> SheetSnapshot:
    try:
        return sheet_service.read(mode)
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Google Sheets unavailable: {error}") from error


@app.get("/api/health")
async def health():
    return {"status": "ok", "environment": settings.environment, "sheets_configured": bool(sheet_service.client)}


@app.get("/api/sheets", response_model=SheetSnapshot)
async def get_sheet(mode: Mode = Query("demo")):
    return read_sheet(mode)


@app.put("/api/sheets/rows/{row_number}", response_model=SheetSnapshot)
async def update_row(row_number: int, payload: RowUpdate, request: Request, mode: Mode = Query("demo")):
    try:
        if mode == "personal":
            return await asyncio.to_thread(personal_sheet_service.update_row, session_from_request(request), row_number, payload.values)
        return await asyncio.to_thread(sheet_service.update_row, mode, row_number, payload.values)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Google Sheets unavailable: {error}") from error


@app.post("/api/sheets/rows", response_model=SheetSnapshot)
async def append_row(payload: RowUpdate, request: Request, mode: Mode = Query("demo")):
    try:
        if mode == "personal":
            return await asyncio.to_thread(personal_sheet_service.append_row, session_from_request(request), payload.values)
        return await asyncio.to_thread(sheet_service.append_row, mode, payload.values)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Google Sheets unavailable: {error}") from error


@app.delete("/api/sheets/rows/{row_number}", response_model=SheetSnapshot)
async def delete_row(row_number: int, request: Request, mode: Mode = Query("demo")):
    try:
        if mode == "personal":
            return await asyncio.to_thread(personal_sheet_service.delete_row, session_from_request(request), row_number)
        return await asyncio.to_thread(sheet_service.delete_row, mode, row_number)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Google Sheets unavailable: {error}") from error


@app.get("/api/auth/google/start")
async def google_start():
    return RedirectResponse(create_authorization_url(settings))


@app.get("/api/auth/google/callback")
async def google_callback(state: str, code: str):
    session = complete_authorization(state, code)
    response = RedirectResponse(f"{settings.frontend_origin}/?google=connected")
    response.set_cookie(SESSION_COOKIE, session.session_id, httponly=True, samesite="lax", secure=settings.environment == "production", max_age=86400)
    return response


@app.get("/api/auth/google/status")
async def google_status(request: Request):
    session = session_from_cookie(request.cookies.get(SESSION_COOKIE))
    return {"connected": session is not None, "email": session.email if session else "", "has_sheet": bool(session and session.sheet_id)}


@app.get("/api/auth/google/picker-token")
async def picker_token(request: Request):
    session = session_from_request(request)
    if session.credentials.expired and session.credentials.refresh_token:
        session.credentials.refresh(GoogleRequest())
    return {"access_token": session.credentials.token}


@app.post("/api/auth/google/select", response_model=SheetSnapshot)
async def select_google_sheet(request: Request, payload: SheetSelection):
    session = session_from_request(request)
    try:
        return await asyncio.to_thread(personal_sheet_service.select, session, payload.spreadsheet_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Google Sheet unavailable: {error}") from error


@app.post("/api/auth/google/create", response_model=SheetSnapshot)
async def create_google_sheet(request: Request):
    session = session_from_request(request)
    try:
        return await asyncio.to_thread(personal_sheet_service.create, session)
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Unable to create Google Sheet: {error}") from error


@app.websocket("/ws/sync")
async def sync_socket(websocket: WebSocket, mode: Mode = Query("demo")):
    session = session_from_cookie(websocket.cookies.get(SESSION_COOKIE)) if mode == "personal" else None
    if mode == "personal" and session is None:
        await websocket.close(code=4401)
        return
    channel = session.session_id if session else "demo"
    await hub.connect(channel, websocket)
    try:
        snapshot = read_sheet("demo") if mode == "demo" else await asyncio.to_thread(personal_sheet_service.read, session)
        await websocket.send_json(snapshot.model_dump())
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, RuntimeError):
        hub.disconnect(channel, websocket)
