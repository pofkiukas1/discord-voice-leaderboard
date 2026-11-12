import 'dotenv/config';
import { Client, GatewayIntentBits, Events, SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { isLastToLeave, isProtectedMessage, loserEmbed } from './last-leaver.js';
import { resolve } from 'node:path';
import { VoiceStore } from './store.js';
import { leaderboardEmbeds, leaderboardRows, refreshBucket } from './leaderboard.js';
import { snapshotTotals, findOvertakes, nextRoast, overtakeMessage } from './overtakes.js';

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const initialChannelId = process.env.DISCORD_CHANNEL_ID?.trim() || null;
if (!token || !guildId || [token, guildId].some((x) => x.startsWith('replace_with_'))) {
  console.error('Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID in .env');
  process.exit(1);
}

const store = new VoiceStore(resolve(process.env.DB_PATH || './data/voice.sqlite'));
const lastSavedCheckpoint = Number(store.setting('last_checkpoint_ms')) || Date.now();
store.stopAll(lastSavedCheckpoint);
store.setSetting('last_checkpoint_ms', Date.now());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages],
  allowedMentions: { parse: [] },
});

let connected = false;
let publishing = false;
let stopped = false;
let lastBucket = refreshBucket();
let lastLoserPublish = Promise.resolve();
let rankingSnapshot = null;
// Reload the previous checked ranking after a bot restart. Earlier versions
// did not persist this, so the first check after upgrading sets the baseline.
try {
  const saved = store.setting('overtake_ranking_snapshot_v2');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
        Object.entries(parsed).every(([id, ms]) => id.length > 0 && Number.isFinite(ms) && ms >= 0)) {
      rankingSnapshot = parsed;
    }
  }
} catch (error) {
  console.warn('Stored overtake ranking could not be loaded:', error.message);
}
let maintenanceQueue = Promise.resolve();

// The selected channel is persisted in SQLite; the environment variable is an optional default.
function configuredChannelId() {
  return store.setting('leaderboard_channel_id') || initialChannelId;
}

// Keep the existing channel selected in SQLite, and never change it afterwards.
async function resolveDisplayName(userId) {
  try {
    const guild = client.guilds.cache.get(guildId);
    const member = await guild?.members.fetch(userId);
    if (member) return member.displayName;
    const user = await client.users.fetch(userId);
    return user.globalName || user.username;
  } catch (error) {
    console.warn('Could not fetch display name for ' + userId + ': ' + error.message);
    return 'Dalyvis ' + userId;
  }
}

async function announceOvertake(overtakerId, passedId) {
  const channelId = configuredChannelId();
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    const [overtakerName, passedName] = await Promise.all([
      resolveDisplayName(overtakerId),
      resolveDisplayName(passedId),
    ]);
    const post = await channel.send({
      content: overtakeMessage(overtakerName, passedName, nextRoast(store)),
      allowedMentions: { parse: [] },
    });
    store.setSetting('overtake_message_id', post.id);
    console.log('Announced overtake:', overtakerId, passedId);
  } catch (error) {
    console.error('Overtake announcement failed:', error);
  }
}

