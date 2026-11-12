#!/usr/bin/env bash

set -euo pipefail

readonly APP_DIR="/home/ubuntu/DiscordRobot"

exec 9>/var/lock/discordrobot-deploy.lock
if ! flock -n 9; then
  echo "Another deployment is already running."
  exit 1
fi

sudo -H -u ubuntu git -C "$APP_DIR" fetch origin master

local_commit="$(sudo -H -u ubuntu git -C "$APP_DIR" rev-parse HEAD)"
remote_commit="$(sudo -H -u ubuntu git -C "$APP_DIR" rev-parse origin/master)"

if [[ "$local_commit" == "$remote_commit" ]]; then
  echo "Already up to date: $local_commit"
  exit 0
fi

sudo -H -u ubuntu git -C "$APP_DIR" merge --ff-only origin/master
sudo -H -u ubuntu bash -c \
  "cd '$APP_DIR' && npm ci && npm run build && npm run register-commands"

systemctl restart discordrobot
echo "Deployed: $remote_commit"
