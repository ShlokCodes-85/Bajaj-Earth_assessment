from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .auth import UserSession
from .models import Row, SheetSnapshot, utc_now


def _service(session: UserSession):
    return build("sheets", "v4", credentials=session.credentials, cache_discovery=False)


def read(session: UserSession) -> SheetSnapshot:
    if not session.sheet_id:
        raise ValueError("Choose or create a personal spreadsheet first.")
    service = _service(session)
    spreadsheet = service.spreadsheets().get(
        spreadsheetId=session.sheet_id,
        fields="spreadsheetId,properties(title),sheets(properties(sheetId,title,index))",
    ).execute()
    first_sheet = spreadsheet["sheets"][0]["properties"]
    result = service.spreadsheets().values().get(
        spreadsheetId=session.sheet_id, range=f"'{first_sheet['title']}'!A1:C"
    ).execute()
    values = result.get("values", [])
    rows = [Row(row_number=index + 1, values=tuple((row + ["", "", ""])[:3])) for index, row in enumerate(values) if any(row)]
    return SheetSnapshot(
        mode="personal", sheet_id=session.sheet_id, sheet_name=spreadsheet["properties"]["title"], rows=rows, updated_at=utc_now()
    )


def select(session: UserSession, sheet_id: str) -> SheetSnapshot:
    session.sheet_id = sheet_id
    try:
        return read(session)
    except HttpError as error:
        session.sheet_id = ""
        raise ValueError("The selected spreadsheet is not accessible with this Google account.") from error


def create(session: UserSession) -> SheetSnapshot:
    service = _service(session)
    spreadsheet = service.spreadsheets().create(body={"properties": {"title": "Bajaj Earths Personal Sheet"}}).execute()
    session.sheet_id = spreadsheet["spreadsheetId"]
    service.spreadsheets().values().update(
        spreadsheetId=session.sheet_id,
        range="A1:C1",
        valueInputOption="USER_ENTERED",
        body={"values": [["", "", ""]]},
    ).execute()
    return read(session)


def update_row(session: UserSession, row_number: int, values: tuple[str, str, str]) -> SheetSnapshot:
    if row_number < 1:
        raise ValueError("Row number must be positive.")
    service = _service(session)
    service.spreadsheets().values().update(
        spreadsheetId=session.sheet_id,
        range=f"A{row_number}:C{row_number}",
        valueInputOption="USER_ENTERED",
        body={"values": [list(values)]},
    ).execute()
    return read(session)


def append_row(session: UserSession, values: tuple[str, str, str]) -> SheetSnapshot:
    service = _service(session)
    service.spreadsheets().values().append(
        spreadsheetId=session.sheet_id,
        range="A:C",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [list(values)]},
    ).execute()
    return read(session)


def delete_row(session: UserSession, row_number: int) -> SheetSnapshot:
    if row_number < 1:
        raise ValueError("Row number must be positive.")
    service = _service(session)
    snapshot = read(session)
    first_sheet = service.spreadsheets().get(
        spreadsheetId=session.sheet_id,
        fields="sheets(properties(sheetId,title,index))",
    ).execute()["sheets"][0]["properties"]
    service.spreadsheets().batchUpdate(
        spreadsheetId=session.sheet_id,
        body={"requests": [{"deleteDimension": {"range": {
            "sheetId": first_sheet["sheetId"],
            "dimension": "ROWS",
            "startIndex": row_number - 1,
            "endIndex": row_number,
        }}}]},
    ).execute()
    return read(session)
