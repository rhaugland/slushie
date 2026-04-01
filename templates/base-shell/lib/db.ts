import Database from "better-sqlite3";
import path from "path";
import { readdirSync, readFileSync, existsSync } from "fs";

const DB_PATH = path.join(process.cwd(), "data.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function runMigrations(): void {
  const featuresDir = path.join(process.cwd(), "features");
  if (!existsSync(featuresDir)) return;

  const database = getDb();
  const dirs = readdirSync(featuresDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const schemaPath = path.join(featuresDir, dir.name, "schema.sql");
    if (existsSync(schemaPath)) {
      const sql = readFileSync(schemaPath, "utf-8");
      database.exec(sql);
    }
  }
}