async function checkOvertakesAndClean() {
  const channelId = configuredChannelId();
  if (!connected || stopped || !channelId) {
    return { deleted: 0, failed: 0, error: 'Bot is not connected or no leaderboard channel is configured.' };
  }
  const totals = snapshotTotals(store.totals(), Date.now());
  if (rankingSnapshot !== null) {
    for (const event of findOvertakes(rankingSnapshot, totals, 5)) {
      await announceOvertake(event.overtakerId, event.passedId);
    }
  }
  rankingSnapshot = totals;
  store.setSetting('overtake_ranking_snapshot_v2', JSON.stringify(totals));
  let deleted = 0;
  let failed = 0;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error('Saved leaderboard channel is not a text channel.');
    }
    const me = channel.guild.members.me ?? await channel.guild.members.fetchMe();
    const permissions = channel.permissionsFor(me);
    const needed = [
      [PermissionFlagsBits.ViewChannel, 'View Channel'],
      [PermissionFlagsBits.ReadMessageHistory, 'Read Message History'],
      [PermissionFlagsBits.ManageMessages, 'Manage Messages'],
    ];
    const missing = needed.filter(([flag]) => !permissions?.has(flag)).map(([, name]) => name);
    if (missing.length) {
      const error = 'Missing bot permissions in leaderboard channel: ' + missing.join(', ');
      console.error('Leaderboard channel cleanup failed:', error);
      return { deleted, failed, error };
    }

    let before;
    while (!stopped && configuredChannelId() === channelId) {
      const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!page.size) break;
      before = page.last().id;
      const keep = new Set([
        store.setting('leaderboard_message_id'),
        store.setting('loser_message_id'),
        store.setting('overtake_message_id'),
      ].filter(Boolean));
      const candidates = [...page.values()].filter((message) => {
        if (keep.has(message.id)) return false;
        // Don't race the bot while it posts a new leaderboard or announcement.
        return message.author?.id !== client.user?.id ||
          Date.now() - message.createdTimestamp >= 15_000;
      });
      const bulkCutoff = Date.now() - 13 * 24 * 60 * 60 * 1000;
      const recent = candidates.filter((message) => message.createdTimestamp > bulkCutoff);
      const older = candidates.filter((message) => message.createdTimestamp <= bulkCutoff);

      if (recent.length > 1) {
        try {
          const result = await channel.bulkDelete(recent.map((message) => message.id), true);
          deleted += result.size;
        } catch (error) {
          console.warn('Bulk cleanup failed; retrying messages individually:', error.message);
          older.push(...recent);
        }
      } else {
        older.push(...recent);
      }
      for (const message of older) {
        if (stopped || configuredChannelId() !== channelId) break;
        try {
          await message.delete();
          deleted++;
        } catch (error) {
          if (error.code === 10008) continue;
          failed++;
          console.warn('Leaderboard channel message deletion failed:', error.message);
          // Don't hammer the API for each individual message if authorization is missing.
          if (error.code === 50013 || error.code === 50001) {
            const reason = 'Discord denied message deletion (' + error.code + '). Grant the bot Manage Messages and Read Message History.';
            console.error('Leaderboard channel cleanup failed:', reason);
            return { deleted, failed, error: reason };
          }
        }
      }
      if (page.size < 100) break;
    }
    console.log('Leaderboard cleanup finished:', { deleted, failed, channelId });
    return { deleted, failed, error: null };
  } catch (error) {
    console.error('Leaderboard channel cleanup failed:', error);
    return { deleted, failed, error: error.message || String(error) };
  }
}
function queueMaintenance() {
  maintenanceQueue = maintenanceQueue.catch((error) => console.error(error))
    .then(() => checkOvertakesAndClean());
  return maintenanceQueue;
}

// This remains a separate bot message; subsequent losers edit the same post.
async function publishLastLoser() {
  const id = store.setting('last_loser_user_id');
  const channelId = configuredChannelId();
  if (!connected || stopped || !id || !channelId) return false;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') return false;
    const payload = {
      embeds: [loserEmbed(id, store.setting('last_loser_name'), Number(store.setting('last_loser_at')) || Date.now())],
      allowedMentions: { parse: [] },
    };
    const messageId = store.setting('loser_message_channel_id') === channelId
      ? store.setting('loser_message_id') : null;
    if (messageId) {
      try {
        const current = await channel.messages.fetch(messageId);
        await current.edit(payload);
        return true;
      } catch (error) {
        if (error.code !== 10008) throw error;
      }
    }
    const message = await channel.send(payload);
    store.setSetting('loser_message_id', message.id);
    store.setSetting('loser_message_channel_id', channelId);
    console.log('Updated last-to-leave announcement:', message.id);
    return true;
  } catch (error) {
    console.error('Last-to-leave announcement failed:', error);
    return false;
  }
}
function queueLoserAnnouncement() {
  lastLoserPublish = lastLoserPublish.catch(() => false).then(() => publishLastLoser());
  return lastLoserPublish;
}

function voiceMembers(guild) {
  return [...guild.voiceStates.cache.values()]
    .filter((state) => state.channelId && state.id !== client.user?.id && state.member?.user?.bot !== true)
    .map((state) => ({ userId: state.id, channelId: state.channelId }));
}

