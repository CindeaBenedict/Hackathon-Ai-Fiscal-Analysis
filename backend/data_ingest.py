import csv
import io
import json
from typing import List

from openpyxl import load_workbook

from models import DataFileSummary


def _coerce_rows_to_dicts(rows: list, columns: List[str]) -> List[dict]:
    coerced: List[dict] = []
    for row in rows:
        if isinstance(row, dict):
            coerced.append(row)
            continue
        if isinstance(row, list):
            item = {}
            for idx, value in enumerate(row):
                key = columns[idx] if idx < len(columns) else f"col_{idx+1}"
                item[key] = value
            coerced.append(item)
    return coerced


def parse_csv_bytes(content: bytes) -> tuple[List[str], List[dict]]:
    text = content.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    columns = list(reader.fieldnames or [])
    return columns, rows


def parse_json_bytes(content: bytes) -> tuple[List[str], List[dict]]:
    data = json.loads(content.decode("utf-8", errors="replace"))
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        raise ValueError("JSON must be an object or array of objects.")

    if not data:
        return [], []

    rows = _coerce_rows_to_dicts(data, [])
    columns: List[str] = sorted(
        {key for row in rows if isinstance(row, dict) for key in row.keys()}
    )
    return columns, rows


def parse_excel_bytes(content: bytes) -> tuple[List[str], List[dict]]:
    workbook = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    sheet = workbook.active
    values = list(sheet.values)
    if not values:
        return [], []

    headers = [str(cell) if cell is not None else "" for cell in values[0]]
    headers = [header if header else f"col_{idx+1}" for idx, header in enumerate(headers)]

    rows: List[dict] = []
    for row in values[1:]:
        rows.append(
            {headers[idx]: row[idx] if idx < len(row) else None for idx in range(len(headers))}
        )
    return headers, rows


def summarize_file(
    file_id: str,
    filename: str,
    file_type: str,
    columns: List[str],
    rows: List[dict],
    uploaded_at: str,
) -> DataFileSummary:
    return DataFileSummary(
        id=file_id,
        name=filename,
        file_type=file_type,
        rows=len(rows),
        columns=columns,
        sample_rows=rows[:5],
        uploaded_at=uploaded_at,
    )
