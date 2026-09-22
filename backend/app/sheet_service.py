import json
from pathlib import Path
from threading import Lock

import gspread
from google.oauth2.service_account import Credentials

from .config import Settings
from .models import Row, SheetSnapshot, utc_now

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
SEED_ROWS = [("Apple", "12", "Fruit"), ("Carrot", "40", "Vegetable"), ("Almond", "8", "Nut"), ("Basil", "15", "Herb")]


class SheetService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.lock = Lock()
        self.demo_rows: list[tuple[str, str, str]] = list(SEED_ROWS)
        self.demo_snapshot = self._demo_snapshot()
        self.client = self._build_client()

    def _build_client(self):
        if not self.settings.google_service_account_json or not self.settings.demo_sheet_id:
            return None
        try:
            credential_source = self.settings.google_service_account_json.strip()
            if credential_source.startswith("{"):
                credentials_info = json.loads(credential_source)
            else:
                credentials_info = json.loads(Path(credential_source).read_text(encoding="utf-8"))
            credentials = Credentials.from_service_account_info(credentials_info, scopes=SCOPES)
            return gspread.authorize(credentials)
        except (OSError, ValueError, json.JSONDecodeError, KeyError):
            return None

    def _demo_snapshot(self) -> SheetSnapshot:
        return SheetSnapshot(
            mode="demo", sheet_id=self.settings.demo_sheet_id or "demo-sheet-001", sheet_name="Bajaj Earths Demo",
            rows=[Row(row_number=index + 1, values=values) for index, values in enumerate(self.demo_rows)], updated_at=utc_now(),
        )

    def _spreadsheet(self):
        if not self.client or not self.settings.demo_sheet_id:
            return None
        return self.client.open_by_key(self.settings.demo_sheet_id)

    def read(self, mode: str) -> SheetSnapshot:
        if mode == "personal":
            raise ValueError("Personal mode requires Google OAuth and sheet selection.")
        spreadsheet = self._spreadsheet()
        if spreadsheet is None:
            with self.lock:
                self.demo_snapshot = self._demo_snapshot()
                return self.demo_snapshot
        worksheet = spreadsheet.sheet1
        values = worksheet.get("A1:C")
        rows = [Row(row_number=index + 1, values=tuple((row + ["", "", ""])[:3])) for index, row in enumerate(values) if any(row)]
        return SheetSnapshot(mode="demo", sheet_id=self.settings.demo_sheet_id, sheet_name=spreadsheet.title, rows=rows, updated_at=utc_now())

    def update_row(self, mode: str, row_number: int, values: tuple[str, str, str]) -> SheetSnapshot:
        if mode == "personal":
            raise ValueError("Personal mode requires Google OAuth and sheet selection.")
        if row_number < 1:
            raise ValueError("Row number must be positive.")
        spreadsheet = self._spreadsheet()
        if spreadsheet is None:
            with self.lock:
                index = row_number - 1
                while len(self.demo_rows) <= index:
                    self.demo_rows.append(("", "", ""))
                self.demo_rows[index] = values
            return self._demo_snapshot()
        worksheet = spreadsheet.sheet1
        worksheet.update(f"A{row_number}:C{row_number}", [list(values)], value_input_option="USER_ENTERED")
        return self.read(mode)

    def append_row(self, mode: str, values: tuple[str, str, str]) -> SheetSnapshot:
        if mode == "personal":
            raise ValueError("Personal mode requires Google OAuth and sheet selection.")
        spreadsheet = self._spreadsheet()
        if spreadsheet is None:
            with self.lock:
                self.demo_rows.append(values)
            return self._demo_snapshot()
        worksheet = spreadsheet.sheet1
        worksheet.append_row(list(values), value_input_option="USER_ENTERED")
        return self.read(mode)

    def delete_row(self, mode: str, row_number: int) -> SheetSnapshot:
        if mode == "personal":
            raise ValueError("Personal mode requires Google OAuth and sheet selection.")
        if row_number < 1:
            raise ValueError("Row number must be positive.")
        spreadsheet = self._spreadsheet()
        if spreadsheet is None:
            with self.lock:
                index = row_number - 1
                if index >= len(self.demo_rows):
                    raise ValueError("Row does not exist.")
                self.demo_rows.pop(index)
            return self._demo_snapshot()
        worksheet = spreadsheet.sheet1
        worksheet.delete_rows(row_number)
        return self.read(mode)
