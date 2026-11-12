# Railway deployment template (API + SQLite volume)

This document describes the deployment configuration in the root `Dockerfile` and `railway.json`; it is not confirmation that
Lifegrid is currently deployed. This workspace has no Git metadata, so verify the repository, host, service settings, and live
health endpoint before treating any deployment as active. SQLite, attachments, backups, and cookie-encryption keys require
persistent storage mounted at `/data`.

## What is in the repository

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build (`dotnet/sdk:10.0` → `dotnet/aspnet:10.0`), installs `tzdata`, runs as an unprivileged user |
| `docker-entrypoint.sh` | Creates `/data/{backups,attachments,keys}`, fixes volume ownership, binds to Railway's `$PORT`, drops privileges |
| `railway.json` | Dockerfile builder, health check `/health`, `numReplicas: 1`, restart on failure |
| `.dockerignore` | Keeps the web app, docs, databases and secrets out of the build context |

The API applies EF Core migrations itself on start (additive; it never drops or recreates the database) and exposes `GET /health`
(returns `{"status":"ok"}` only when the database answers).

## Service settings

| Setting | Value |
|---------|-------|
| Source | Connect the verified Lifegrid repository after GitHub publishing |
| Builder | Dockerfile (from `railway.json`) |
| **Volume** | one volume, **mount path `/data`** |
| Replicas | **1** (SQLite supports a single writer – do not scale out) |
| Networking | generate a public domain (`*.up.railway.app`) |
| Health check | `/health` |

## Environment variables

Set these in the Railway service. None of them is a secret except where noted; there are no passwords or tokens to configure.

| Variable | Value | Notes |
|----------|-------|-------|
| `ASPNETCORE_ENVIRONMENT` | `Production` | Set in the image; enables Secure cookies, hides OpenAPI |
| `ConnectionStrings__Default` | `Data Source=/data/taskflow.db` | Set in the image |
| `Backups__Directory` | `/data/backups` | Set in the image |
| `Attachments__Directory` | `/data/attachments` | Set in the image |
| `DataProtection__KeysDirectory` | `/data/keys` | Set in the image; **required** so sessions survive restarts |
| `Cors__Origins__0` | `https://<your-vercel-domain>` | **Required.** Exact origin, no trailing slash. Also drives the CSRF origin check |
| `AllowedHosts` | `<service>.up.railway.app;healthcheck.railway.app` | **Required.** Host names the API answers to. The bundled default only allows `localhost`, so until this is set every request — including the health check — fails with "Invalid Hostname" |
| `TZ` | e.g. `Asia/Kolkata` | Time zone for "today", overdue and analytics (default `UTC`) |
| `Auth__MaxUsers` | `500` (default) | Lower it to cap storage |
| `Auth__AllowRegistration` | `true` (default) | `false` closes sign-ups |
| `Limits__MaxUserAttachmentBytes` | `209715200` (default) | Per-user attachment quota |

`PORT` is injected by Railway; the entrypoint binds `0.0.0.0:$PORT`.

## Deploy

1. After creating and reviewing `lifegrid-productivity-app`, connect that repository to Railway.
2. Add the variables above. `Cors__Origins__0` and `AllowedHosts` are both required before the first deploy works; set `Cors__Origins__0` after you know the Vercel domain and redeploy once afterwards.
3. **Add a volume** with mount path `/data`.
4. **Settings → Networking → Generate domain**; the API URL is `https://<service>.up.railway.app`.
5. Check `https://<service>.up.railway.app/health` → `{"status":"ok"}`.
6. Configure the chosen frontend host to proxy or target this API. Frontend hosting is not verified by this document.

CLI equivalent (after `railway login`): `railway init`, `railway add --service api`, `railway volume add -m /data`,
`railway variables set …`, `railway up`, `railway domain`.

## Updating

After the repository and Railway service are verified, configure deployment automation and test it with a non-production database
before relying on pushes to deploy. Migrations run automatically on API startup.

## Backups and recovery

* Users can create/restore their own backups and export their data in the app.
* For disaster recovery enable Railway **volume backups** or periodically copy `/data/taskflow.db`.
* Restoring a volume backup brings back the database, attachments, backups and keys together.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Health check fails, logs say `DataProtection:KeysDirectory must be set` | Variable missing (the image sets it; check you did not clear it) |
| `unable to open database file` | Volume not mounted at `/data` |
| Everyone is signed out after each deploy | Volume missing or keys directory not on the volume |
| 403 "Cross-origin request refused" | `Cors__Origins__0` does not exactly match the browser's origin |
| 400 "Invalid Hostname" | `AllowedHosts` does not include the Railway domain |
