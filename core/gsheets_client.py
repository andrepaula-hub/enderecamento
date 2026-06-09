from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

CREDENTIALS_DIR = Path(__file__).resolve().parents[1] / ".credentials"
CLIENT_SECRET_PATH = CREDENTIALS_DIR / "client_secret.json"
TOKEN_PATH = CREDENTIALS_DIR / "token.json"
ACTIVE_SHEET_PATH = CREDENTIALS_DIR / "active_sheet.json"


class OAuthError(Exception):
    pass


def _save_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def extract_sheet_id(link_or_id: str) -> str | None:
    text = str(link_or_id or "").strip()
    if not text:
        return None
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", text)
    if match:
        return match.group(1)
    if re.match(r"^[a-zA-Z0-9-_]+$", text):
        return text
    return None


def get_credentials() -> Credentials:
    if not CLIENT_SECRET_PATH.exists():
        raise OAuthError("client_secret.json não encontrado em .credentials")

    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
        return creds

    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_PATH), SCOPES)
    creds = flow.run_local_server(port=0)
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    return creds


def set_active_sheet(link_or_id: str) -> dict[str, Any]:
    sheet_id = extract_sheet_id(link_or_id)
    if not sheet_id:
        raise ValueError("Link/ID da planilha inválido")

    creds = get_credentials()
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    try:
        metadata = service.spreadsheets().get(spreadsheetId=sheet_id).execute()
    except HttpError as exc:
        raise ValueError("Não foi possível acessar essa planilha") from exc

    payload = {
        "sheet_id": sheet_id,
        "title": metadata.get("properties", {}).get("title"),
        "url": f"https://docs.google.com/spreadsheets/d/{sheet_id}",
    }
    _save_json(ACTIVE_SHEET_PATH, payload)
    return payload


def get_active_sheet() -> dict[str, Any] | None:
    return _load_json(ACTIVE_SHEET_PATH)


def clear_active_sheet() -> None:
    if ACTIVE_SHEET_PATH.exists():
        ACTIVE_SHEET_PATH.unlink()


def col_to_letter(index: int) -> str:
    result = ""
    n = index + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result


