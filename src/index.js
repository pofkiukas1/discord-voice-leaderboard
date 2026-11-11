import 'dotenv/config';
import { Client, GatewayIntentBits, Events, SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { isLastToLeave, isProtectedMessage, loserEmbed } from './last-leaver.js';
import { resolve } from 'node:path';
import { VoiceStore } from './store.js';
import { leaderboardEmbeds, refreshBucket } from './leaderboard.js';

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
let cleanupTask = null;

// The selected channel is persisted in SQLite; the environment variable is an optional default.
function configuredChannelId() {
  return store.setting('leaderboard_channel_id') || initialChannelId;
}

function cleanupEnabled() {
  return store.setting('cleanup_enabled') === 'true';
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

// Cleanup is opt-in and ONLY affects the explicitly selected leaderboard text channel.
// It retains exactly the leaderboard and last-leaver messages, including across restarts.
async function cleanSelectedChannel() {
  const channelId = configuredChannelId();
  if (!channelId || !cleanupEnabled()) return;
  const channel = await client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  let before;
  let removed = 0;
  while (cleanupEnabled() && configuredChannelId() === channelId && !stopped) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    before = batch.last().id;
    const protectedIds = [
      store.setting('leaderboard_message_id'),
      store.setting('loser_message_id'),
    ];
    const now = Date.now();
    // During a concurrent post, never delete the bot's just-created message
    // before its ID has been persisted.
    const deleteList = [...batch.values()].filter((message) =>
      !isProtectedMessage(message.id, ...protectedIds) &&
      !(message.author?.id === client.user?.id && now - message.createdTimestamp < 15_000));
    const newer = deleteList.filter((message) => message.createdTimestamp > now - 13 * 24 * 3600_000);
    const older = deleteList.filter((message) => message.createdTimestamp <= now - 13 * 24 * 3600_000);
    if (newer.length >= 2) {
      try {
        const deleted = await channel.bulkDelete(newer.map((m) => m.id), true);
        removed += deleted.size;
      } catch (error) {
        console.warn('Bulk cleanup failed; trying individual deletes:', error.message);
        for (const message of newer) {
          try { await message.delete(); removed++; } catch (e) { console.warn('Cleanup failed:', e.message); }
        }
      }
    } else if (newer.length === 1) {
      try { await newer[0].delete(); removed++; } catch (error) { console.warn('Cleanup failed:', error.message); }
    }
    for (const message of older) {
      try { await message.delete(); removed++; } catch (error) { console.warn('Old message cleanup failed:', error.message); }
    }
    if (batch.size < 100) break;
  }
  if (removed) console.log('Cleaned ' + removed + ' unrelated messages from ' + channelId);
}
function scheduleChannelCleanup() {
  if (!cleanupEnabled()) return Promise.resolve();
  if (cleanupTask) return cleanupTask;
  cleanupTask = cleanSelectedChannel()
    .catch((error) => console.error('Leaderboard channel cleanup failed:', error))
    .finally(() => { cleanupTask = null; });
  return cleanupTask;
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
    const ranked = allRows.map((row) => ({
      userId: String(row.user_id),
      totalMs: Number(row.total_ms) +
        (row.started_at_ms == null ? 0 : Math.max(0, Date.now() - Number(row.started_at_ms))),
    })).sort((a, b) => b.totalMs - a.totalMs).slice(0, 3);

    const profiles = {};
    const guild = client.guilds.cache.get(guildId);
    await Promise.all(ranked.map(async ({ userId }) => {
      try {
        const member = await guild?.members.fetch(userId);
        if (member) {
          profiles[userId] = {
            name: member.displayName,
            avatarUrl: member.displayAvatarURL({ extension: 'png', size: 128 }),
          };
        } else {
          const user = await client.users.fetch(userId);
          profiles[userId] = { name: user.username, avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }) };
        }
      } catch (error) {
        console.warn('Avatar lookup failed for ' + userId + ': ' + error.message);
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
      .setRequired(true))
    .addBooleanOption((option) => option
      .setName('cleanup')
      .setDescription('PERMANENTLY delete all other messages from this text channel')
      .setRequired(false));
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
      if (updated) {
        await queueLoserAnnouncement();
        if (cleanupEnabled()) void scheduleChannelCleanup();
      }
      await interaction.editReply(updated
        ? '✅ Leaderboard updated just now in <#' + configuredChannelId() + '>.'
        : 'Could not refresh the leaderboard. Check the bot logs.');
      return;
    }
    const channel = interaction.options.getChannel('channel', true);
    if (channel.type !== ChannelType.GuildText || channel.guildId !== guildId) {
      await interaction.reply({ content: 'Please select a text channel on this server.', flags: MessageFlags.Ephemeral });
      return;
    }
    const oldChannelId = configuredChannelId();
    const changing = channel.id !== oldChannelId;
    const option = interaction.options.getBoolean('cleanup');
    const clean = option === null ? (!changing && cleanupEnabled()) : option;
    const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    const perms = channel.permissionsFor(me);
    if (!perms?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory,
    ])) {
      await interaction.reply({
        content: 'I need View Channel, Send Messages, Embed Links and Read Message History permissions in that channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (clean && !perms.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        content: 'For cleanup, grant me Manage Messages in that channel. This will permanently delete other messages there.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const oldMessageId = store.setting('leaderboard_message_id');
    const oldLoserMessageId = store.setting('loser_message_id');
    const changed = changing;
    if (changed) {
      store.setSetting('leaderboard_message_id', '');
      store.setSetting('loser_message_id', '');
    }
    store.setSetting('leaderboard_channel_id', channel.id);
    store.setSetting('cleanup_enabled', clean ? 'true' : 'false');
    const posted = await publish();
    if (posted) {
      await queueLoserAnnouncement();
      if (clean) void scheduleChannelCleanup();
    }
    if (posted && changed && oldChannelId) {
      try {
        const previous = await client.channels.fetch(oldChannelId);
        if (previous?.isTextBased()) {
          for (const id of [oldMessageId, oldLoserMessageId].filter(Boolean)) {
            try { await (await previous.messages.fetch(id)).delete(); }
            catch (error) { console.warn('Could not remove an old board message:', error.message); }
          }
        }
      } catch (error) {
        console.warn('Unable to access old leaderboard channel:', error.message);
      }
    }
    await interaction.editReply(posted
      ? 'Leaderboard channel set to <#' + channel.id + '>. Updates every 20 minutes. ' +
        (clean ? 'Cleanup ENABLED: all other messages in this channel will be permanently deleted.' : 'Cleanup disabled.')
      : 'Channel selection saved, but posting failed. Check the bot logs.');
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
  if (cleanupEnabled()) void scheduleChannelCleanup();
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
    void queueLoserAnnouncement().then(() => {
      if (cleanupEnabled()) void scheduleChannelCleanup();
    });
  }
});

// No Message Content intent is needed: only author, channel, and message IDs are used.
client.on(Events.MessageCreate, (message) => {
  if (message.guildId !== guildId ||
      message.channelId !== configuredChannelId() ||
      !cleanupEnabled() ||
      message.author?.id === client.user?.id ||
      isProtectedMessage(message.id, store.setting('leaderboard_message_id'), store.setting('loser_message_id'))) return;
  void message.delete().catch((error) => console.warn('Could not clean new message:', error.message));
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
      await publish();
      if (cleanupEnabled()) void scheduleChannelCleanup();
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
