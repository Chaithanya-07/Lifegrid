#!/bin/sh
# Starts the API on the port the platform assigns ($PORT, default 8080) as the unprivileged "app" user.
# Persistent volumes are mounted root-owned, so fix ownership of the data folder first, then drop
# privileges. On platforms that start the container as a non-root user the ownership fix is skipped
# (the data folders must already be writable); startup never fails on a folder it cannot create.
set -e

DATA_DIR="${DATA_DIR:-/data}"

# The bundled configuration only allows localhost, so a deployed service must answer its public host
# name. On Railway the domain is provisioned as RAILWAY_PUBLIC_DOMAIN; an explicit AllowedHosts is
# always left as set.
if [ -z "${AllowedHosts:-}" ] && [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  export AllowedHosts="$RAILWAY_PUBLIC_DOMAIN;localhost;127.0.0.1"
fi

export ASPNETCORE_URLS="http://0.0.0.0:${PORT:-8080}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/backups" "$DATA_DIR/attachments" "$DATA_DIR/keys"
  chown -R app:app "$DATA_DIR"
  chmod 700 "$DATA_DIR/keys"
  exec setpriv --reuid=app --regid=app --init-groups dotnet /app/TaskFlow.Api.dll
fi

mkdir -p "$DATA_DIR/backups" "$DATA_DIR/attachments" "$DATA_DIR/keys" 2>/dev/null || true
exec dotnet /app/TaskFlow.Api.dll