class GSheetsClient:
    def __init__(self, sheet_id: str):
        self.sheet_id = sheet_id
        self._creds = get_credentials()
        self._sheets = build("sheets", "v4", credentials=self._creds, cache_discovery=False)
        self._drive = build("drive", "v3", credentials=self._creds, cache_discovery=False)
        self._metadata = None
        self._sheet_map: dict[str, int] = {}

    def _load_metadata(self) -> None:
        if self._metadata:
            return
        self._metadata = self._execute(self._sheets.spreadsheets().get(spreadsheetId=self.sheet_id))
        self._sheet_map = {
            s.get("properties", {}).get("title"): s.get("properties", {}).get("sheetId")
            for s in self._metadata.get("sheets", [])
        }

    def _execute(self, request: Any, *, retries: int = 6, base_sleep_s: float = 1.0) -> Any:
        last_exc: Exception | None = None
        for attempt in range(retries):
            try:
                return request.execute(num_retries=3)
            except HttpError as exc:
                last_exc = exc
                status = getattr(getattr(exc, "resp", None), "status", None)
                message = str(exc)
                retryable = status in {429, 500, 503} or "RATE_LIMIT_EXCEEDED" in message or "quotaExceeded" in message
                if not retryable or attempt >= retries - 1:
                    raise
                sleep_s = min(base_sleep_s * (2**attempt), 16.0)
                time.sleep(sleep_s)
        if last_exc:
            raise last_exc
        raise RuntimeError("Falha inesperada ao executar request do Google Sheets.")

    def get_title(self) -> str | None:
        self._load_metadata()
        return self._metadata.get("properties", {}).get("title") if self._metadata else None

    def list_sheet_names(self) -> list[str]:
        self._load_metadata()
        return list(self._sheet_map.keys())

    def get_sheet_gid(self, name: str) -> int | None:
        self._load_metadata()
        return self._sheet_map.get(name)

    def get_sheet_url(self, name: str) -> str:
        gid = self.get_sheet_gid(name)
        base = f"https://docs.google.com/spreadsheets/d/{self.sheet_id}"
        if gid is None:
            return base
        return f"{base}/edit#gid={gid}"

    def ensure_sheet(self, name: str) -> None:
        self._load_metadata()
        if name in self._sheet_map:
            return
        body = {"requests": [{"addSheet": {"properties": {"title": name}}}]}
        self._execute(self._sheets.spreadsheets().batchUpdate(spreadsheetId=self.sheet_id, body=body))
        self._metadata = None

    def clear_sheet(self, name: str) -> None:
        self.ensure_sheet(name)
        self._execute(self._sheets.spreadsheets().values().clear(
            spreadsheetId=self.sheet_id,
            range=name,
            body={},
        ))

    def insert_columns(self, name: str, start_index: int, count: int = 1) -> None:
        if count <= 0:
            return
        self._load_metadata()
        sheet_gid = self._sheet_map.get(name)
        if sheet_gid is None:
            raise ValueError(f"Aba '{name}' não encontrada")
        body = {
            "requests": [
                {
                    "insertDimension": {
                        "range": {
                            "sheetId": sheet_gid,
                            "dimension": "COLUMNS",
                            "startIndex": int(start_index),
                            "endIndex": int(start_index + count),
                        },
                        "inheritFromBefore": False,
                    }
                }
            ]
        }
        self._execute(self._sheets.spreadsheets().batchUpdate(spreadsheetId=self.sheet_id, body=body))
        self._metadata = None

    def read_values(self, name: str) -> list[list[Any]]:
        result = self._execute(self._sheets.spreadsheets().values().get(
            spreadsheetId=self.sheet_id,
            range=name,
        ))
        return result.get("values", [])

    def read_values_batch(self, names: list[str]) -> dict[str, list[list[Any]]]:
        ranges = [str(name or "").strip() for name in names if str(name or "").strip()]
        if not ranges:
            return {}
        result = self._execute(
            self._sheets.spreadsheets().values().batchGet(
                spreadsheetId=self.sheet_id,
                ranges=ranges,
            )
        )
        output: dict[str, list[list[Any]]] = {name: [] for name in ranges}
        for item in result.get("valueRanges", []) or []:
            range_name = str(item.get("range") or "")
            normalized = range_name.split("!", 1)[0].strip("'")
            if normalized in output:
                output[normalized] = item.get("values", []) or []
        return output

    def read_sheet(self, name: str) -> list[dict[str, Any]]:
        values = self.read_values(name)
        return self._rows_from_values(values)

    def read_sheets(self, names: list[str]) -> dict[str, list[dict[str, Any]]]:
        values_map = self.read_values_batch(names)
        return {name: self._rows_from_values(values_map.get(name, [])) for name in names}

    def _rows_from_values(self, values: list[list[Any]]) -> list[dict[str, Any]]:
        if not values:
            return []
        headers = [str(h).strip() if h is not None else "" for h in values[0]]
        valid_indices = [idx for idx, h in enumerate(headers) if h]
        valid_headers = [headers[idx] for idx in valid_indices]
        if not valid_headers:
            return []
        rows = []
        for raw in values[1:]:
            row = raw + [None] * (len(headers) - len(raw))
            obj = {}
            for i, header in enumerate(valid_headers):
                original_idx = valid_indices[i]
                obj[header] = row[original_idx] if original_idx < len(row) else None
            rows.append(obj)
        return rows

    def update_header(self, name: str, headers: list[str]) -> None:
        if not headers:
            return
        end_col = col_to_letter(len(headers) - 1)
        range_ = f"{name}!A1:{end_col}1"
        body = {"values": [headers]}
        self._execute(self._sheets.spreadsheets().values().update(
            spreadsheetId=self.sheet_id,
            range=range_,
            valueInputOption="RAW",
            body=body,
        ))

    def update_rows(self, name: str, row_updates: dict[int, list[Any]], header_len: int) -> None:
        if not row_updates:
            return
        end_col = col_to_letter(header_len - 1)
        data = []
        for row_num, values in row_updates.items():
            padded = values + [None] * (header_len - len(values))
            padded = ["" if v is None else v for v in padded]
            range_ = f"{name}!A{row_num}:{end_col}{row_num}"
            data.append({"range": range_, "values": [padded]})
        body = {"valueInputOption": "RAW", "data": data}
        self._execute(self._sheets.spreadsheets().values().batchUpdate(
            spreadsheetId=self.sheet_id,
            body=body,
        ))

    def append_rows(self, name: str, rows: list[list[Any]]) -> None:
        if not rows:
            return
        body = {"values": rows}
        self._execute(self._sheets.spreadsheets().values().append(
            spreadsheetId=self.sheet_id,
            range=name,
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body=body,
        ))

    def highlight_rows(
        self,
        name: str,
        row_indices: list[int],
        end_column_index: int | None = None,
        color: dict[str, float] | None = None,
    ) -> None:
        if not row_indices:
            return
        self._load_metadata()
        sheet_gid = self._sheet_map.get(name)
        if sheet_gid is None:
            raise ValueError(f"Aba '{name}' não encontrada")

        unique_rows = sorted(set(int(r) for r in row_indices if r and int(r) > 0))
        if not unique_rows:
            return

        fill_color = color or {"red": 1.0, "green": 1.0, "blue": 0.0}
        requests = []
        for row_num in unique_rows:
            grid_range: dict[str, Any] = {
                "sheetId": sheet_gid,
                "startRowIndex": row_num - 1,
                "endRowIndex": row_num,
                "startColumnIndex": 0,
            }
            if end_column_index is not None and end_column_index > 0:
                grid_range["endColumnIndex"] = int(end_column_index)
            requests.append(
                {
                    "repeatCell": {
                        "range": grid_range,
                        "cell": {
                            "userEnteredFormat": {
                                "backgroundColor": fill_color,
                                "backgroundColorStyle": {"rgbColor": fill_color},
                            }
                        },
                        "fields": "userEnteredFormat.backgroundColor,userEnteredFormat.backgroundColorStyle",
                    }
                }
            )
        chunk = 200
        for start in range(0, len(requests), chunk):
            self._execute(self._sheets.spreadsheets().batchUpdate(
                spreadsheetId=self.sheet_id,
                body={"requests": requests[start : start + chunk]},
            ))

    def update_range(self, range_: str, values: list[list[Any]]) -> None:
        if not values:
            return
        body = {"values": values}
        self._execute(self._sheets.spreadsheets().values().update(
            spreadsheetId=self.sheet_id,
            range=range_,
            valueInputOption="RAW",
            body=body,
        ))

    def delete_rows(self, name: str, row_indices: list[int]) -> None:
        if not row_indices:
            return
        self._load_metadata()
        sheet_id = self._sheet_map.get(name)
        if sheet_id is None:
            raise ValueError(f"Aba '{name}' não encontrada")

        unique_rows = sorted(set(int(r) for r in row_indices if r and r > 0), reverse=True)
        if not unique_rows:
            return

        chunk_size = 400
        for i in range(0, len(unique_rows), chunk_size):
            chunk = unique_rows[i : i + chunk_size]
            requests = [
                {
                    "deleteDimension": {
                        "range": {
                            "sheetId": sheet_id,
                            "dimension": "ROWS",
                            "startIndex": row - 1,
                            "endIndex": row,
                        }
                    }
                }
                for row in chunk
            ]
            body = {"requests": requests}
            self._execute(self._sheets.spreadsheets().batchUpdate(
                spreadsheetId=self.sheet_id,
                body=body,
            ))

    def delete_sheet(self, name: str) -> None:
        self._load_metadata()
        sheet_id = self._sheet_map.get(name)
        if sheet_id is None:
            raise ValueError(f"Aba '{name}' não encontrada")
        body = {"requests": [{"deleteSheet": {"sheetId": sheet_id}}]}
        self._execute(self._sheets.spreadsheets().batchUpdate(
            spreadsheetId=self.sheet_id,
            body=body,
        ))
        self._metadata = None

    def export_xlsx(self, output_path: Path) -> None:
        request = self._drive.files().export(
            fileId=self.sheet_id,
            mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        data = self._execute(request)
        output_path.write_bytes(data)
