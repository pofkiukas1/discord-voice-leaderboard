# Discord Voice Activity Leaderboard

A self-hosted Discord bot that tracks time in **any voice channel** and edits one leaderboard message every **20 minutes**. Designed for an Oracle Cloud Always Free Ubuntu VM.

## Features

- Records all-time cumulative voice time per member; switching channels does not reset time
- Counts muted and deafened members
- Uses SQLite, with checkpoints every minute, so totals survive process and VM restarts
- Updates a single leaderboard message at UTC :00, :20, :40
- Starts automatically with `systemd` and restarts after failures
- Does not require privileged Discord intents or joining voice channels

## Discord setup

Use the Discord Developer Portal application (application ID `738733401460441150`).

1. Open **Bot** and copy or reset its **bot token**. Never post it or commit it.
2. In **Installation**, enable **Guild Install**, add `bot` scope and the permissions **View Channels**, **Send Messages**, **Embed Links**, and **Read Message History**. Use the generated install link to invite it to your server.
3. In Discord user settings, enable **Developer Mode**. Right-click your server and the target leaderboard text channel to copy their IDs.
4. No privileged Discord intents are required.

## Oracle VM setup (Ubuntu)

Connect using SSH. If your VM runs Oracle Linux rather than Ubuntu, use `opc` and adapt the package-manager and systemd user paths.

Install Node.js 24 (Node.js >=22.13 required for built-in SQLite):

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt-get install -y nodejs
node -v
```

Clone this repository and configure a private environment file:

```bash
cd ~
git clone https://github.com/pofkiukas1/discord-voice-leaderboard.git
cd discord-voice-leaderboard
npm install --omit=dev
cp .env.example .env
nano .env
chmod 600 .env
```

Set `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and `DISCORD_CHANNEL_ID`. The token must remain on the VM, **never in GitHub**. The sample `.gitignore` excludes `.env` and `data/`.

Test it interactively with `npm start`. Stop with Ctrl+C once it logs in and creates the leaderboard, then enable the background service:

```bash
sudo cp deploy/discord-voice-leaderboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now discord-voice-leaderboard
sudo systemctl status discord-voice-leaderboard --no-pager
sudo journalctl -u discord-voice-leaderboard -f
```

The bundled service assumes the Ubuntu username `ubuntu` and the working directory `/home/ubuntu/discord-voice-leaderboard`. Adjust both if your Linux username is different.

## Notes

- History starts when the bot first goes online. Discord does not provide historical voice-presence totals.
- Downtime is not counted. Sudden crashes may lose up to about a minute of uncheckpointed time.
- SQLite data is saved under `data/voice.sqlite`; **back up the `data/` folder** to preserve historical totals.
- The existing leaderboard message is edited. If deleted, it will be recreated.
- Oracle Always Free is subject to capacity and idle-reclamation policies; not guaranteed 100% uptime.

Run local tests: `npm test`.
