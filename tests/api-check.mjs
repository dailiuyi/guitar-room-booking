import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:3100';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Integration tests may only run against a local preview.');
const date = '2099-03-15';
const request = async (method, value, extraHeaders = {}) => {
  const response = await fetch(`${base}/api/bookings`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin, ...extraHeaders },
    body: JSON.stringify({ slotStart: '20:00', ...value }),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { error: raw }; }
  return { status: response.status, data };
};

let activeCode;
let morningCode;
try {
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => request('POST', { date, name: `本地并发测试 ${index}` })));
  assert.equal(attempts.filter(value => value.status === 201).length, 1, 'Only one concurrent reservation succeeds');
  assert.equal(attempts.filter(value => value.status === 409).length, 7, 'All conflicting reservations are rejected');
  activeCode = attempts.find(value => value.status === 201).data.cancellationCode;
  const publicResponse = await fetch(`${base}/api/bookings?from=${date}&to=${date}`);
  assert.equal(publicResponse.status, 200);
  const visible = await publicResponse.json();
  assert.equal(visible.bookings.length, 1, 'A separate client can read the reservation');
  assert.deepEqual(Object.keys(visible.bookings[0]).sort(), ['createdAt', 'date', 'name', 'slotStart']);
  assert.equal(JSON.stringify(visible).includes(activeCode), false, 'Public read never exposes cancellation codes');
  assert.equal(visible.slots.length, 13);
  assert.deepEqual(visible.slots[0], { start: '08:00', end: '09:00' });
  assert.deepEqual(visible.slots.at(-1), { start: '20:00', end: '21:00' });
  const morning = await request('POST', { date, slotStart: '08:00', name: '早间乐队' });
  assert.equal(morning.status, 201, 'Different hours on the same date may be booked independently');
  morningCode = morning.data.cancellationCode;
  assert.equal((await request('POST', { date, slotStart: '08:00', name: '重复早间预约' })).status, 409);
  assert.equal((await request('DELETE', { date, slotStart: '08:00', cancellationCode: activeCode })).status, 404);
  assert.equal((await request('DELETE', { date, cancellationCode: morningCode })).status, 404);
  for (const slotStart of ['07:00', '21:00', '08:30', null, undefined]) {
    assert.equal((await request('POST', { date, slotStart, name: '非法时段' })).status, 400);
    assert.equal((await request('DELETE', { date, slotStart, cancellationCode: activeCode })).status, 400);
  }

  assert.equal((await request('DELETE', { date, cancellationCode: 'ABCD-EFGH-JKLM-NPQR' })).status, 404);
  assert.equal((await request('DELETE', { date: '2099-03-16', cancellationCode: activeCode })).status, 404);
  const oldCode = activeCode;
  assert.equal((await request('DELETE', { date, cancellationCode: activeCode })).status, 200);
  activeCode = undefined;
  const remaining = await (await fetch(`${base}/api/bookings?from=${date}&to=${date}`)).json();
  assert.equal(remaining.bookings.length, 1, 'Cancelling evening leaves the morning booking untouched');
  assert.equal(remaining.bookings[0].slotStart, '08:00');
  const rebooked = await request('POST', { date, name: '本地重新预约测试' });
  assert.equal(rebooked.status, 201);
  activeCode = rebooked.data.cancellationCode;
  assert.equal((await request('DELETE', { date, cancellationCode: oldCode })).status, 404, 'An old code cannot cancel a new reservation');
  const replay = await request('POST', { date, name: '重试不覆盖原名称', cancellationCode: activeCode });
  assert.equal(replay.status, 200, 'Same secret safely recovers the existing reservation');
  assert.equal(replay.data.booking.name, '本地重新预约测试');
  assert.equal(replay.data.cancellationCode, activeCode);
  assert.equal((await request('POST', { date, name: '错误秘密不能取得预约', cancellationCode: oldCode })).status, 409);
  assert.equal((await request('POST', { date: '2026-02-29', name: '测试' })).status, 400);
  assert.equal((await request('POST', { date: '2099-03-16', name: ' ' })).status, 400);
  assert.equal((await request('POST', { date: '2099-03-16', name: '测试' }, { Origin: 'https://example.invalid' })).status, 403);

  const adminKey = process.env.ADMIN_CANCELLATION_KEY;
  const expected = { date, expectedName: replay.data.booking.name, expectedCreatedAt: replay.data.booking.createdAt };
  assert.equal((await request('DELETE', { ...expected, adminKey: 'invalid-admin-key', cancellationCode: activeCode })).status, 403, 'Invalid admin authentication cannot fall back to a personal code');
  if (adminKey) {
    assert.equal((await request('DELETE', { ...expected, adminKey }, { Origin: 'https://example.invalid' })).status, 403);
    assert.equal((await request('DELETE', { date, adminKey })).status, 400, 'Administrator must supply reviewed reservation details');
    assert.equal((await request('DELETE', { ...expected, expectedCreatedAt: 'stale', adminKey })).status, 409);
    assert.equal((await request('DELETE', { ...expected, expectedName: 'wrong name', adminKey })).status, 409);
    assert.equal((await request('DELETE', { ...expected, slotStart: '08:00', adminKey })).status, 409, 'Administrator confirmation cannot cancel another hour');
    assert.equal((await request('DELETE', { ...expected, date: '2099-03-16', adminKey })).status, 409, 'Administrator cancellation targets only the specified date');
    assert.equal((await request('DELETE', { ...expected, adminKey })).status, 200, 'Administrator can cancel without the personal code');
    activeCode = undefined;
    const replacement = await request('POST', { date, name: expected.expectedName });
    assert.equal(replacement.status, 201);
    activeCode = replacement.data.cancellationCode;
    assert.equal((await request('DELETE', { ...expected, adminKey })).status, 409, 'An old confirmation cannot cancel a replacement booking');
    const afterAdmin = await (await fetch(`${base}/api/bookings?from=${date}&to=${date}`)).json();
    assert.equal(afterAdmin.bookings.length, 2);
    assert.equal(JSON.stringify(afterAdmin).includes(adminKey), false);
  } else {
    assert.equal((await request('DELETE', { ...expected, adminKey: 'test-only-key-with-at-least-32-characters' })).status, 403, 'Unconfigured administrator cancellation is disabled');
  }

  const adminRateIp = `198.19.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  let adminRateResult;
  for (let index = 0; index < 21; index++) adminRateResult = await request('DELETE', { ...expected, adminKey: 'invalid-admin-key' }, { 'x-real-ip': adminRateIp });
  assert.equal(adminRateResult.status, 429, 'Administrator key guessing is throttled');

  const rateIp = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  let rateResult;
  for (let index = 0; index < 21; index++) rateResult = await request('DELETE', { date, cancellationCode: 'bad' }, { 'x-real-ip': rateIp });
  assert.equal(rateResult.status, 429, 'Repeated guessing of cancellation codes is throttled');
  console.log(`Passed: booking rules, privacy, cancellation, origin checks, throttling, administrator ${adminKey ? 'cancellation and stale-confirmation protection' : 'disabled configuration'}.`);
} finally {
  if (morningCode) {
    assert.equal((await request('DELETE', { date, slotStart: '08:00', cancellationCode: morningCode })).status, 200);
  }
  if (activeCode) {
    const cleanup = await request('DELETE', { date, cancellationCode: activeCode });
    assert.equal(cleanup.status, 200, 'Test reservation cleanup succeeds');
  }
}
