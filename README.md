# Inventory Scanner App

A local scanner-friendly inventory dashboard for `/Users/nasimullabib/Downloads/whole-store.csv`.

## What it does

- Shows the total number of scanned items.
- Shows the title and cost price of the latest scanned item.
- Keeps a running total cost for everything scanned in the current session.
- Auto-saves exports with a new `Scanned Count` column after every scan.
- Produces both CSV and Excel-compatible `.xlsx` exports.

## Run it

```bash
cd /Users/nasimullabib/Downloads/inventory
python3 app.py
```

Then open `http://127.0.0.1:8765`.

Optional:

```bash
INVENTORY_SOURCE_CSV="/path/to/another-file.csv" INVENTORY_PORT=9000 python3 app.py
```

## Output files

Every scan updates these files:

- `/Users/nasimullabib/Downloads/inventory/exports/whole-store-scanned.csv`
- `/Users/nasimullabib/Downloads/inventory/exports/whole-store-scanned.xlsx`

The original source file is left unchanged.
