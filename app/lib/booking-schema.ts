import type { DatabaseSync } from "node:sqlite";

const CREATE_BOOKINGS = `CREATE TABLE IF NOT EXISTS bookings (
  booking_date TEXT NOT NULL,
  slot_start TEXT NOT NULL CHECK (slot_start IN ('08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00')),
  name TEXT NOT NULL,
  cancellation_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (booking_date, slot_start)
)`;

export function initializeBookingSchema(connection: DatabaseSync) {
  connection.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;");
  try {
    const columns = connection.prepare("PRAGMA table_info(bookings)").all();
    if (columns.length && !columns.some((column) => column.name === "slot_start")) {
      connection.exec(`ALTER TABLE bookings RENAME TO bookings_legacy;
        ${CREATE_BOOKINGS};
        INSERT INTO bookings (booking_date, slot_start, name, cancellation_digest, created_at)
        SELECT booking_date, '20:00', name, cancellation_digest, created_at FROM bookings_legacy;
        DROP TABLE bookings_legacy;`);
    } else {
      connection.exec(CREATE_BOOKINGS);
    }
    connection.exec(`CREATE TABLE IF NOT EXISTS request_limits (
      key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL
    ); COMMIT;`);
  } catch (error) {
    connection.exec("ROLLBACK;");
    throw error;
  }
}
