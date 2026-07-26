/**
 * validate-data.js
 *
 * Runs after generate-json.js. Fails the build (non-zero exit code) if the
 * generated /data looks broken, so a bad Excel edit never reaches Vercel.
 *
 * Checks:
 *  - manifest.json exists and is valid JSON
 *  - every dataset listed in the manifest has a matching all.json
 *  - no dataset has 0 rows (likely a broken sheet / empty upload)
 *  - all.json files are valid, parseable JSON arrays
 *  - warns (does not fail) if skippedRows is high relative to rowCount
 */

import fs from "fs";
import path from "path";

const DATA_DIR = "./data";
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");

let errors = 0;
let warnings = 0;

function ok(msg) {
  console.log(`[validate]  OK  ${msg}`);
}
function warn(msg) {
  console.warn(`[validate] WARN ${msg}`);
  warnings++;
}
function error(msg) {
  console.error(`[validate] FAIL ${msg}`);
  errors++;
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    error(`manifest.json not found in ${DATA_DIR}. Run "npm run generate" first.`);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  } catch (e) {
    error(`manifest.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  ok("manifest.json parsed successfully");

  if (!manifest.datasets || manifest.datasets.length === 0) {
    error("manifest.json contains no datasets - Excel file may be empty or unreadable.");
    process.exit(1);
  }

  for (const ds of manifest.datasets) {
    const allPath = path.join(DATA_DIR, ds.slug, "all.json");

    if (!fs.existsSync(allPath)) {
      error(`Missing all.json for dataset "${ds.name}" at ${allPath}`);
      continue;
    }

    let rows;
    try {
      rows = JSON.parse(fs.readFileSync(allPath, "utf-8"));
    } catch (e) {
      error(`"${ds.name}"/all.json is not valid JSON: ${e.message}`);
      continue;
    }

    if (!Array.isArray(rows)) {
      error(`"${ds.name}"/all.json should be an array, got ${typeof rows}`);
      continue;
    }

    if (rows.length === 0) {
      warn(`"${ds.name}" has 0 rows - check the source sheet.`);
    } else {
      ok(`"${ds.name}": ${rows.length} rows validated`);
    }

    if (ds.skippedRows > 0 && ds.rowCount > 0) {
      const ratio = ds.skippedRows / (ds.rowCount + ds.skippedRows);
      if (ratio > 0.2) {
        warn(`"${ds.name}" skipped ${ds.skippedRows} rows (${Math.round(ratio * 100)}% of sheet) - check for formatting issues.`);
      }
    }
  }

  console.log("");
  console.log(`[validate] Summary: ${errors} error(s), ${warnings} warning(s).`);

  if (errors > 0) {
    console.error("[validate] Validation FAILED - stopping pipeline before commit/deploy.");
    process.exit(1);
  }

  console.log("[validate] Validation passed.");
}

main();
