/**
 * data.ts
 *
 * Single access point for all dataset reads in the app.
 *
 * Right now this reads static JSON from /data (fast, free, ISR-friendly).
 * When you migrate to Postgres/Supabase/Neon later, you only rewrite the
 * functions in THIS file to run SQL queries instead - every page/component
 * that imports from here keeps working unchanged.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

export interface Manifest {
  generatedAt: string;
  sourceFile: string;
  datasets: {
    name: string;
    slug: string;
    rowCount: number;
    skippedRows: number;
    columns: string[];
    keyColumn: string | null;
    hasPerRecordFiles: boolean;
  }[];
}

function readJson<T>(relativePath: string): T {
  const fullPath = path.join(DATA_DIR, relativePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw) as T;
}

/** List every available dataset (sheet) and its metadata. */
export function getManifest(): Manifest {
  return readJson<Manifest>("manifest.json");
}

/** Get every row for a dataset, e.g. getDataset("companies"). */
export function getDataset<T = Record<string, unknown>>(slug: string): T[] {
  return readJson<T[]>(path.join(slug, "all.json"));
}

/**
 * Get a single record by its key (only works for datasets that have a
 * detected primary-key column - check manifest.datasets[].hasPerRecordFiles).
 * This avoids loading the full dataset just to render one company/price row.
 */
export function getRecord<T = Record<string, unknown>>(
  slug: string,
  key: string
): T | null {
  const slugifiedKey = key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  try {
    return readJson<T>(path.join(slug, "records", `${slugifiedKey}.json`));
  } catch {
    return null;
  }
}

/** Paginate a dataset for table views (avoids shipping huge arrays to the client). */
export function getPaginatedDataset<T = Record<string, unknown>>(
  slug: string,
  page = 1,
  pageSize = 50
): { rows: T[]; page: number; pageSize: number; total: number; totalPages: number } {
  const all = getDataset<T>(slug);
  const start = (page - 1) * pageSize;
  const rows = all.slice(start, start + pageSize);
  return {
    rows,
    page,
    pageSize,
    total: all.length,
    totalPages: Math.ceil(all.length / pageSize),
  };
}
