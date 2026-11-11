import test from 'node:test';
import assert from 'node:assert/strict';
import { ROASTS, snapshotTotals, findOvertakes, nextRoast, overtakeMessage } from '../src/overtakes.js';
import { VoiceStore } from '../src/store.js';

test('there are at least 500 different Lithuanian roasts', () => {
  assert.ok(ROASTS.length >= 1000);
  assert.ok(ROASTS.every((r) => !r.includes('Susiimk') && !r.includes('Eik nachui')));
  assert.equal(new Set(ROASTS).size, ROASTS.length);
});

test('detects a genuine overtake but not ties or unchanged ordering', () => {
  const before = { '111': 10_000, '222': 20_000, '333': 40_000 };
  const after = { '111': 21_000, '222': 20_000, '333': 40_000 };
  assert.deepEqual(findOvertakes(before, after).map(({overtakerId,passedId})=>[overtakerId,passedId]), [['111','222']]);
  assert.deepEqual(findOvertakes(before, { '111': 20_000, '222': 20_000, '333': 40_000 }),
    [{ overtakerId: '111', passedId: '222', marginMs: 0 }]);
  assert.deepEqual(findOvertakes(null, after), []);
  assert.deepEqual(findOvertakes(before, { '111': 25_000, '222': 20_000, '333': 40_000, '444': 100_000 }), [{ overtakerId: '111', passedId: '222', marginMs: 5_000 }]);
});

test('snapshot totals include the time accumulated during active voice calls', () => {
  const rows = [
    { user_id: 'a', total_ms: 300, started_at_ms: 1000 },
    { user_id: 'b', total_ms: 2000, started_at_ms: null },
  ];
  assert.deepEqual(snapshotTotals(rows, 2000), { a: 1300, b: 2000 });
});

test('roast pool persists without repetitions through a cycle', () => {
  const store = new VoiceStore(':memory:');
  try {
    const seen = new Set();
    for (let i = 0; i < ROASTS.length; i++) {
      const roast = nextRoast(store, () => 0.28);
      assert.ok(!seen.has(roast), 'roast repeated before full cycle');
      seen.add(roast);
    }
    assert.equal(seen.size, ROASTS.length);
    const last = store.setting('roast_last_index');
    nextRoast(store, () => 0.28);
    assert.notEqual(store.setting('roast_last_index'), last);
  } finally {
    store.close();
  }
});

test('overtake message mentions exactly the two players', () => {
  assert.equal(overtakeMessage('1','2','Dek pragare, riebalų pabaisa.'), '📈 <@1> aplenkė <@2>!\nDek pragare, riebalų pabaisa.');
});

test('detects overtakes based on the order actually displayed in the leaderboard', () => {
  const lastShown = { 'andromeda': 60 * 60_000, 'starking': 80 * 60_000 };
  const now = { 'andromeda': 83 * 60_000, 'starking': 80 * 60_000 };
  assert.deepEqual(findOvertakes(lastShown, now), [{
    overtakerId: 'andromeda', passedId: 'starking', marginMs: 3 * 60_000,
  }]);
});

test('zero-total known members can overtake without false brand-new-member alerts', () => {
  assert.deepEqual(findOvertakes({ a: 0, b: 20_000 }, { a: 25_000, b: 20_000 }), [
    { overtakerId: 'a', passedId: 'b', marginMs: 5_000 },
  ]);
  assert.deepEqual(findOvertakes({ b: 20_000 }, { a: 25_000, b: 20_000 }), []);
});

test('ties use the same user-ID ordering as the visible leaderboard', () => {
  assert.deepEqual(findOvertakes({ '111': 20_000, '222': 20_000 }, { '111': 20_000, '222': 20_000 }), []);
  assert.deepEqual(findOvertakes({ '111': 20_000, '222': 30_000 }, { '111': 30_000, '222': 30_000 }),
    [{ overtakerId: '111', passedId: '222', marginMs: 0 }]);
});
