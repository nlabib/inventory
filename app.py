from __future__ import annotations

import csv
import json
import os
import threading
import zipfile
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, List, Optional
from xml.sax.saxutils import escape


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DEFAULT_SOURCE_CSV = Path("/Users/nasimullabib/Downloads/whole-store.csv")
EXPORT_DIR = BASE_DIR / "exports"
SCAN_COLUMN = "Scanned Count"


def normalize_upc(value: str) -> str:
    return str(value or "").strip()


def upc_lookup_keys(value: str) -> List[str]:
    cleaned = normalize_upc(value)
    if not cleaned:
        return []

    keys = {cleaned}
    if cleaned.isdigit():
        stripped = cleaned.lstrip("0") or "0"
        keys.add(stripped)
        keys.add(cleaned.zfill(13))
    return list(keys)


def parse_cost(value: str) -> Decimal:
    try:
        return Decimal(str(value or "").strip() or "0")
    except InvalidOperation:
        return Decimal("0")


def decimal_to_float(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


def excel_column_name(index: int) -> str:
    name = []
    current = index
    while current:
        current, remainder = divmod(current - 1, 26)
        name.append(chr(65 + remainder))
    return "".join(reversed(name))


def xlsx_cell(row_index: int, column_index: int) -> str:
    return f"{excel_column_name(column_index)}{row_index}"


def xlsx_value_xml(value: str, row_index: int, column_index: int) -> str:
    cell_ref = xlsx_cell(row_index, column_index)
    text = str(value or "")
    return (
        f'<c r="{cell_ref}" t="inlineStr">'
        f"<is><t>{escape(text)}</t></is>"
        f"</c>"
    )


def write_simple_xlsx(headers: List[str], rows: List[Dict[str, str]], destination: Path) -> None:
    sheet_rows = []
    header_cells = [xlsx_value_xml(header, 1, index + 1) for index, header in enumerate(headers)]
    sheet_rows.append(f'<row r="1">{"".join(header_cells)}</row>')

    for row_number, row in enumerate(rows, start=2):
        row_cells = [xlsx_value_xml(row.get(header, ""), row_number, index + 1) for index, header in enumerate(headers)]
        sheet_rows.append(f'<row r="{row_number}">{"".join(row_cells)}</row>')

    dimension = f"A1:{xlsx_cell(max(len(rows) + 1, 1), max(len(headers), 1))}"
    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="{dimension}"/>'
        "<sheetViews><sheetView workbookViewId=\"0\"/></sheetViews>"
        '<sheetFormatPr defaultRowHeight="15"/>'
        f"<sheetData>{''.join(sheet_rows)}</sheetData>"
        "</worksheet>"
    )

    content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
"""

    rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"""

    workbook_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Inventory Scan" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
"""

    workbook_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"""

    styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>
