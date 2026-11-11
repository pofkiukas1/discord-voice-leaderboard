import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class VoiceStore {
  constructor(file) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        total_ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS active (
        user_id TEXT PRIMARY KEY REFERENCES users(user_id),
        channel_id TEXT NOT NULL,
        started_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.insertUser = this.db.prepare('INSERT OR IGNORE INTO users(user_id, total_ms) VALUES (?, 0)');
    this.getActive = this.db.prepare('SELECT channel_id, started_at_ms FROM active WHERE user_id = ?');
    this.setActive = this.db.prepare('INSERT INTO active(user_id, channel_id, started_at_ms) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET channel_id = excluded.channel_id, started_at_ms = excluded.started_at_ms');
    this.updateChannel = this.db.prepare('UPDATE active SET channel_id = ? WHERE user_id = ?');
    this.addTime = this.db.prepare('UPDATE users SET total_ms = total_ms + ? WHERE user_id = ?');
    this.removeActive = this.db.prepare('DELETE FROM active WHERE user_id = ?');
    this.listActive = this.db.prepare('SELECT user_id, channel_id, started_at_ms FROM active');
    this.countActive = this.db.prepare('SELECT COUNT(*) AS count FROM active');
    this.listTotals = this.db.prepare('SELECT users.user_id, users.total_ms, active.started_at_ms FROM users LEFT JOIN active ON users.user_id = active.user_id');
    this.getSetting = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    this.putSetting = this.db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  join(userId, channelId, now = Date.now()) {
    if (!channelId) return this.leave(userId, now);
    this.transaction(() => {
      this.insertUser.run(userId);
      const active = this.getActive.get(userId);
      if (!active) this.setActive.run(userId, channelId, now);
      else if (active.channel_id !== channelId) this.updateChannel.run(channelId, userId);
    });
  }

  leave(userId, now = Date.now()) {
    this.transaction(() => this._leave(userId, now));
  }

  _leave(userId, now) {
    const active = this.getActive.get(userId);
    if (!active) return;
    this.addTime.run(Math.max(0, now - Number(active.started_at_ms)), userId);
    this.removeActive.run(userId);
  }

  checkpoint(now = Date.now()) {
    this.transaction(() => {
      for (const row of this.listActive.all()) {
        this.addTime.run(Math.max(0, now - Number(row.started_at_ms)), row.user_id);
        this.setActive.run(row.user_id, row.channel_id, now);
      }
    });
  }

  stopAll(now = Date.now()) {
    this.transaction(() => {
      for (const row of this.listActive.all()) this._leave(row.user_id, now);
    });
  }

  reconcile(voiceMembers, now = Date.now()) {
    this.transaction(() => {
      const incoming = new Map(voiceMembers.map((v) => [String(v.userId), String(v.channelId)]));
      for (const row of this.listActive.all()) {
        if (!incoming.has(row.user_id)) this._leave(row.user_id, now);
      }
      for (const [userId, channelId] of incoming) {
        this.insertUser.run(userId);
        const row = this.getActive.get(userId);
        if (!row) this.setActive.run(userId, channelId, now);
        else if (row.channel_id !== channelId) this.updateChannel.run(channelId, userId);
      }
    });
  }

  activeCount() { return Number(this.countActive.get().count); }
  totals() { return this.listTotals.all(); }
  setting(key) { return this.getSetting.get(key)?.value ?? null; }
  setSetting(key, value) { this.putSetting.run(key, String(value)); }
  close() { this.db.close(); }
}
