import test from 'node:test';
import assert from 'node:assert/strict';
import { shanghaiClock, validDate, bookingName, slotHasEnded, newCancellationCode, normalizeCancellationCode, cancellationDigest } from '../app/lib/booking-rules.ts';

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
  assert.equal(slotHasEnded('2026-10-10', new Date('2026-10-10T01:00:00Z')), false);
  assert.equal(slotHasEnded('2026-10-10', new Date('2026-10-10T12:59:59Z')), false);
  assert.equal(slotHasEnded('2026-10-10', new Date('2026-10-10T13:00:00Z')), true);
  assert.equal(slotHasEnded('2026-10-09', new Date('2026-10-10T00:00:00Z')), true);
  assert.equal(slotHasEnded('2026-10-11', new Date('2026-10-10T01:00:00Z')), false);
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
