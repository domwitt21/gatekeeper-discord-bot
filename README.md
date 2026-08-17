# Gatekeeper

Gatekeeper is SecureBootLabs' Discord verification bot and administration dashboard. It provides CAPTCHA verification, automatic role assignment, configurable challenge policies, audit logs, and verification analytics.

## Trust and deny policies

Server administrators can manage explicit trusted users, trusted roles, and denied users from the dashboard or with `/policy`. Policies may be permanent or expire automatically. Denied users take precedence over trusted-user rules, while trusted users and roles bypass CAPTCHA and receive the configured verified role. Account-age auto-trust is available but disabled by default.

After adding or changing slash commands, register them with Discord once:

```sh
npm run deploy
```

## Moderation and recovery

Administrators can inspect and recover member verification with `/verification-status`, `/verify-user`, `/unverify`, and `/reset-verification`, or use the dashboard member lookup. Role removal and state resets require explicit confirmation, and moderator notes are written to the security audit timeline. Automatic verified-role removal for newly denied users is available but disabled by default.

## Verification presets and reverification

Each server can choose a verification preset from the dashboard:

- **Basic** disables the minimum account-age gate, logs suspicious accounts, and uses an easy CAPTCHA.
- **Standard** preserves the server's individually configured verification settings and is the default for existing servers.
- **Strict** blocks suspicious accounts, uses a hard CAPTCHA with no more than three attempts, and enforces the configured strict minimum account age.

Changes to enforcement-related verification settings increment the server's policy version. Gatekeeper records the policy version each member completed and shows administrators when that verification is out of date. The optional reverification interval tracks time-based expiration; set it to `0` to disable it.

Use `/reverify-user` or the dashboard's **Require reverification** action to remove one member's verified role and invalidate their prior verification. The action requires explicit confirmation and is written to the security audit timeline. Bulk reverification is intentionally not enabled in this phase.

### Automated reverification

Gatekeeper scans verification records hourly in rate-limited batches and builds a dashboard preview of members whose policy version or verification age is out of date. Automatic enforcement is disabled by default. Administrators can configure a 1–30 day grace period, daily DM or channel reminders, pause or resume processing, run an immediate scan, and cancel individual queued actions.

When enforcement is enabled, Gatekeeper removes the verified role after the grace period and records the reminder and enforcement events in the security timeline. Explicitly trusted users and members of trusted roles are exempt. Queue cancellation is persistent until the member successfully verifies again or an administrator manually requires reverification.

## Security reports

Use `/security-report` to preview a daily or weekly security summary or deliver it to the configured report channel. The dashboard can enable scheduled daily or weekly delivery, select a UTC delivery time, configure quiet hours and alert severity, and review delivery attempts and failures. Scheduled reports are disabled by default. Discord delivery is retried up to three times before a failure is recorded.

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

## Guided setup and configuration health

The dashboard includes a four-step setup wizard for selecting the verification channel and role, choosing a recommended security preset, previewing the Discord message, and launching the flow. The wizard may be rerun without resetting verification history.

Gatekeeper continuously scores configuration health by checking channel availability, role availability, bot permissions, role hierarchy, embed support, and CAPTCHA attachment access. Administrators can run a safe dashboard test that changes no member roles or verification records. Health regressions are checked at startup and every six hours, with rate-limited warnings recorded in the security timeline.

## Validation

```sh
npm test
```

The tests cover SQLite restart persistence, retention cleanup, and database health. PostgreSQL should additionally be tested against a disposable database before production cutover.
