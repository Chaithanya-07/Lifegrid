# Lifegrid production security

The existing TaskFlow codebase was hardened for multi-user operation before internet exposure. Lifegrid retains that authentication and data-isolation architecture. The whole API and
frontend were reviewed and the following was added. Every item below is covered by automated tests unless marked *(operational)*.

## Threat model

Anyone on the internet can reach the site and register. The goals are: a user can only ever read or change their own data,
credentials are not guessable or leakable, uploads and imports cannot harm the server or other users, and the stored data is not
publicly reachable.

## Authentication

* **Registration and login** – email + password. Emails are normalised to lower case and validated; passwords must be 10–128
  characters and must not equal the email. The server enforces the rules (the UI only gives faster feedback).
* **Password hashing** – PBKDF2-HMAC-SHA256, 600 000 iterations, a random 16-byte salt per password, constant-time comparison.
  Plain passwords are never stored or logged. A password change invalidates every other session.
* **No default credentials** – the database starts with no users; the first account is whoever registers.
* **Brute-force protection** – 5 consecutive failures lock the account for 15 minutes (the correct password is refused while
  locked); a per-client rate limit applies to the auth endpoints (20/min) and to the API in general (600/min).
  Login errors are generic ("Invalid email or password") and take the same time whether or not the email exists.
* **Sessions** – an encrypted, signed cookie: `HttpOnly` (not readable by JavaScript), `Secure` in production, `SameSite=Lax`,
  14-day sliding expiry. Every request re-checks that the account still exists and that the password has not changed since sign-in.
  The encryption keys live on the persistent volume so sessions survive restarts and redeployments.
* **Account deletion** – a signed-in user can delete their account (password required); rows cascade and their attachment and
  backup folders are removed.
* **Sign-up controls** – `Auth__AllowRegistration=false` closes registration; `Auth__MaxUsers` caps accounts.

## Authorization and data isolation

* **Deny by default** – a fallback authorization policy requires a signed-in user for every endpoint; only `/health`,
  `/api/health`, register, login and logout are anonymous. A test enumerates the endpoints and checks each returns 401.
* **Row-level isolation in the data layer** – every user-owned table (tasks, categories, tags, task–tag links, subtasks, recurrence
  rules, reminders, notifications, focus sessions, activity, attachments, XP ledger and gamification settings) has a `UserId`, and the EF Core DbContext applies a
  global query filter `UserId == current user` to all of them. With nobody signed in, queries return nothing (fail closed).
  New rows are stamped with the current user automatically, and changing a row's owner is refused. `FindAsync` (which skips query
  filters) is replaced by a filter-aware `FindOwnedAsync`, so guessing an id returns 404.
* **Uniqueness is per user** – two users can both have a "Work" category or a "home" tag.
* **Tests** – a second user attempting every read, write, delete, duplicate, bulk, attachment, backup and restore operation on the
  first user's records gets 404/400 and the first user's data is unchanged; analytics, stats, search, export and backups only
  contain the caller's data.

## Uploads, imports and backups

* **Attachments** – extension allow-list (no HTML/SVG/JS/executables), 10 MB per file, 20 per task, a per-user storage quota
  (200 MB), server-generated file names, downloads always sent as attachments with `X-Content-Type-Options: nosniff`.
  Files live in a **per-user folder** (`attachments/<userId>/`), so a stored file name from another user cannot be reached.
* **Import** – body size limit, schema validation with hard caps (tasks, categories, tags, subtasks and reward records), all-or-nothing transaction,
  a preview step that writes nothing. An imported attachment reference only resolves inside the importer's own folder; a test
  confirms a crafted import cannot claim another user's file.
* **Backups** – per-account JSON snapshots in `backups/<userId>/`, validated names (no path tricks), the newest 25 kept, restore
  replaces only the caller's data and takes a safety snapshot first. (The old whole-database file backup was removed: in a shared
  database it would have exposed or overwritten other users' data.)
* **CSV export** neutralises spreadsheet formulas.

## Transport and browser protections

* **HTTPS** everywhere (Vercel and Railway terminate TLS; cookies are `Secure`).
* **CSRF** – `SameSite=Lax` plus an Origin check: any state-changing request carrying an `Origin` header that is not the configured
  web origin is refused with 403 (tested).
* **Headers** – API: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  a restrictive CSP, `Cache-Control: no-store` on `/api`. Web: strict CSP (no inline scripts, `connect-src 'self'`), HSTS,
  `frame-ancestors 'none'`, `Permissions-Policy`.
* **CORS** is limited to the configured origin; the browser normally never needs it because Vercel proxies `/api`.
* **Error handling** – unexpected errors return a generic 500 (details only in server logs); OpenAPI is development-only; the
  `Server` header is removed; `/api/about` no longer discloses file paths.

## Proxies and client addresses

* **Forwarded headers** – behind Railway (and any reverse proxy) the real client address and scheme arrive in
  `X-Forwarded-For` / `X-Forwarded-Proto`. Processing is enabled by `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` (set in the
  Dockerfile; tests can also set `ForwardedHeaders:Enabled=true`) — the framework's enabled-by-default assumptions are overridden
  in code rather than relied on. Without it, rate limiting and logging would see only the proxy's address.
* **Trust posture** — an entry in `X-Forwarded-For` is accepted only if the proxy that delivered it (the address the app would
  otherwise see) is a private or loopback network, matching the deployment assumption *that the platform's proxies live on
  private/internal networks and append the connecting client's address*. `KnownProxies`/`KnownNetworks` are cleared and rebuilt
  explicitly (loopback, RFC 1918, link-local and IPv6 unique-local ranges); no public host is trusted.
* **Spoofing resistance** — the framework default (`ForwardedHeadersOptions` with no network restriction) trusts any host in the
  header, so a client could rotate the *leftmost* `X-Forwarded-For` value to rotate its rate-limit identity. Here public
  addresses in the header are treated as clients, never as proxies, so processing stops at the first public (i.e. real client)
  address read from the right; a spoofed leftmost value is ignored. Regression tests (`api/TaskFlow.Tests/ForwardedHeaderTests.cs`)
  prove that (a) spoofed leftmost values cannot evade the auth rate limit, and (b) a request forwarded by a trusted private proxy
  is attributed to the forwarded client address.
* **Deployment caveat** — if Lifegrid is ever hosted behind proxies with *public* facing addresses (e.g. an external load
  balancer in front of the container), those addresses must be added to `KnownProxies`/`KnownNetworks` in
  `api/TaskFlow.Api/Program.cs`, otherwise forwarded headers from them are ignored and every client appears as the balancer's IP.

## Secrets and configuration

* Nothing sensitive is in the repository. Production settings come from environment variables (see
  [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md)); there are no passwords, tokens or connection secrets to configure at all –
  the only secret material is the cookie-encryption key ring, generated on first start and stored on the volume (mode 700).
* `.gitignore` excludes databases, backups, logs, `.env*`, keys and local tooling.

## Operational notes *(operational)*

* The SQLite file, attachments, backups and keys live on one Railway volume that is **not exposed** by any route.
  Take Railway volume backups for disaster recovery; per-account backups are for users' own mistakes.
* Run a single API instance (SQLite has one writer).
* Keep the Railway `AllowedHosts` and `Cors__Origins__0` values in sync with the real domains.

## Known limitations

* No password-reset email or multi-factor authentication.
* Email addresses are not verified; registering with someone else's address only creates an account nobody else can use.
* A user who registers an existing email learns it is taken (account enumeration through registration is accepted for usability).
* Rate limits are per client address and in memory (reset on restart).
* Browser preferences are not part of the account.
