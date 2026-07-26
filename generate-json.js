/**
 * generate-json.js
 *
 * Takes ./tmp-data/raw.json (output of excel-parser.js) and writes the
 * final, app-facing files into /data.
 *
 * Strategy:
 *  - Each Excel sheet becomes a folder under /data (slugified sheet name).
 *  - Inside that folder:
 *      - index.json        -> full list (lightweight fields only, for tables/lists)
 *      - all.json          -> full list, all fields (for search/filtering)
 *      - records/<key>.json -> one file per row, if a primary-key-like
 *                              column is detected (id, symbol, ticker, code)
 *                              -> enables fast single-record fetches without
 *                                 loading the whole sheet (great for 10k+ companies).
 *  - A top-level /data/manifest.json lists every dataset + row counts, so the
 *    frontend can discover what's available without hardcoding sheet names.
 *
 * Usage: node scripts/generate-json.js
 */

import fs from "fs";
import path from "path";

const RAW_INPUT = "./tmp-data/raw.json";
const DATA_DIR = "./data";

// Column names we'll try, in order, to use as a per-record primary key.
const KEY_CANDIDATES = ["id", "ID", "symbol", "Symbol", "ticker", "Ticker", "code", "Code"];

function log(msg) {
  console.log(`[generate-json] ${msg}`);
}

function fail(msg) {
  console.error(`[generate-json] ERROR: ${msg}`);
  process.exit(1);
}

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function detectKeyColumn(columns) {
  return KEY_CANDIDATES.find((c) => columns.includes(c)) || null;
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  if (!fs.existsSync(RAW_INPUT)) {
    fail(`${RAW_INPUT} not found. Run "npm run parse" first.`);
  }

  const raw = JSON.parse(fs.readFileSync(RAW_INPUT, "utf-8"));
  ensureCleanDir(DATA_DIR);

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceFile: raw.sourceFile,
    datasets: [],
  };

  for (const [sheetName, sheet] of Object.entries(raw.sheets)) {
    const slug = slugify(sheetName);
    const sheetDir = path.join(DATA_DIR, slug);
    fs.mkdirSync(sheetDir, { recursive: true });

    // Full list, all fields
    fs.writeFileSync(
      path.join(sheetDir, "all.json"),
      JSON.stringify(sheet.rows, null, 2)
    );

    const keyColumn = detectKeyColumn(sheet.columns);

    if (keyColumn) {
      const recordsDir = path.join(sheetDir, "records");
      fs.mkdirSync(recordsDir, { recursive: true });

      let written = 0;
      let duplicates = 0;
      const seenKeys = new Set();

      for (const row of sheet.rows) {
        const key = row[keyColumn];
        if (key === null || key === undefined) continue;
        const fileKey = slugify(String(key));
        if (seenKeys.has(fileKey)) {
          duplicates++;
          continue;
        }
        seenKeys.add(fileKey);
        fs.writeFileSync(
          path.join(recordsDir, `${fileKey}.json`),
          JSON.stringify(row, null, 2)
        );
        written++;
      }

      log(`"${sheetName}": ${written} per-record files written (key: ${keyColumn})${duplicates ? `, ${duplicates} duplicate keys skipped` : ""}`);
    } else {
      log(`"${sheetName}": no primary-key column detected (looked for ${KEY_CANDIDATES.join("/")}) - only all.json written`);
    }

    manifest.datasets.push({
      name: sheetName,
      slug,
      rowCount: sheet.rowCount,
      skippedRows: sheet.skippedRows,
      columns: sheet.columns,
      keyColumn,
      hasPerRecordFiles: Boolean(keyColumn),
    });
  }

  fs.writeFileSync(
    path.join(DATA_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  log(`Manifest written with ${manifest.datasets.length} dataset(s).`);
  log("Done. Run \"npm run validate\" next.");
}

main();
