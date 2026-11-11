export const INTERVAL_MS = 20 * 60_000;
export const LEADERBOARD_SIZE = 15;

export function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function leaderboardRows(rows, now = Date.now(), limit = LEADERBOARD_SIZE) {
  return rows
    .map((row) => ({
      userId: String(row.user_id),
      milliseconds: Number(row.total_ms) +
        (row.started_at_ms == null ? 0 : Math.max(0, now - Number(row.started_at_ms))),
    }))
    .filter((row) => row.milliseconds > 0)
    .sort((a, b) => b.milliseconds - a.milliseconds || a.userId.localeCompare(b.userId))
    .slice(0, limit);
}

export function leaderboardEmbed(rows, now = Date.now()) {
  const ranked = leaderboardRows(rows, now);
  return {
    title: '🏆 Voice Activity Leaderboard',
    description: ranked.length
      ? ranked.map((row, i) => `${i + 1}. <@${row.userId}> — **${formatDuration(row.milliseconds)}**`).join('\n')
      : 'Nobody has logged any voice activity yet.',
    color: 0x5865f2,
    footer: { text: 'All-time voice activity • Refreshes every 20 minutes' },
    timestamp: new Date(now).toISOString(),
  };
}

export function refreshBucket(now = Date.now()) {
  return Math.floor(now / INTERVAL_MS);
}
