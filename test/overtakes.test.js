import test from 'node:test';
import assert from 'node:assert/strict';
import { ROASTS, snapshotTotals, findOvertakes, nextRoast, overtakeMessage } from '../src/overtakes.js';
import { VoiceStore } from '../src/store.js';

test('there are at least 500 different Lithuanian roasts', () => {
  assert.ok(ROASTS.length >= 500);
  assert.equal(new Set(ROASTS).size, ROASTS.length);
});

test('detects a genuine overtake but not ties or unchanged ordering', () => {
  const before = { '111': 10_000, '222': 20_000, '333': 40_000 };
  const after = { '111': 21_000, '222': 20_000, '333': 40_000 };
  assert.deepEqual(findOvertakes(before, after).map(({overtakerId,passedId})=>[overtakerId,passedId]), [['111','222']]);
  assert.deepEqual(findOvertakes(before, { '111': 20_000, '222': 20_000, '333': 40_000 }), []);
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
  assert.match(overtakeMessage('1','2','grybe'), /^📈 <@1> aplenkė <@2>! Susiimk, grybe!$/);
});
