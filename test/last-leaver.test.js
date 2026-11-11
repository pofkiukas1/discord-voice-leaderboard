import test from 'node:test';
import assert from 'node:assert/strict';
import { isLastToLeave, isProtectedMessage, loserEmbed } from '../src/last-leaver.js';
import { VoiceStore } from '../src/store.js';

test('only the final server-wide voice departure is a loser', () => {
  assert.equal(isLastToLeave('vc-a', null, 2, 1), false);
  assert.equal(isLastToLeave('vc-b', null, 1, 0), true);
  assert.equal(isLastToLeave('vc-a', 'vc-b', 1, 1), false);
  assert.equal(isLastToLeave(null, 'vc-a', 0, 1), false);
  assert.equal(isLastToLeave('vc-a', null, 0, 0), false);
});

test('the loser announcement includes a displayed name and user reference', () => {
  const embed = loserEmbed('12345', 'Some_One', Date.UTC(2026, 10, 11));
  assert.match(embed.description, /Some\\_One/);
  assert.match(embed.description, /<@12345>/);
  assert.match(embed.title, /LOSER/);
});

test('only leaderboard and current loser posts are protected', () => {
  assert.equal(isProtectedMessage('board', 'board', 'loser'), true);
  assert.equal(isProtectedMessage('loser', 'board', 'loser'), true);
  assert.equal(isProtectedMessage('random', 'board', 'loser'), false);
});

test('voice totals accurately identify the final participant across channels', () => {
  const s = new VoiceStore(':memory:');
  try {
    s.join('one', 'channel-A', 1000);
    s.join('two', 'channel-B', 1000);
    assert.equal(s.activeCount(), 2);
    s.leave('one', 5000);
    assert.equal(s.activeCount(), 1);
    s.leave('two', 8000);
    assert.equal(s.activeCount(), 0);
    assert.equal(s.totals().find((r) => r.user_id === 'two').total_ms, 7000);
  } finally {
    s.close();
  }
});
