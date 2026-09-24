import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "scanner.db");

export const db = new DatabaseSync(DB_PATH);

// WAL mode not needed for DatabaseSync (single connection), but keep exec for compatibility
try {
  db.exec("PRAGMA journal_mode = WAL");
} catch {
  // ignore if not supported
}

db.exec(`
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL,
  scanner_id TEXT NOT NULL,
  scanned_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Accepted'
);
CREATE INDEX IF NOT EXISTS idx_scans_scanner ON scans(scanner_id);
CREATE INDEX IF NOT EXISTS idx_scans_barcode ON scans(barcode);
CREATE INDEX IF NOT EXISTS idx_scans_time ON scans(scanned_at);
`);

export interface ScanRow {
  id: number;
  barcode: string;
  scanner_id: string;
  scanned_at: string;
  status: string;
}

export function insertScan(barcode: string, scannerId: string, status: string): ScanRow {
  const scannedAt = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO scans (barcode, scanner_id, scanned_at, status) VALUES (?, ?, ?, ?) RETURNING id"
  );
  // DatabaseSync with RETURNING returns the inserted row
  const row = stmt.get(barcode, scannerId, scannedAt, status) as { id: number } | undefined;
  let id: number;
  if (row && typeof row.id === "number") {
    id = row.id;
  } else {
    // fallback for older sqlite without RETURNING
    const fallback = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
    id = Number(fallback.id);
  }
  return {
    id,
    barcode,
    scanner_id: scannerId,
    scanned_at: scannedAt,
    status,
  };
}

export function getScans(opts: { scanner?: string; q?: string; limit?: number }): ScanRow[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts.scanner) {
    conds.push("scanner_id = ?");
    params.push(opts.scanner);
  }
  if (opts.q) {
    conds.push("barcode LIKE ?");
    params.push(`%${opts.q}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const stmt = db.prepare(`SELECT * FROM scans ${where} ORDER BY id DESC LIMIT ?`);
  return stmt.all(...(params as never[]), limit as never) as unknown as ScanRow[];
}

export function getRecentScans(limit = 50): ScanRow[] {
  return getScans({ limit });
}

export function getTotalCount(): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM scans WHERE status = 'Accepted'").get() as { c: number };
  return row.c;
}

export function getCountByScanner(): Record<string, number> {
  const rows = db
    .prepare("SELECT scanner_id, COUNT(*) AS c FROM scans WHERE status = 'Accepted' GROUP BY scanner_id")
    .all() as unknown as { scanner_id: string; c: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.scanner_id] = r.c;
  return out;
}

export function clearScans(): { deleted: number } {
  const before = db.prepare("SELECT COUNT(*) as c FROM scans").get() as { c: number };
  db.exec("DELETE FROM scans; DELETE FROM sqlite_sequence WHERE name='scans'; VACUUM;");
  return { deleted: before.c };
}
