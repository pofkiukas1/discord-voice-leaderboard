import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { resolve } from 'node:path';
import { VoiceStore } from './store.js';
import { leaderboardEmbed, refreshBucket } from './leaderboard.js';

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const channelId = process.env.DISCORD_CHANNEL_ID;
if (!token || !guildId || !channelId || [token, guildId, channelId].some((x) => x.startsWith('replace_with_'))) {
  console.error('Set DISCORD_BOT_TOKEN, DISCORD_GUILD_ID and DISCORD_CHANNEL_ID in .env');
  process.exit(1);
}

const store = new VoiceStore(resolve(process.env.DB_PATH || './data/voice.sqlite'));
const lastSavedCheckpoint = Number(store.setting('last_checkpoint_ms')) || Date.now();
store.stopAll(lastSavedCheckpoint);
store.setSetting('last_checkpoint_ms', Date.now());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  allowedMentions: { parse: [] },
});

let connected = false;
let publishing = false;
let stopped = false;
let lastBucket = refreshBucket();

function voiceMembers(guild) {
  return [...guild.voiceStates.cache.values()]
    .filter((state) => state.channelId && state.id !== client.user?.id && state.member?.user?.bot !== true)
    .map((state) => ({ userId: state.id, channelId: state.channelId }));
}

async function publish() {
  if (publishing || !connected || stopped) return;
  publishing = true;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
      throw new Error('Target is not a writable text channel.');
    }
    const embed = leaderboardEmbed(store.totals());
    const payload = { embeds: [embed], allowedMentions: { parse: [] } };
    const messageId = store.setting('leaderboard_message_id');
    if (messageId) {
      try {
        const message = await channel.messages.fetch(messageId);
        await message.edit(payload);
        console.log('Updated leaderboard:', message.id);
        return;
      } catch (error) {
        if (error.code !== 10008) throw error;
        console.log('Previous leaderboard was deleted; creating a replacement.');
      }
    }
    const message = await channel.send(payload);
    store.setSetting('leaderboard_message_id', message.id);
    console.log('Created leaderboard message:', message.id);
  } catch (error) {
    console.error('Leaderboard publish failed:', error);
  } finally {
    publishing = false;
  }
}

async function syncFromGuild(guild) {
  if (guild.id !== guildId) return;
  store.reconcile(voiceMembers(guild));
  connected = true;
  console.log(`Tracking ${guild.voiceStates.cache.filter((s) => s.channelId).size} live voice connections`);
  await publish();
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
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (newState.guild.id !== guildId || !connected) return;
  const id = newState.id;
  if (id === client.user?.id) return;
  if (newState.member?.user?.bot || oldState.member?.user?.bot) {
    store.leave(id);
    return;
  }
  if (newState.channelId) store.join(id, newState.channelId);
  else store.leave(id);
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
