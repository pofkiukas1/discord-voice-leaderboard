import test from 'node:test';
import assert from 'node:assert/strict';
import { leaderboardRows, leaderboardEmbed, formatDuration, refreshBucket } from '../src/leaderboard.js';

const now = 1_800_000;

test('duration formatting', () => {
  assert.equal(formatDuration(3_900_000), '1h 05m');
  assert.equal(formatDuration(0), '0h 00m');
});
test('leaderboard sorts current sessions', () => {
  const rows = [
    { user_id: '10', total_ms: 300_000, started_at_ms: 1_500_000 },
    { user_id: '20', total_ms: 1_500_000, started_at_ms: null },
  ];
  const out = leaderboardRows(rows, now);
  assert.deepEqual(out.map((r) => r.userId), ['20', '10']);
  assert.equal(out[1].milliseconds, 600_000);
});
test('empty embed', () => {
  assert.match(leaderboardEmbed([], now).description, /Nobody/);
});
test('20 minute boundaries', () => {
  assert.notEqual(refreshBucket(Date.UTC(2026, 0, 1, 0, 19)), refreshBucket(Date.UTC(2026, 0, 1, 0, 20)));
});
