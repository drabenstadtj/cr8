#!/bin/sh
echo "[setup] Initializing cron jobs..."

# Upgrade yt-dlp once at startup while still root
apk add --upgrade yt-dlp > /dev/null 2>&1

# Handle PUID/PGID so created files match the host user (avoids permission issues with beets etc.)
PUID=${PUID:-0}
PGID=${PGID:-0}

if [ "$PUID" != "0" ] || [ "$PGID" != "0" ]; then
    echo "[setup] Configuring user UID=$PUID GID=$PGID"
    addgroup -g "$PGID" explo 2>/dev/null || true
    adduser -D -H -u "$PUID" -G explo explo 2>/dev/null || true
    chown -R "$PUID:$PGID" /opt/explo
    EXEC="su-exec $PUID:$PGID"
else
    EXEC=""
fi

# $CRON_SCHEDULE was deprecated in v0.11.0, keeping this block for backwards compatibility
if [ -n "$CRON_SCHEDULE" ]; then
    echo "$CRON_SCHEDULE $EXEC sh -c 'cd /opt/explo && ./explo' >> /proc/1/fd/1 2>&1"
    chmod 600 /etc/crontabs/root
    echo "[setup] Registered single CRON_SCHEDULE job: $CRON_SCHEDULE"
    crond -f -l 2
fi

# Loop over all *_SCHEDULE environment variables
for var in $(env | grep "_SCHEDULE=" | cut -d= -f1); do
  job="${var%_SCHEDULE}"                     # Job name (e.g WEEKLY_EXPLORATION)
  schedule="$(printenv "$var")"              # Cron schedule
  flags_var="${job}_FLAGS"
  flags="$(printenv "$flags_var")"           # e.g. --playlist weekly-exploration

  if [ -z "$schedule" ]; then
    echo "[setup] Skipping $job: schedule is empty"
    continue
  fi

  cmd="$EXEC sh -c 'cd /opt/explo && ./explo $flags' >> /proc/1/fd/1 2>&1"

  echo "$schedule $cmd" >> /etc/crontabs/root
  echo "[setup] Registered job: $job"
  echo "        Schedule: $schedule"
  echo "        Command : ./explo $flags"
done

chmod 600 /etc/crontabs/root

echo "[setup] Starting cron..."

if [ "$EXECUTE_ON_START" = "true" ]; then
    echo "[setup] Executing startup task..."
    $EXEC sh -c "cd /opt/explo && ./explo $START_FLAGS"
fi

crond -f -l 2
