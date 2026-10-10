import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, bookingSlot, digest, shanghaiClock, validDate, bookingName, slotHasEnded, newCancellationCode, normalizeCancellationCode, cancellationDigest } from '../app/lib/booking-rules.ts';

test('uses Shanghai date across the UTC midnight boundary', () => {
  assert.equal(shanghaiClock(new Date('2026-10-10T16:05:00Z')).today, '2026-10-11');
  assert.equal(shanghaiClock(new Date('2026-10-10T16:05:00Z')).time, '00:05');
});

test('rejects impossible and malformed dates', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2028-02-29'), true);
  for (const value of ['2026-13-01', '2026-10-32', '2026-1-1', null, 'invalid']) assert.equal(validDate(value), false);
});

test('past slots end at 21:00 in Shanghai', () => {
  assert.equal(slotHasEnded('2026-10-10', '20:00', new Date('2026-10-10T01:00:00Z')), false);
  assert.equal(slotHasEnded('2026-10-10', '20:00', new Date('2026-10-10T12:59:59Z')), false);
  assert.equal(slotHasEnded('2026-10-10', '20:00', new Date('2026-10-10T13:00:00Z')), true);
  assert.equal(slotHasEnded('2026-10-09', '20:00', new Date('2026-10-10T00:00:00Z')), true);
  assert.equal(slotHasEnded('2026-10-11', '20:00', new Date('2026-10-10T01:00:00Z')), false);
});

test('13 consecutive hourly slots run from 08:00 through 21:00', () => {
  assert.equal(SLOTS.length, 13);
  assert.deepEqual(SLOTS[0], { start: '08:00', end: '09:00' });
  assert.deepEqual(SLOTS.at(-1), { start: '20:00', end: '21:00' });
  for (let index = 1; index < SLOTS.length; index++) assert.equal(SLOTS[index].start, SLOTS[index - 1].end);
  for (const start of ['07:00', '21:00', '08:30', '8:00', null, 8, undefined]) assert.equal(bookingSlot(start), null);
});

test('each hour ends independently in Shanghai time', () => {
  assert.equal(slotHasEnded('2026-10-10', '08:00', new Date('2026-10-10T00:59:59Z')), false);
  assert.equal(slotHasEnded('2026-10-10', '08:00', new Date('2026-10-10T01:00:00Z')), true);
  assert.equal(slotHasEnded('2026-10-10', '09:00', new Date('2026-10-10T01:00:00Z')), false);
  assert.equal(slotHasEnded('2026-10-11', '08:00', new Date('2026-10-10T13:00:00Z')), false);
});

test('cancellation digests bind to the hour and preserve legacy evening codes', async () => {
  const date = '2026-10-11';
  const code = 'ABCDEFGHJKLMNPQR';
  assert.equal(await cancellationDigest(date, code, '20:00'), await digest(`cancel-v1:${date}:${code}`));
  assert.notEqual(await cancellationDigest(date, code, '08:00'), await cancellationDigest(date, code, '09:00'));
  assert.notEqual(await cancellationDigest(date, code, '08:00'), await cancellationDigest(date, code, '20:00'));
});

test('validates display names without interpreting HTML', () => {
  assert.equal(bookingName('  吉他 乐队  '), '吉他 乐队');
  assert.equal(bookingName('  '), null);
  assert.equal(bookingName('a'.repeat(41)), null);
  assert.equal(bookingName(123), null);
});

test('cancellation codes are random and bound to both code and date', async () => {
  const a = newCancellationCode();
  const b = newCancellationCode();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
  const normalized = normalizeCancellationCode(a.toLowerCase());
  assert.equal(normalized, a.replaceAll('-', ''));
  assert.equal(normalizeCancellationCode('0000-0000-0000-0000'), null);
  assert.notEqual(await cancellationDigest('2026-10-11', normalized), await cancellationDigest('2026-10-12', normalized));
  assert.notEqual(await cancellationDigest('2026-10-11', normalized), await cancellationDigest('2026-10-11', normalizeCancellationCode(b)));
});
