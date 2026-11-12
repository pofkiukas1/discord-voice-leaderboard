import { safeOvertakeName } from './overtakes.js';

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

export function activityBar(milliseconds, leaderMilliseconds, width = 10) {
  const proportion = leaderMilliseconds > 0 ? milliseconds / leaderMilliseconds : 0;
  const filled = milliseconds > 0 ? Math.max(1, Math.min(width, Math.round(proportion * width))) : 0;
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

export function leaderboardEmbeds(rows, now = Date.now(), userProfiles = {}, serverIconUrl = null) {
  const ranked = leaderboardRows(rows, now);
  const active = rows.filter((row) => row.started_at_ms != null).length;
  const leaderMs = ranked[0]?.milliseconds || 0;
  const embeds = [{
    title: '🎙️  VOICE ACTIVITY  ·  LEADERBOARD',
    description: 'Your server’s all-time voice rankings. Stay connected and climb the board.',
    color: 0x5865F2,
    fields: [
      { name: '🎧 In voice now', value: String(active), inline: true },
      { name: '🏆 Ranked members', value: String(rows.filter((r) => Number(r.total_ms) > 0 || r.started_at_ms != null).length), inline: true },
      { name: '⏱️ Next refresh', value: 'Every 20 min', inline: true },
    ],
    ...(serverIconUrl ? { thumbnail: { url: serverIconUrl } } : {}),
    footer: { text: 'Use /checknow for an instant refresh • All-time stats' },
    timestamp: new Date(now).toISOString(),
  }];

  if (ranked.length === 0) {
    embeds[0].description = 'Nobody has recorded voice activity yet. Join a voice channel to start your climb!';
    return embeds;
  }

  const medals = [
    { medal: '🥇', color: 0xF7C948, label: 'CHAMPION' },
    { medal: '🥈', color: 0xA8B7C9, label: 'RUNNER-UP' },
    { medal: '🥉', color: 0xDB9365, label: 'THIRD PLACE' },
  ];

  for (let i = 0; i < Math.min(3, ranked.length); i++) {
    const row = ranked[i];
    const { medal, color, label } = medals[i];
    const profile = userProfiles[row.userId] || {};
    const name = safeOvertakeName(profile.name || `Member #${i + 1}`);
    const percent = leaderMs ? Math.round(row.milliseconds / leaderMs * 100) : 0;
    embeds.push({
      color,
      author: {
        name: `${medal}  #${i + 1}  ${name}  ·  ${label}`,
        ...(profile.avatarUrl ? { icon_url: profile.avatarUrl } : {}),
      },
      description: `**${formatDuration(row.milliseconds)}** in voice\n${activityBar(row.milliseconds, leaderMs, 12)}  **${percent}%**`,
    });
  }

  if (ranked.length > 3) {
    embeds.push({
      title: '✨  THE REST OF THE TOP 15',
      color: 0x28B7BA,
      description: ranked.slice(3).map((row, index) =>
        `**${String(index + 4).padStart(2, '0')}**  **${safeOvertakeName(userProfiles[row.userId]?.name || `Member #${index + 4}`)}**  ·  **${formatDuration(row.milliseconds)}**\n${activityBar(row.milliseconds, leaderMs, 10)}`
      ).join('\n'),
    });
  }
  return embeds;
}

// Backwards-compatible helper for anyone importing the earlier one-embed renderer.
export function leaderboardEmbed(rows, now = Date.now(), userProfiles = {}) {
  const ranked = leaderboardRows(rows, now);
  return {
    title: '🏆 Voice Activity Leaderboard',
    description: ranked.length
      ? ranked.map((row, i) => `${i + 1}. ${safeOvertakeName(userProfiles[row.userId]?.name || `Member #${i + 1}`)} — **${formatDuration(row.milliseconds)}**`).join('\n')
      : 'Nobody has logged any voice activity yet.',
    color: 0x5865F2,
    footer: { text: 'All-time voice activity • Refreshes every 20 minutes' },
    timestamp: new Date(now).toISOString(),
  };
}

export function refreshBucket(now = Date.now()) {
  return Math.floor(now / INTERVAL_MS);
}
