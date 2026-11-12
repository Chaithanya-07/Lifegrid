#!/bin/sh
# Starts the API on the port the platform assigns ($PORT, default 8080) as the unprivileged "app" user.
# Persistent volumes are mounted root-owned, so fix ownership of the data folder first, then drop privileges.
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/backups" "$DATA_DIR/attachments" "$DATA_DIR/keys"

export ASPNETCORE_URLS="http://0.0.0.0:${PORT:-8080}"

if [ "$(id -u)" = "0" ]; then
  chown -R app:app "$DATA_DIR"
  chmod 700 "$DATA_DIR/keys"
  exec setpriv --reuid=app --regid=app --init-groups dotnet /app/TaskFlow.Api.dll
fi
exec dotnet /app/TaskFlow.Api.dll
