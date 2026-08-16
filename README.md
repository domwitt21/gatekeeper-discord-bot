# Gatekeeper

Gatekeeper is SecureBootLabs' Discord verification bot and administration dashboard. It provides CAPTCHA verification, automatic role assignment, configurable challenge policies, audit logs, and verification analytics.

## Trust and deny policies

Server administrators can manage explicit trusted users, trusted roles, and denied users from the dashboard or with `/policy`. Policies may be permanent or expire automatically. Denied users take precedence over trusted-user rules, while trusted users and roles bypass CAPTCHA and receive the configured verified role. Account-age auto-trust is available but disabled by default.

After adding or changing slash commands, register them with Discord once:

```sh
npm run deploy
```

## Database modes

Gatekeeper uses PostgreSQL whenever `DATABASE_URL` is set. Without it, the bot uses the SQLite file configured by `DATABASE_PATH`. SQLite remains convenient for local development; PostgreSQL is recommended for production because it survives application replacement and supports future horizontal scaling.

Required production variables:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DATABASE_SSL=true
LOG_RETENTION_DAYS=0
```

Do not remove `DATABASE_PATH` until existing SQLite data has been migrated and verified.

## Safe Render migration

1. Create a Render Postgres database in the same region as the bot.
2. Download or otherwise preserve a copy of the current `verification.sqlite` file.
3. On a trusted machine with that SQLite file, set `DATABASE_PATH` and Render's external `DATABASE_URL`.
4. Stop verification traffic briefly, then run `npm run migrate:postgres`. The data copy is safe to retry.
5. Add Render's internal `DATABASE_URL` to the bot service and deploy.
6. Open `/health`. It should return HTTP 200 with `database.connected: true` and `database.engine: "postgres"`.
7. Confirm the dashboard shows the expected server settings and analytics before deleting any SQLite backup.

The migration copies guild configuration and verification logs. Active CAPTCHA challenges and login sessions are intentionally discarded, so users may need to begin a fresh verification or dashboard login after cutover.

## Reliability behavior

- Startup fails instead of accepting traffic when the configured database cannot be reached.
- `/health` checks both Discord readiness and a live database query.
- Expired CAPTCHA challenges and dashboard sessions are removed hourly.
- When `LOG_RETENTION_DAYS` is greater than zero, older verification logs are removed hourly. The default of `0` retains logs indefinitely.
- Shutdown waits for the dashboard and database pool to close.

## Validation

```sh
npm test
```

The tests cover SQLite restart persistence, retention cleanup, and database health. PostgreSQL should additionally be tested against a disposable database before production cutover.
