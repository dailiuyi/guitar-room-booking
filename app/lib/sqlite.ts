import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { initializeBookingSchema } from "./booking-schema";

const state = globalThis as typeof globalThis & { guitarRoomDb?: DatabaseSync };

function database() {
  if (!state.guitarRoomDb) {
    const file = resolve(process.env.DATABASE_PATH || "data/bookings.sqlite");
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const connection = new DatabaseSync(file);
    try {
      initializeBookingSchema(connection);
    } catch (error) {
      connection.close();
      throw error;
    }
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
