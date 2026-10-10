import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const state = globalThis as typeof globalThis & { guitarRoomDb?: DatabaseSync };

function database() {
  if (!state.guitarRoomDb) {
    const file = resolve(process.env.DATABASE_PATH || "data/bookings.sqlite");
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const connection = new DatabaseSync(file);
    connection.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS bookings (
        booking_date TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cancellation_digest TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS request_limits (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
      );
    `);
    state.guitarRoomDb = connection;
  }
  return state.guitarRoomDb;
}

// Preserve the existing parameterized queries while moving their storage to SQLite.
export function db() {
  return {
    prepare(sql: string) {
      const statement = database().prepare(sql);
      return {
        bind(...values: (string | number | null)[]) {
          return {
            async first<T = Record<string, unknown>>(): Promise<T | null> {
              return (statement.get(...values) as T | undefined) ?? null;
            },
            async all() {
              return { results: statement.all(...values) };
            },
          };
        },
      };
    },
  };
}