"""

    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as workbook:
        workbook.writestr("[Content_Types].xml", content_types_xml)
        workbook.writestr("_rels/.rels", rels_xml)
        workbook.writestr("xl/workbook.xml", workbook_xml)
        workbook.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        workbook.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        workbook.writestr("xl/styles.xml", styles_xml)


@dataclass
class InventoryItem:
    upc: str
    description: str
    cost: Decimal
    row: Dict[str, str]


class InventorySession:
    def __init__(self, source_csv: Path) -> None:
        self.source_csv = source_csv
        self.lock = threading.Lock()
        self.fieldnames: List[str] = []
        self.rows: List[Dict[str, str]] = []
        self.items: Dict[str, InventoryItem] = {}
        self.lookup_items: Dict[str, InventoryItem] = {}
        self.scan_counts: Counter[str] = Counter()
        self.scan_log: List[Dict[str, object]] = []
        self.last_scan: Optional[Dict[str, object]] = None
        self.last_saved_at: Optional[str] = None
        self.csv_export_path = EXPORT_DIR / f"{self.source_csv.stem}-scanned.csv"
        self.xlsx_export_path = EXPORT_DIR / f"{self.source_csv.stem}-scanned.xlsx"
        self.load_inventory()
        self.persist_exports()

    def serialize_item(self, item: InventoryItem) -> Dict[str, object]:
        current_quantity = int(self.scan_counts.get(item.upc, 0))
        return {
            "upc": item.upc,
            "description": item.description,
            "cost": decimal_to_float(item.cost),
            "current_quantity": current_quantity,
        }

    def load_inventory(self) -> None:
        with self.source_csv.open(newline="", encoding="utf-8-sig") as csv_file:
            reader = csv.DictReader(csv_file)
            self.fieldnames = list(reader.fieldnames or [])
            self.rows = []
            self.items = {}
            self.lookup_items = {}
            for raw_row in reader:
                row = {key: value or "" for key, value in raw_row.items()}
                upc = normalize_upc(row.get("UPC", ""))
                description = row.get("Description", "").strip() or "Unknown Item"
                cost = parse_cost(row.get("Cost", "0"))
                self.rows.append(row)
                if upc:
                    item = InventoryItem(upc=upc, description=description, cost=cost, row=row)
                    self.items[upc] = item
                    for lookup_key in upc_lookup_keys(upc):
                        self.lookup_items[lookup_key] = item

    def export_rows(self) -> List[Dict[str, str]]:
        export_rows: List[Dict[str, str]] = []
        for row in self.rows:
            export_row = dict(row)
            upc = normalize_upc(export_row.get("UPC", ""))
            export_row[SCAN_COLUMN] = str(self.scan_counts.get(upc, 0))
            export_rows.append(export_row)
        return export_rows

    def persist_exports(self) -> None:
        export_headers = [header for header in self.fieldnames if header != SCAN_COLUMN] + [SCAN_COLUMN]
        export_rows = self.export_rows()

        self.csv_export_path.parent.mkdir(parents=True, exist_ok=True)
        with self.csv_export_path.open("w", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=export_headers)
            writer.writeheader()
            writer.writerows(export_rows)

        write_simple_xlsx(export_headers, export_rows, self.xlsx_export_path)
        self.last_saved_at = datetime.now().astimezone().strftime("%Y-%m-%d %I:%M:%S %p")

    def summary(self) -> Dict[str, object]:
        total_items = sum(self.scan_counts.values())
        unique_items = sum(1 for count in self.scan_counts.values() if count > 0)
        running_total = sum(
            (self.items[upc].cost * count) for upc, count in self.scan_counts.items() if upc in self.items
        )
        if not isinstance(running_total, Decimal):
            running_total = Decimal("0")
        return {
            "total_items": total_items,
            "unique_items": unique_items,
            "running_total": decimal_to_float(running_total),
            "last_scan": self.last_scan,
            "recent_scans": self.scan_log[-12:][::-1],
            "source_csv": str(self.source_csv),
            "csv_export_path": str(self.csv_export_path),
            "xlsx_export_path": str(self.xlsx_export_path),
            "last_saved_at": self.last_saved_at,
        }

    def lookup(self, upc: str) -> Dict[str, object]:
        cleaned_upc = normalize_upc(upc)
        if not cleaned_upc:
            raise ValueError("Scan a barcode first.")

        item = self.lookup_items.get(cleaned_upc)
        if item is None:
            raise LookupError(f"No inventory record found for UPC {cleaned_upc}.")

        return {"item": self.serialize_item(item)}

    def save_quantity(self, upc: str, quantity: int) -> Dict[str, object]:
        cleaned_upc = normalize_upc(upc)
        if not cleaned_upc:
            raise ValueError("Scan a barcode first.")
        if quantity < 0:
            raise ValueError("Quantity cannot be negative.")

        with self.lock:
            item = self.lookup_items.get(cleaned_upc)
            if item is None:
                raise LookupError(f"No inventory record found for UPC {cleaned_upc}.")

            self.scan_counts[item.upc] = quantity
            scan_record = {
                "upc": item.upc,
                "description": item.description,
                "cost": decimal_to_float(item.cost),
                "count_for_item": quantity,
                "timestamp": datetime.now().astimezone().strftime("%I:%M:%S %p"),
            }
            self.last_scan = scan_record
            self.scan_log.append(scan_record)
            self.persist_exports()
            return self.summary()

    def reset(self) -> Dict[str, object]:
        with self.lock:
            self.scan_counts = Counter()
            self.scan_log = []
            self.last_scan = None
            self.persist_exports()
            return self.summary()


class InventoryRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, inventory: InventorySession, **kwargs) -> None:
        self.inventory = inventory
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def send_json(self, payload: Dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def read_json(self) -> Dict[str, object]:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:
        if self.path == "/api/state":
            self.send_json(self.inventory.summary())
            return

        if self.path == "/":
            self.path = "/index.html"

        return super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/lookup":
            try:
                payload = self.read_json()
                item = self.inventory.lookup(str(payload.get("upc", "")))
                self.send_json(item)
            except LookupError as error:
                self.send_json({"error": str(error)}, status=HTTPStatus.NOT_FOUND)
            except ValueError as error:
                self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        if self.path == "/api/scan":
            try:
                payload = self.read_json()
                quantity = int(payload.get("quantity", 0))
                summary = self.inventory.save_quantity(str(payload.get("upc", "")), quantity)
                self.send_json(summary)
            except LookupError as error:
                self.send_json({"error": str(error)}, status=HTTPStatus.NOT_FOUND)
            except (TypeError, ValueError) as error:
                self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        if self.path == "/api/reset":
            summary = self.inventory.reset()
            self.send_json(summary)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found.")


def main() -> None:
    source_csv = Path(os.environ.get("INVENTORY_SOURCE_CSV", str(DEFAULT_SOURCE_CSV)))
    port = int(os.environ.get("INVENTORY_PORT", "8765"))
    inventory = InventorySession(source_csv)

    def handler(*args, **kwargs):
        InventoryRequestHandler(*args, inventory=inventory, **kwargs)

    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Inventory app is running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
