import test from 'node:test';
import assert from 'node:assert/strict';
import { validAdminKey } from '../app/lib/admin-key.ts';

test('admin cancellation is disabled with missing or weak configuration', () => {
  for (const configured of [undefined, '', 'short', 'x'.repeat(257)]) {
    assert.equal(validAdminKey(configured, configured), false);
  }
});

test('only the exact administrator key authenticates', () => {
  const key = 'test-only-admin-key-with-at-least-32-characters';
  assert.equal(validAdminKey(key, key), true);
  for (const candidate of [undefined, null, {}, '', key.toUpperCase(), `${key} `, 'x'.repeat(257)]) {
    assert.equal(validAdminKey(candidate, key), false);
  }
});
