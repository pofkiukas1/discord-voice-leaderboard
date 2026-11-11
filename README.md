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
3. In Discord user settings, enable **Developer Mode** and right-click your server to copy its Server ID. The leaderboard channel is now selected with a Discord command.
4. In the Developer Portal **Installation** settings, include the `applications.commands` scope along with `bot` (re-invite the bot if needed). No privileged Discord intents are required.

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

Set `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID`. `DISCORD_CHANNEL_ID` is optional; you can select the text channel from Discord using `/leaderboard-channel #channel`. Only members with **Manage Server** permission can use this command. The choice is saved in SQLite and survives restarts. The token must remain on the VM, **never in GitHub**. The sample `.gitignore` excludes `.env` and `data/`.

Test it interactively with `npm start`. When it logs in, run `/leaderboard-channel` in Discord and choose a text channel from the picker; the bot will post immediately and update every 20 minutes. Stop with Ctrl+C, then enable the background service:

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

## GitHub Actions (CI/CD)

The [test/deploy workflow](.github/workflows/ci-deploy.yml) runs syntax checks and unit tests on pushes to `main` and pull requests targeting `main`.

**Deploying is optional**. To set it up, create a dedicated SSH deploy key rather than uploading your personal Oracle private key.

### On the Oracle VM

Generate a deploy key and add it to the Ubuntu user's `authorized_keys`. You can use:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_actions_deploy -N "" -C "github-actions-deploy"
cat ~/.ssh/github_actions_deploy.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Transfer the **private** key securely into a GitHub Actions secret, then delete the server-side private copy when the connection works. Do not put the key in the repository or paste it into chat. A separate narrowly scoped deployment user is preferable for production; these instructions use `ubuntu` for simplicity.

Enable a narrow passwordless sudo rule for the bot service, **not** unrestricted passwordless sudo:

```bash
sudo visudo -f /etc/sudoers.d/discord-bot-deploy
```

Add this line (adjust the username if required):

```text
ubuntu ALL=(root) NOPASSWD: /usr/bin/systemctl restart discord-voice-leaderboard, /usr/bin/systemctl is-active --quiet discord-voice-leaderboard
```

The bundled `systemd` service must already exist and be running before deploying through Actions.

### In GitHub

Go to **Settings → Secrets and variables → Actions → Secrets**, and create:

- `ORACLE_HOST`: Oracle VM public IPv4 address.
- `ORACLE_SSH_KEY`: complete contents of the **dedicated deploy private key**.
- `ORACLE_KNOWN_HOSTS`: verified SSH host public key entry for the Oracle VM. Obtain the fingerprint from a trusted session or Oracle console and independently verify before trusting; do not blindly trust the output of `ssh-keyscan`.

Your Discord bot token stays in `/home/ubuntu/discord-voice-leaderboard/.env` on Oracle, not in GitHub Actions.

To deploy manually, go to **Actions → Test and deploy Discord bot → Run workflow**.

To deploy automatically after tests pass on a push to `main`, set repository variable `ORACLE_AUTO_DEPLOY` to `true` under **Settings → Secrets and variables → Actions → Variables**.

**Note:** GitHub Actions runs are not a replacement for a continuously running Oracle VM. GitHub Actions only handles testing and deployment; the bot stays online through `systemd` on Oracle.
