import test from 'node:test';
import assert from 'node:assert/strict';
import { leaderboardRows, leaderboardEmbed, leaderboardEmbeds, activityBar, formatDuration, refreshBucket } from '../src/leaderboard.js';

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

test('vibrant embeds include podium avatars and rankings without image files', () => {
  const rows = [
    { user_id: '111', total_ms: 9_000_000, started_at_ms: null },
    { user_id: '222', total_ms: 6_000_000, started_at_ms: null },
    { user_id: '333', total_ms: 3_000_000, started_at_ms: null },
    { user_id: '444', total_ms: 1_500_000, started_at_ms: null },
  ];
  const embeds = leaderboardEmbeds(rows, now, {
    '111': { name: 'Top Player', avatarUrl: 'https://cdn.discordapp.com/avatars/111/example.png' },
  });
  assert.equal(embeds.length, 5);
  assert.match(embeds[1].author.name, /Top Player/);
  assert.match(embeds[1].author.icon_url, /cdn.discordapp.com/);
  assert.match(embeds[4].description, /444/);
  assert.equal(embeds[0].fields.length, 3);
  assert.equal(activityBar(100, 100, 5), '▰▰▰▰▰');
  assert.equal(activityBar(0, 100, 5), '▱▱▱▱▱');
});

test('empty ranked embeds show join instruction', () => {
  const embeds = leaderboardEmbeds([], now);
  assert.equal(embeds.length, 1);
  assert.match(embeds[0].description, /Join a voice channel/);
});
