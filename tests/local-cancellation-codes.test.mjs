import test from 'node:test';
import assert from 'node:assert/strict';
import { saveLocalCode, readLocalCode, removeLocalCode } from '../app/lib/local-cancellation-codes.ts';

const code = 'ABCD-EFGH-JKLM-NPQR';
const date = '2099-03-15';
const createdAt = '2026-10-10T01:00:00.000Z';
function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('saved codes survive rereading and match only their reservation', () => {
  const storage = memoryStorage();
  assert.equal(saveLocalCode(date, '20:00', code, createdAt, storage), true);
  assert.equal(readLocalCode(date, '20:00', createdAt, storage), code);
  assert.equal(readLocalCode('2099-03-16', '20:00', createdAt, storage), '');
  assert.equal(readLocalCode(date, '20:00', '2026-10-10T02:00:00.000Z', storage), '');
  assert.equal(saveLocalCode(date, '20:00', 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', null, storage), false);
  assert.equal(readLocalCode(date, '20:00', createdAt, storage), code, 'A competing pending attempt preserves the confirmed code');
  removeLocalCode(date, '20:00', undefined, storage);
  assert.equal(readLocalCode(date, '20:00', createdAt, storage), '');
});

test('uncertain results retain their code and failed attempts do not erase another code', () => {
  const storage = memoryStorage();
  saveLocalCode(date, '20:00', code, null, storage);
  assert.equal(readLocalCode(date, '20:00', createdAt, storage), code);
  removeLocalCode(date, '20:00', 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', storage);
  assert.equal(readLocalCode(date, '20:00', createdAt, storage), code);
  removeLocalCode(date, '20:00', code, storage);
  assert.equal(readLocalCode(date, '20:00', createdAt, storage), '');
});

test('blocked storage, quota failures, and corrupt data are tolerated', () => {
  const unavailable = {
    getItem() { throw new Error('Blocked'); },
    setItem() { throw new Error('Quota exceeded'); },
    removeItem() { throw new Error('Blocked'); },
  };
  assert.equal(saveLocalCode(date, '20:00', code, createdAt, unavailable), false);
  assert.equal(readLocalCode(date, '20:00', createdAt, unavailable), '');
  assert.doesNotThrow(() => removeLocalCode(date, '20:00', undefined, unavailable));
  for (const raw of ['bad-json', 'null', '{}', JSON.stringify({ code: 'bad', createdAt }), JSON.stringify({ code })]) {
    assert.equal(readLocalCode(date, '20:00', createdAt, { getItem: () => raw }), '');
  }
});

test('codes from different hours stay independent when one is cancelled', () => {
  const storage = memoryStorage();
  saveLocalCode(date, '08:00', code, createdAt, storage);
  saveLocalCode(date, '09:00', 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', createdAt, storage);
  assert.equal(readLocalCode(date, '08:00', createdAt, storage), code);
  removeLocalCode(date, '08:00', undefined, storage);
  assert.equal(readLocalCode(date, '09:00', createdAt, storage), 'ZZZZ-ZZZZ-ZZZZ-ZZZZ');
});

test('legacy browser codes are used only for 20:00 and removed after cancellation', () => {
  const storage = memoryStorage();
  const legacyKey = `guitar-room:cancel:v1:${date}`;
  storage.setItem(legacyKey, JSON.stringify({ code, createdAt }));
  assert.equal(readLocalCode(date, '08:00', createdAt, storage), '');
  assert.equal(readLocalCode(date, '20:00', createdAt, storage), code);
  removeLocalCode(date, '08:00', undefined, storage);
  assert.notEqual(storage.getItem(legacyKey), null);
  removeLocalCode(date, '20:00', undefined, storage);
  assert.equal(storage.getItem(legacyKey), null);
});
