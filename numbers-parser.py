"""
numbers-parser.py

Reads the master Apple Numbers database (.numbers) DIRECTLY - no conversion
to Excel, no LibreOffice, no data loss. Uses the `numbers-parser` library,
which reads the native iWork archive format.

A Numbers document can have multiple TABLES per SHEET (the "canvas" layout
Apple uses), unlike Excel's one-grid-per-sheet model. This script handles
that: each (sheet, table) pair becomes one dataset. If a sheet has only one
table, the dataset is just named after the sheet; if it has several, it's
named "SheetName - TableName" so nothing collides.

Output schema matches what generate-json.js expects - that script is
unchanged.

Usage: python3 scripts/numbers-parser.py [path-to-.numbers]
Defaults to ./source/database.numbers if no path is given.
"""

import sys
import os
import json
from datetime import datetime, date

try:
    from numbers_parser import Document
except ImportError:
    print(
        "[numbers-parser] ERROR: the 'numbers-parser' package is not installed.\n"
        "                 Run: pip install -r requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

INPUT_PATH = sys.argv[1] if len(sys.argv) > 1 else "./source/database.numbers"
OUTPUT_DIR = "./tmp-data"


def log(msg):
    print(f"[numbers-parser] {msg}")


def fail(msg):
    print(f"[numbers-parser] ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def normalize(value):
    """Keep numbers/bools as-is, turn dates into ISO strings, trim strings,
    collapse empty strings to None so downstream 'is this row empty' checks work."""
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed if trimmed != "" else None
    return value


def parse_document(input_path):
    if not os.path.exists(input_path):
        fail(
            f'Numbers file not found at "{input_path}". '
            f"Pass a path: python3 scripts/numbers-parser.py path/to/file.numbers"
        )

    log(f"Reading document: {input_path}")
    doc = Document(input_path)

    result = {
        "sourceFile": os.path.basename(input_path),
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "sheets": {},
    }

    for sheet in doc.sheets:
        multi_table = len(sheet.tables) > 1

        for table in sheet.tables:
            key = sheet.name if not multi_table else f"{sheet.name} - {table.name}"

            raw_rows = table.rows(values_only=True)

            if not raw_rows:
                result["sheets"][key] = {
                    "rowCount": 0,
                    "skippedRows": 0,
                    "columns": [],
                    "rows": [],
                }
                log(f'"{key}": empty table, skipped')
                continue

            # First row = header
            header = [
                (str(h).strip() if h is not None and str(h).strip() != "" else f"col_{i}")
                for i, h in enumerate(raw_rows[0])
            ]
            data_rows = raw_rows[1:]

            cleaned_rows = []
            skipped = 0
            for row in data_rows:
                obj = {}
                for col_name, val in zip(header, row):
                    obj[col_name] = normalize(val)
                if all(v is None for v in obj.values()):
                    skipped += 1
                    continue
                cleaned_rows.append(obj)

            result["sheets"][key] = {
                "rowCount": len(cleaned_rows),
                "skippedRows": skipped,
                "columns": header,
                "rows": cleaned_rows,
            }
            log(f'"{key}": {len(cleaned_rows)} rows parsed, {skipped} skipped')

    return result


def write_raw_output(data):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, "raw.json")
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    log(f"Raw parsed data written to {out_path}")


def main():
    data = parse_document(INPUT_PATH)
    if not data["sheets"]:
        fail("No sheets/tables found - is this really a .numbers file with data in it?")
    write_raw_output(data)
    log("Done. Run generate-json.js next to build the final /data structure.")


if __name__ == "__main__":
    main()