async function publish() {
  if (publishing || !connected || stopped) return false;
  const channelId = configuredChannelId();
  if (!channelId) return false;
  publishing = true;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
      throw new Error('Target is not a writable text channel.');
    }
    const allRows = store.totals();
    const ranked = leaderboardRows(allRows, Date.now());
    const profiles = {};
    const guild = client.guilds.cache.get(guildId);
    // Names are needed for everyone in the Top 15; avatars remain for the podium.
    await Promise.all(ranked.map(async ({ userId }) => {
      try {
        let member = guild?.members.cache.get(userId);
        if (!member && guild) {
          try { member = await guild.members.fetch(userId); }
          catch { /* Member may have left the server; try the user profile. */ }
        }
        if (member) {
          profiles[userId] = {
            name: member.displayName,
            avatarUrl: member.displayAvatarURL({ extension: 'png', size: 128 }),
          };
        } else {
          const user = await client.users.fetch(userId);
          profiles[userId] = {
            name: user.globalName || user.username,
            avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }),
          };
        }
      } catch (error) {
        console.warn('Profile lookup failed for ' + userId + ': ' + error.message);
      }
    }));
    const embeds = leaderboardEmbeds(allRows, Date.now(), profiles, guild?.iconURL({ extension: 'png', size: 128 }));
    const payload = { embeds, allowedMentions: { parse: [] } };
    const messageId = store.setting('leaderboard_message_id');
    if (messageId) {
      try {
        const message = await channel.messages.fetch(messageId);
        await message.edit(payload);
        console.log('Updated leaderboard:', message.id);
        return true;
      } catch (error) {
        if (error.code !== 10008) throw error;
        console.log('Previous leaderboard was deleted; creating a replacement.');
      }
    }
    const message = await channel.send(payload);
    store.setSetting('leaderboard_message_id', message.id);
    console.log('Created leaderboard message:', message.id);
    return true;
  } catch (error) {
    console.error('Leaderboard publish failed:', error);
    return false;
  } finally {
    publishing = false;
  }
}

// Admins choose the destination directly using Discord's built-in text channel picker.
async function registerCommands(guild) {
  const command = new SlashCommandBuilder()
    .setName('leaderboard-channel')
    .setDescription('Choose the text channel for voice activity rankings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Text channel where the leaderboard will appear')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true));
  const checkNow = new SlashCommandBuilder()
    .setName('checknow')
    .setDescription('Refresh the voice activity leaderboard immediately')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
  await guild.commands.create(command.toJSON());
  await guild.commands.create(checkNow.toJSON());
  console.log('Registered /leaderboard-channel and /checknow commands');
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() ||
      !['leaderboard-channel', 'checknow'].includes(interaction.commandName) ||
      interaction.guildId !== guildId) return;
  try {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: 'You need Manage Server permission for this command.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.commandName === 'checknow') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (!configuredChannelId()) {
        await interaction.editReply('Select a text channel first using /leaderboard-channel.');
        return;
      }
      if (!connected) {
        await interaction.editReply('Discord connection is still starting. Try again shortly.');
        return;
      }
      if (publishing) {
        await interaction.editReply('The leaderboard is already being refreshed. Try again shortly.');
        return;
      }
      const updated = await publish();
      let cleanup = null;
      if (updated) {
        await queueLoserAnnouncement();
        cleanup = await queueMaintenance();
      }
      const status = !updated
        ? 'Could not refresh the leaderboard. Check the bot logs.'
        : cleanup?.error
          ? 'Leaderboard updated, but cleanup failed: ' + cleanup.error
          : 'Leaderboard updated in <#' + configuredChannelId() + '>. Deleted ' +
            (cleanup?.deleted ?? 0) + ' unrelated messages.' +
            (cleanup?.failed ? ' Failed to delete ' + cleanup.failed + ' messages; check bot logs.' : '');
      await interaction.editReply(status);
      return;
    }
    const channel = interaction.options.getChannel('channel', true);
    if (channel.type !== ChannelType.GuildText || channel.guildId !== guildId) {
      await interaction.reply({ content: 'Please select a text channel on this server.', flags: MessageFlags.Ephemeral });
      return;
    }
    const saved = configuredChannelId();
    if (saved && saved !== channel.id) {
      await interaction.reply({
        content: 'The leaderboard is permanently locked to <#' + saved + '>. It cannot be changed.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages,
    ])) {
      await interaction.reply({
        content: 'I need View Channel, Send Messages, Embed Links, Read Message History and Manage Messages in that channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!saved) store.setSetting('leaderboard_channel_id', channel.id);
    const posted = await publish();
    if (posted) {
      await queueLoserAnnouncement();
      await queueMaintenance();
    }
    await interaction.editReply(posted
      ? 'Leaderboard fixed to <#' + channel.id + '>. Unrelated messages are cleared at every check.'
      : 'Channel saved, but posting failed. Check the bot logs.');
  } catch (error) {
    console.error('Selecting leaderboard channel failed:', error);
    try {
      const errorReply = { content: 'Unable to set the leaderboard channel. Check bot logs.' };
      if (interaction.deferred || interaction.replied) await interaction.editReply(errorReply);
      else await interaction.reply({ ...errorReply, flags: MessageFlags.Ephemeral });
    } catch (replyError) {
      console.error('Unable to send command error reply:', replyError);
    }
  }
});

