import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoute } from './proxy.js';

test('normalizeRoute keeps explicit target routes', () => {
  const route = { target: 'http://127.0.0.1:3000' };
  assert.deepEqual(normalizeRoute(route), route);
});

test('normalizeRoute converts { port } route into target URL', () => {
  assert.deepEqual(normalizeRoute({ port: 3000 }), {
    port: 3000,
    target: 'http://127.0.0.1:3000',
  });
});

test('normalizeRoute handles legacy numeric and string ports', () => {
  assert.deepEqual(normalizeRoute(4000), {
    target: 'http://127.0.0.1:4000',
  });
  assert.deepEqual(normalizeRoute('5000'), {
    target: 'http://127.0.0.1:5000',
  });
});

test('normalizeRoute rejects invalid route strings', () => {
  assert.equal(normalizeRoute('not-a-port'), null);
});
