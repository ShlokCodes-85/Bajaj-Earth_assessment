import json
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials

from .config import Settings

OAUTH_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]
SESSION_COOKIE = "sheets_sync_session"


@dataclass
class UserSession:
    session_id: str
    credentials: Credentials
    email: str = ""
    sheet_id: str = ""


pending_flows: dict[str, Flow] = {}
sessions: dict[str, UserSession] = {}


def _client_config(settings: Settings) -> dict[str, Any]:
    source = settings.google_oauth_client_json.strip()
    if not source:
        raise HTTPException(status_code=501, detail="GOOGLE_OAUTH_CLIENT_JSON is not configured.")
    if source.startswith("{"):
        return json.loads(source)
    return json.loads(Path(source).read_text(encoding="utf-8"))


def create_authorization_url(settings: Settings) -> str:
    flow = Flow.from_client_config(_client_config(settings), scopes=OAUTH_SCOPES)
    flow.redirect_uri = settings.google_oauth_redirect_uri
    authorization_url, state = flow.authorization_url(
        access_type="offline", include_granted_scopes="true", prompt="consent"
    )
    pending_flows[state] = flow
    return authorization_url


def complete_authorization(state: str, code: str) -> UserSession:
    flow = pending_flows.pop(state, None)
    if flow is None:
        raise HTTPException(status_code=400, detail="OAuth state is invalid or expired.")
    flow.fetch_token(code=code)
    credentials = flow.credentials
    session_id = secrets.token_urlsafe(32)
    session = UserSession(session_id=session_id, credentials=credentials)
    sessions[session_id] = session
    return session


def session_from_request(request: Request) -> UserSession:
    session_id = request.cookies.get(SESSION_COOKIE)
    session = sessions.get(session_id or "")
    if session is None:
        raise HTTPException(status_code=401, detail="Connect a Google account first.")
    return session


def session_from_cookie(session_id: str | None) -> UserSession | None:
    return sessions.get(session_id or "")
