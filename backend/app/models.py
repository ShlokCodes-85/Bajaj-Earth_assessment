from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["demo", "personal"]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RowUpdate(BaseModel):
    values: tuple[str, str, str] = Field(..., min_length=3, max_length=3)


class SheetSelection(BaseModel):
    spreadsheet_id: str = Field(..., min_length=20)


class Row(BaseModel):
    row_number: int
    values: tuple[str, str, str]


class SheetSnapshot(BaseModel):
    mode: Mode
    sheet_id: str
    sheet_name: str
    rows: list[Row]
    updated_at: str
