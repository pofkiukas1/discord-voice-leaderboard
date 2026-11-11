import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceStore } from '../src/store.js';

function makeStore(t) {
  const store = new VoiceStore(':memory:');
  t.after(() => store.close());
  return store;
}
function total(store, id, at) {
  const row = store.totals().find((r) => r.user_id === id);
  return row.total_ms + (row.started_at_ms == null ? 0 : at - row.started_at_ms);
}
test('join leave tracking', (t) => {
  const store = makeStore(t);
  store.join('u1', 'c1', 1000);
  store.leave('u1', 9000);
  assert.equal(total(store, 'u1', 9000), 8000);
});
test('channel changes preserve time', (t) => {
  const store = makeStore(t);
  store.join('u1', 'c1', 1000);
  store.join('u1', 'c1', 2000);
  store.join('u1', 'c2', 3000);
  store.leave('u1', 6000);
  assert.equal(total(store, 'u1', 6000), 5000);
});
test('checkpoint preserves active totals', (t) => {
  const store = makeStore(t);
  store.join('u1', 'c1', 1000);
  store.checkpoint(4000);
  assert.equal(total(store, 'u1', 6500), 5500);
  store.leave('u1', 6500);
  assert.equal(total(store, 'u1', 6500), 5500);
});
test('reconcile join leave and move', (t) => {
  const store = makeStore(t);
  store.reconcile([{ userId: 'a', channelId: 'c1' }], 1000);
  store.reconcile([{ userId: 'a', channelId: 'c2' }, { userId: 'b', channelId: 'c1' }], 2000);
  store.reconcile([{ userId: 'b', channelId: 'c1' }], 3000);
  assert.equal(total(store, 'a', 4000), 2000);
  assert.equal(total(store, 'b', 4000), 2000);
});
test('downtime not counted', (t) => {
  const store = makeStore(t);
  store.join('u1', 'c1', 1000);
  store.checkpoint(4000);
  store.stopAll(4000);
  store.reconcile([{ userId: 'u1', channelId: 'c1' }], 20_000);
  assert.equal(total(store, 'u1', 21_000), 4000);
});
test('settings persistence', (t) => {
  const store = makeStore(t);
  store.setSetting('message', '123');
  store.setSetting('message', '456');
  assert.equal(store.setting('message'), '456');
});
