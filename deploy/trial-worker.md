# PWA Skills Trial V2 — Background Worker Deployment Guide (`trial-scheduler`)

This document provides exact systemd unit configurations, operational commands, environment variables, and rollout constraints for deploying `worker/trial-scheduler.ts` (`npm run worker:trial`).

---

## 1. Stage-1 Rollout Warning & Environment Variables

> [!WARNING]
> **CRITICAL STAGE-1 ROLLOUT CONSTRAINT**
> During Stage-1 deployment (`docs/skills-trial/14`), the feature flag `SKILLS_TRIAL_V2=true` **MUST** be deployed with `TRIAL_EMAILS_ENABLED=false` (or unset). 
> Keeping `TRIAL_EMAILS_ENABLED=false` ensures that all generated candidate invitations, daily briefings, and reviewer alerts are logged cleanly to console (`[trial-email:DRY-RUN]`) without sending live emails to external candidates or reviewers. Only enable `TRIAL_EMAILS_ENABLED=true` when graduating to Stage-2 candidate testing.

### Required Environment Variables

Add the following configuration variables to `/app/SecondBrain/va-management-console/shared/.env.production`:

```ini
# Core Trial V2 Gate (true | false)
SKILLS_TRIAL_V2="true"

# Stage-1 Kill Switch for Email Notifications (false for Stage 1 dry-run, true for Stage 2 live emails)
TRIAL_EMAILS_ENABLED="false"

# Comma-separated list of reviewer recipients for alerts (evidence ready, deadline passed, human escalations)
TRIAL_REVIEWER_EMAILS="reviewers@team.pwasecondbrain.uk,hr@team.pwasecondbrain.uk"

# Base URL used for building links inside trial notifications
APP_BASE_URL="https://team.pwasecondbrain.uk"
```

---

## 2. Systemd Unit Files

Create the following unit files under `/etc/systemd/system/` on the production server.

### `/etc/systemd/system/va-management-trial.service`

```ini
[Unit]
Description=PWA Skills Trial V2 Background Scheduler (trial-scheduler)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=oneshot
WorkingDirectory=/app/SecondBrain/va-management-console/current
EnvironmentFile=/app/SecondBrain/va-management-console/shared/.env.production
ExecStart=/app/SecondBrain/va-management-console/current/node_modules/.bin/tsx worker/trial-scheduler.ts
User=root
```

### `/etc/systemd/system/va-management-trial.timer`

Runs the worker automatically every 15 minutes.

```ini
[Unit]
Description=Run PWA Skills Trial V2 Background Scheduler every 15 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
Unit=va-management-trial.service

[Install]
WantedBy=timers.target
```

---

## 3. Installation, Enabling, and Status Commands

Run these exact commands on the production server (`/app/SecondBrain/va-management-console/current`) to install and start the systemd timer:

```bash
# 1. Reload systemd daemon after copying unit files
sudo systemctl daemon-reload

# 2. Enable and start the timer
sudo systemctl enable --now va-management-trial.timer

# 3. Check status of the timer
sudo systemctl status va-management-trial.timer

# 4. List active timers to verify schedule
sudo systemctl list-timers | grep va-management-trial
```

---

## 4. Manual Execution & Operational Verification

### Manual Dry-Run Verification (Stage 1)
To run a manual dry-run verification without sending real emails (even if the server environment has emails enabled), override `TRIAL_EMAILS_ENABLED=false` on the command line:

```bash
cd /app/SecondBrain/va-management-console/current
TRIAL_EMAILS_ENABLED=false npx tsx worker/trial-scheduler.ts
```

Or using `npm run worker:trial`:
```bash
TRIAL_EMAILS_ENABLED=false npm run worker:trial
```

In dry-run mode, inspect the console logs for entries matching:
```
[trial-email:DRY-RUN] { to: 'candidate@example.com', subject: 'Day 1 Briefing — PWA Skills Trial' }
trial-scheduler: trial-scheduler completed: 1 active trial(s), 1 check-in(s), 0 reminder(s), 0 timeout(s), 1 briefing(s), 0 evidence ready, 0 deadline watch, 0 escalation alert(s).
```

### Manual Real-Run Execution (Stage 2)
When testing live email delivery or forcing an immediate schedule sweep in production:

```bash
# Trigger via systemd service directly (uses values from .env.production)
sudo systemctl start va-management-trial.service

# Or run manually via terminal with live emails enabled
cd /app/SecondBrain/va-management-console/current
TRIAL_EMAILS_ENABLED=true npx tsx worker/trial-scheduler.ts
```

### Inspecting Logs and Database Runs
Check real-time worker logs using `journalctl`:

```bash
sudo journalctl -u va-management-trial.service -f
```

Every run creates and updates a `SyncRun` entry in Postgres (`worker = 'trial-scheduler'`). You can query recent executions using Prisma or SQL:

```sql
SELECT id, status, "finishedAt", "detailsJson", "firstErrorLine"
FROM "SyncRun"
WHERE worker = 'trial-scheduler'
ORDER BY "createdAt" DESC
LIMIT 10;
```
