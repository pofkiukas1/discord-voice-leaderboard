// Small pure helpers for server-wide "last to leave" announcements.
export function isLastToLeave(oldChannelId, newChannelId, beforeCount, afterCount) {
  return Boolean(oldChannelId) && !newChannelId && beforeCount === 1 && afterCount === 0;
}

export function isProtectedMessage(id, leaderboardMessageId, loserMessageId) {
  return Boolean(id && (id === leaderboardMessageId || id === loserMessageId));
}

export function loserEmbed(userId, displayName, when = Date.now()) {
  const name = String(displayName || 'Unknown member')
    .replace(/\s+/g, ' ')
    .replace(/([\\*_~`|])/g, '\\$1')
    .slice(0, 90);
  return {
    title: '💀  LAST TO LEAVE  ·  THE LOSER',
    color: 0xE74C3C,
    description: `**${name}** (<@${userId}>) was the last person to leave voice.\n\n🏳️ The server is now empty — until the next round.`,
    footer: { text: 'Last recorded full-server voice exit' },
    timestamp: new Date(when).toISOString(),
  };
}