async function syncFromGuild(guild) {
  if (guild.id !== guildId) return;
  store.reconcile(voiceMembers(guild));
  connected = true;
  console.log(`Tracking ${guild.voiceStates.cache.filter((s) => s.channelId).size} live voice connections`);
  await publish();
  await queueLoserAnnouncement();
  // Do not reset the previous ranking during startup or a gateway reconnect:
  // otherwise /checknow could miss an overtake since the last scheduled check.
  if (configuredChannelId()) void queueMaintenance();
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.error('Bot cannot see the configured guild. Confirm the Guild ID and bot invitation.');
    await client.destroy();
    process.exitCode = 1;
    return;
  }
  await syncFromGuild(guild);
  try {
    await registerCommands(guild);
    if (!configuredChannelId()) console.log('No channel selected yet. Use /leaderboard-channel in Discord.');
  } catch (error) {
    console.error('Could not register /leaderboard-channel:', error);
  }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (newState.guild.id !== guildId || !connected) return;
  const id = newState.id;
  if (id === client.user?.id) return;
  if (newState.member?.user?.bot || oldState.member?.user?.bot) {
    store.leave(id);
    return;
  }
  const beforeCount = store.activeCount();
  if (newState.channelId) store.join(id, newState.channelId);
  else store.leave(id);

  if (isLastToLeave(oldState.channelId, newState.channelId, beforeCount, store.activeCount())) {
    const member = newState.member || oldState.member;
    const name = member?.displayName || member?.user?.username || 'Member ' + id;
    store.setSetting('last_loser_user_id', id);
    store.setSetting('last_loser_name', name);
    store.setSetting('last_loser_at', Date.now());
    console.log('Last member to leave voice:', name, id);
    void queueLoserAnnouncement();
  }
});

client.on(Events.ShardResume, async () => {
  const guild = client.guilds.cache.get(guildId);
  if (guild) await syncFromGuild(guild);
});
client.on(Events.GuildCreate, async (guild) => {
  if (connected && guild.id === guildId) await syncFromGuild(guild);
});
function pauseTracking() {
  if (connected) {
    connected = false;
    const now = Date.now();
    store.stopAll(now);
    store.setSetting('last_checkpoint_ms', now);
    console.warn('Gateway disconnected; closed active sessions until reconnect.');
  }
}
client.on(Events.ShardReconnecting, pauseTracking);
client.on(Events.ShardDisconnect, pauseTracking);
client.on(Events.Error, (error) => console.error('Discord client error:', error));

const timer = setInterval(async () => {
  if (!connected || stopped) return;
  try {
    const now = Date.now();
    store.checkpoint(now);
    store.setSetting('last_checkpoint_ms', now);
    const bucket = refreshBucket(now);
    if (bucket !== lastBucket) {
      lastBucket = bucket;
      const posted = await publish();
      if (posted) await queueMaintenance();
    }
  } catch (error) {
    console.error('Maintenance task failed:', error);
  }
}, 60_000);
timer.unref();

async function shutdown(signal) {
  if (stopped) return;
  stopped = true;
  console.log(`Received ${signal}; saving totals.`);
  clearInterval(timer);
  try {
    const now = Date.now();
    store.stopAll(now);
    store.setSetting('last_checkpoint_ms', now);
    await client.destroy();
    store.close();
    process.exit(0);
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exit(1);
  }
}
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

client.login(token).catch((error) => {
  console.error('Discord login failed:', error);
  process.exit(1);
});
