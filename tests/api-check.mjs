import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:3100';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Integration tests may only run against a local preview.');
const date = '2099-03-15';
const request = async (method, value, extraHeaders = {}) => {
  const response = await fetch(`${base}/api/bookings`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin, ...extraHeaders },
    body: JSON.stringify(value),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { error: raw }; }
  return { status: response.status, data };
};

let activeCode;
try {
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => request('POST', { date, name: `本地并发测试 ${index}` })));
  assert.equal(attempts.filter(value => value.status === 201).length, 1, 'Only one concurrent reservation succeeds');
  assert.equal(attempts.filter(value => value.status === 409).length, 7, 'All conflicting reservations are rejected');
  activeCode = attempts.find(value => value.status === 201).data.cancellationCode;
  const publicResponse = await fetch(`${base}/api/bookings?from=${date}&to=${date}`);
  assert.equal(publicResponse.status, 200);
  const visible = await publicResponse.json();
  assert.equal(visible.bookings.length, 1, 'A separate client can read the reservation');
  assert.deepEqual(Object.keys(visible.bookings[0]).sort(), ['createdAt', 'date', 'name']);
  assert.equal(JSON.stringify(visible).includes(activeCode), false, 'Public read never exposes cancellation codes');

  assert.equal((await request('DELETE', { date, cancellationCode: 'ABCD-EFGH-JKLM-NPQR' })).status, 404);
  assert.equal((await request('DELETE', { date: '2099-03-16', cancellationCode: activeCode })).status, 404);
  const oldCode = activeCode;
  assert.equal((await request('DELETE', { date, cancellationCode: activeCode })).status, 200);
  activeCode = undefined;
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

  const rateIp = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  let rateResult;
  for (let index = 0; index < 21; index++) rateResult = await request('DELETE', { date, cancellationCode: 'bad' }, { 'x-real-ip': rateIp });
  assert.equal(rateResult.status, 429, 'Repeated guessing of cancellation codes is throttled');
  console.log('Passed: concurrent conflict prevention, shared reads, code privacy, cancellation, rebooking, old-code isolation, input validation, origin validation, request throttling.');
} finally {
  if (activeCode) {
    const cleanup = await request('DELETE', { date, cancellationCode: activeCode });
    assert.equal(cleanup.status, 200, 'Test reservation cleanup succeeds');
  }
}
