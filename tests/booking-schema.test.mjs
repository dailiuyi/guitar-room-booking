import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initializeBookingSchema } from '../app/lib/booking-schema.ts';

test('legacy bookings migrate to 20:00 without changing names, digests or timestamps', () => {
  const connection = new DatabaseSync(':memory:');
  try {
    connection.exec(`CREATE TABLE bookings (booking_date TEXT PRIMARY KEY, name TEXT NOT NULL, cancellation_digest TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE request_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
      INSERT INTO request_limits VALUES ('existing-limit', 123, 2);`);
    connection.prepare('INSERT INTO bookings VALUES (?, ?, ?, ?)').run('2099-03-15', '原有乐队', 'original-digest', 'original-time');
    initializeBookingSchema(connection);
    initializeBookingSchema(connection);
    assert.deepEqual({ ...connection.prepare('SELECT * FROM bookings').get() }, {
      booking_date: '2099-03-15', slot_start: '20:00', name: '原有乐队', cancellation_digest: 'original-digest', created_at: 'original-time',
    });
    assert.equal(connection.prepare('SELECT count FROM request_limits').get().count, 2);
    connection.prepare('INSERT INTO bookings VALUES (?, ?, ?, ?, ?)').run('2099-03-15', '08:00', '新乐队', 'new-digest', 'new-time');
    assert.equal(connection.prepare('SELECT count(*) AS count FROM bookings').get().count, 2);
    assert.throws(() => connection.prepare('INSERT INTO bookings VALUES (?, ?, ?, ?, ?)').run('2099-03-15', '08:00', '重复', 'digest', 'time'), /UNIQUE/);
  } finally { connection.close(); }
});

test('fresh databases enforce hourly slot boundaries', () => {
  const connection = new DatabaseSync(':memory:');
  try {
    initializeBookingSchema(connection);
    for (const slot of ['07:00', '21:00', '08:30']) {
      assert.throws(() => connection.prepare('INSERT INTO bookings VALUES (?, ?, ?, ?, ?)').run('2099-03-15', slot, '测试', 'digest', 'time'), /CHECK/);
    }
  } finally { connection.close(); }
});

test('a migration error rolls back and leaves original data intact', () => {
  const connection = new DatabaseSync(':memory:');
  try {
    connection.exec("CREATE TABLE bookings (booking_date TEXT PRIMARY KEY, name TEXT); INSERT INTO bookings VALUES ('2099-03-15', '原预约');");
    assert.throws(() => initializeBookingSchema(connection));
    assert.equal(connection.prepare('SELECT name FROM bookings').get().name, '原预约');
    assert.equal(connection.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'bookings_legacy'").get().count, 0);
  } finally { connection.close(); }
});
