/**
 * trial-scheduler — run every ~15 min by systemd timer (worker:trial).
 * Orchestrates daily briefing, wrap-up check-in, check-in reminders,
 * 6-hour step timer sweeps, evidence ready transitions, deadline checks,
 * and human escalation alerts for PWA Skills Trial V2.
 */

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { TRIAL_EVENTS } from "@/lib/trial/events";
import {
  checkinDueAt,
  currentTrialDay,
  isDeclaredDay,
  isWithinDeclaredWindow,
  shouldRemind,
  calculateTimerCapDelta,
} from "@/lib/trial/schedule";
import {
  notifyDailyBriefing,
  notifyReviewersDeadlinePassed,
  notifyReviewersEvidenceReady,
  notifyReviewersHumanEscalation,
} from "@/lib/trial/notify";

async function getOrCreatePuriiConv(trialId: string) {
  const existing = await db.trialConversation.findFirst({
    where: { trialId, actorType: "Purii" },
  });
  if (existing) return existing;
  return db.trialConversation.create({
    data: { trialId, actorType: "Purii" },
  });
}

export async function main() {
  const run = await db.syncRun.create({
    data: { worker: "trial-scheduler", status: "FAILED" },
  });

  try {
    const enabled = env.SKILLS_TRIAL_V2 || process.env.SKILLS_TRIAL_V2 === "true";
    if (!enabled) {
      await db.syncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          detailsJson: { skipped: true, reason: "SKILLS_TRIAL_V2_disabled" },
        },
      });
      console.log("trial-scheduler: skipped (SKILLS_TRIAL_V2 is off)");
      return;
    }

    const now = new Date();
    const trials = await db.candidateTrial.findMany({
      where: {
        status: "ACTIVE",
        candidate: {
          currentStage: "tenhr_in_progress",
        },
      },
      include: {
        candidate: true,
        missions: {
          include: {
            template: true,
          },
        },
        events: true,
      },
    });

    let checkinsRequested = 0;
    let checkinReminders = 0;
    let timerTimeouts = 0;
    let briefingsSent = 0;
    let evidenceReadyCount = 0;
    let deadlineWatchCount = 0;
    let humanEscalationsCount = 0;

    for (const trial of trials) {
      const currentDay = currentTrialDay(trial.startDate, now, trial.timezone);
      const isWorkDay = isDeclaredDay(now, trial.timezone, trial.declaredDays);
      const isInsideWindow = isWithinDeclaredWindow(
        now,
        trial.timezone,
        trial.declaredDays,
        trial.declaredBlock
      );

      // (c) TIMER SWEEP: any CandidateMission with timerStartedAt older than 6 hours -> pause it server-side
      for (const mission of trial.missions) {
        if (mission.timerStartedAt) {
          const { timedOut, deltaSeconds } = calculateTimerCapDelta(mission.timerStartedAt, now);
          if (timedOut) {
            await db.$transaction([
              db.candidateMission.update({
                where: { id: mission.id },
                data: {
                  secondsSpent: mission.secondsSpent + deltaSeconds,
                  timerStartedAt: null,
                },
              }),
              db.candidateTrial.update({
                where: { id: trial.id },
                data: {
                  activeSeconds: trial.activeSeconds + deltaSeconds,
                },
              }),
              db.trialEvent.create({
                data: {
                  trialId: trial.id,
                  day: currentDay,
                  actor: "System",
                  type: TRIAL_EVENTS.STEP_TIMED_OUT,
                  label: `Mission "${mission.template.title}" timed out after 6 hours`,
                  dataJson: { missionId: mission.id, templateKey: mission.template.key, deltaSeconds },
                },
              }),
            ]);
            timerTimeouts++;
            mission.timerStartedAt = null;
            mission.secondsSpent += deltaSeconds;
            trial.activeSeconds += deltaSeconds;
          }
        }
      }

      // (d) DAILY BRIEFING: first tick inside a declared window each declared day
      if (isWorkDay && isInsideWindow) {
        const briefingSentToday = await db.trialEvent.findFirst({
          where: {
            trialId: trial.id,
            day: currentDay,
            type: TRIAL_EVENTS.MESSAGE_SENT,
            label: { contains: "Daily Briefing" },
          },
        });

        if (!briefingSentToday) {
          const dueSteps = trial.missions
            .filter((m) => m.template.dayDue === currentDay)
            .sort((a, b) => a.template.sortOrder - b.template.sortOrder)
            .map((m) => m.template.title);

          const puriiConv = await getOrCreatePuriiConv(trial.id);
          const text = dueSteps.length > 0
            ? `Good morning! Here is your briefing for Day ${currentDay}. Today's focus items:\n` +
              dueSteps.map((t, i) => `${i + 1}. ${t}`).join("\n")
            : `Good morning! Here is your briefing for Day ${currentDay}. No specific steps due today — use this time to review previous work or prepare ahead.`;

          await db.trialMessage.create({
            data: {
              conversationId: puriiConv.id,
              day: currentDay,
              from: "purii",
              text,
              tag: "Daily Briefing",
            },
          });

          await db.trialEvent.create({
            data: {
              trialId: trial.id,
              day: currentDay,
              actor: "AI",
              type: TRIAL_EVENTS.MESSAGE_SENT,
              label: `Daily Briefing sent for Day ${currentDay}`,
              dataJson: { briefingType: "daily_briefing", dueSteps },
            },
          });

          await notifyDailyBriefing(trial.candidate.email, trial.candidate.name, currentDay, dueSteps);
          briefingsSent++;
        }
      }

      // (a) CHECK-IN OPEN: when wrap-up check-in window opens and none was requested today
      const dueAt = checkinDueAt(now, trial.timezone, trial.declaredDays, trial.declaredBlock);
      if (dueAt && now.getTime() >= dueAt.getTime() && isInsideWindow) {
        const checkinRequestedToday = await db.trialEvent.findFirst({
          where: {
            trialId: trial.id,
            day: currentDay,
            type: TRIAL_EVENTS.CHECKIN_REQUESTED,
          },
        });

        if (!checkinRequestedToday) {
          const puriiConv = await getOrCreatePuriiConv(trial.id);
          await db.trialMessage.create({
            data: {
              conversationId: puriiConv.id,
              day: currentDay,
              from: "purii",
              text: "Time for your daily wrap-up check-in! Please share:\n1. What you completed today\n2. Next steps planned\n3. Any blockers\n4. Any changes to your ETAs",
              tag: "Daily Check-in",
            },
          });

          await db.trialEvent.create({
            data: {
              trialId: trial.id,
              day: currentDay,
              actor: "System",
              type: TRIAL_EVENTS.CHECKIN_REQUESTED,
              label: `Check-in requested for Day ${currentDay}`,
            },
          });
          checkinsRequested++;
        }
      }

      // (b) REMINDERS: for unanswered check-ins per shouldRemind — SKIP while accommodationsActive
      if (!trial.accommodationsActive) {
        const lastReq = await db.trialEvent.findFirst({
          where: {
            trialId: trial.id,
            type: TRIAL_EVENTS.CHECKIN_REQUESTED,
          },
          orderBy: { timestamp: "desc" },
        });

        if (lastReq) {
          const answered = await db.trialEvent.findFirst({
            where: {
              trialId: trial.id,
              type: TRIAL_EVENTS.CHECKIN_SUBMITTED,
              timestamp: { gt: lastReq.timestamp },
            },
          });

          if (!answered) {
            const reminderEvents = await db.trialEvent.findMany({
              where: {
                trialId: trial.id,
                type: TRIAL_EVENTS.CHECKIN_REMINDED,
                timestamp: { gt: lastReq.timestamp },
              },
              orderBy: { timestamp: "desc" },
            });

            const remindersSentCount = reminderEvents.length;
            const lastReminderSentAt = remindersSentCount > 0 ? reminderEvents[0].timestamp : null;

            if (
              shouldRemind(
                lastReq.timestamp,
                remindersSentCount,
                now,
                trial.timezone,
                trial.declaredDays,
                trial.declaredBlock,
                lastReminderSentAt
              )
            ) {
              const puriiConv = await getOrCreatePuriiConv(trial.id);
              await db.trialMessage.create({
                data: {
                  conversationId: puriiConv.id,
                  day: currentDay,
                  from: "purii",
                  text: remindersSentCount === 0
                    ? "Just checking in — we haven't received your wrap-up update yet today. Please let us know how your work went!"
                    : "Friendly reminder: your daily check-in is still pending. Keeping your team updated is a key part of our workflow!",
                  tag: "Check-in Reminder",
                },
              });

              await db.trialEvent.create({
                data: {
                  trialId: trial.id,
                  day: currentDay,
                  actor: "AI",
                  type: TRIAL_EVENTS.CHECKIN_REMINDED,
                  label: `Check-in reminder #${remindersSentCount + 1} sent for Day ${lastReq.day}`,
                  dataJson: { targetDay: lastReq.day, reminderNumber: remindersSentCount + 1 },
                },
              });
              checkinReminders++;
            }
          }
        }
      }

      // (e) EVIDENCE READY: all missions APPROVED -> set status SUBMITTED, log EVIDENCE_READY, notify reviewers
      if (trial.missions.length > 0 && trial.missions.every((m) => m.status === "APPROVED")) {
        const alreadyReady = await db.trialEvent.findFirst({
          where: {
            trialId: trial.id,
            type: TRIAL_EVENTS.EVIDENCE_READY,
          },
        });

        if (!alreadyReady) {
          await db.candidateTrial.update({
            where: { id: trial.id },
            data: { status: "SUBMITTED" },
          });
          await db.trialEvent.create({
            data: {
              trialId: trial.id,
              day: currentDay,
              actor: "System",
              type: TRIAL_EVENTS.EVIDENCE_READY,
              label: "All missions approved — evidence packet ready for review",
            },
          });
          await notifyReviewersEvidenceReady(trial.id, trial.candidate.name, trial.candidate.email);
          evidenceReadyCount++;
        }
      }

      // (f) DEADLINE WATCH: deadlineDate passed with unapproved steps -> log MESSAGE_SENT + notify reviewers
      if (
        now.getTime() > trial.deadlineDate.getTime() &&
        trial.missions.some((m) => m.status !== "APPROVED") &&
        trial.status === "ACTIVE"
      ) {
        const deadlineFlagged = await db.trialEvent.findFirst({
          where: {
            trialId: trial.id,
            type: TRIAL_EVENTS.MESSAGE_SENT,
            label: "Deadline passed — flagged for reviewer",
          },
        });

        if (!deadlineFlagged) {
          await db.trialEvent.create({
            data: {
              trialId: trial.id,
              day: currentDay,
              actor: "System",
              type: TRIAL_EVENTS.MESSAGE_SENT,
              label: "Deadline passed — flagged for reviewer",
              dataJson: { deadlineDate: trial.deadlineDate },
            },
          });
          await notifyReviewersDeadlinePassed(
            trial.id,
            trial.candidate.name,
            trial.candidate.email,
            trial.deadlineDate
          );
          deadlineWatchCount++;
        }
      }

      // (g) HUMAN ESCALATION ALERT: unhandled HUMAN_ESCALATED event -> notify reviewers once per event
      const escalationEvents = await db.trialEvent.findMany({
        where: {
          trialId: trial.id,
          type: TRIAL_EVENTS.HUMAN_ESCALATED,
        },
        orderBy: { timestamp: "asc" },
      });

      for (const esc of escalationEvents) {
        const humanReply = await db.trialMessage.findFirst({
          where: {
            conversation: { trialId: trial.id },
            from: { equals: "human", mode: "insensitive" },
            timestamp: { gt: esc.timestamp },
          },
        });

        if (!humanReply) {
          const alreadyAlerted = await db.trialEvent.findFirst({
            where: {
              trialId: trial.id,
              type: TRIAL_EVENTS.MESSAGE_SENT,
              label: { contains: `[ESCALATION_ALERT_SENT:${esc.id}]` },
            },
          });

          if (!alreadyAlerted) {
            await db.trialEvent.create({
              data: {
                trialId: trial.id,
                day: currentDay,
                actor: "System",
                type: TRIAL_EVENTS.MESSAGE_SENT,
                label: `[ESCALATION_ALERT_SENT:${esc.id}] Reviewer alerted for human escalation`,
                dataJson: { escalationEventId: esc.id },
              },
            });
            await notifyReviewersHumanEscalation(
              trial.id,
              trial.candidate.name,
              trial.candidate.email,
              esc.label || "Candidate requested human assistance"
            );
            humanEscalationsCount++;
          }
        }
      }
    }

    const summary = `trial-scheduler completed: ${trials.length} active trial(s), ` +
      `${checkinsRequested} check-in(s), ${checkinReminders} reminder(s), ` +
      `${timerTimeouts} timeout(s), ${briefingsSent} briefing(s), ` +
      `${evidenceReadyCount} evidence ready, ${deadlineWatchCount} deadline watch, ` +
      `${humanEscalationsCount} escalation alert(s).`;

    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        detailsJson: {
          trialsProcessed: trials.length,
          checkinsRequested,
          checkinReminders,
          timerTimeouts,
          briefingsSent,
          evidenceReadyCount,
          deadlineWatchCount,
          humanEscalationsCount,
        },
      },
    });

    console.log(`trial-scheduler: ${summary}`);
  } catch (err) {
    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        firstErrorLine: String(err).split("\n")[0],
      },
    });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`trial-scheduler failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
