/**
 * AUTO_capacityMonitor — daily. Detect overburden/underuse/tracking-gap flag
 * transitions per active VA (utilization vs prorated target over the last 14
 * complete UTC days) and, on a NEW flag, record a CapacityFlagEvent and email
 * the VA's direct supervisor (or team lead).
 */
import { db } from "@/lib/db";
import {
  capacityWindow,
  computeCapacity,
  detectTransition,
  isHoursStale,
  resolveCapacityThresholds,
  type CapacitySeverity,
} from "@/lib/services/capacity";
import { activeHoursSource } from "@/lib/services/hours-source";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, str } from "@/lib/settings";

async function main() {
  const run = await db.syncRun.create({ data: { worker: "capacity-monitor", status: "FAILED" } });
  let transitions = 0;
  try {
    const settings = await loadSettings();
    const thresholds = resolveCapacityThresholds(settings);
    const from = str(settings, "system_email_from", "");
    const teamLead = str(settings, "team_lead_email", "");

    const latest = await db.deskLogHours.aggregate({ _max: { date: true } });
    const hoursAsOf = latest._max.date;
    if (isHoursStale(hoursAsOf, new Date())) {
      await db.syncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          detailsJson: { skippedStale: true, hoursAsOf: hoursAsOf?.toISOString() ?? null },
        },
      });
      console.warn(
        `capacity-monitor: skipped — hours data is stale (as of ${hoursAsOf?.toISOString() ?? "never"})`,
      );
      return;
    }

    const vas = await db.va.findMany({ where: { status: { in: ["active", "training"] } } });
    const window = capacityWindow(new Date());
    const hours = await activeHoursSource().capacityHoursByVa(window.start, window.end);

    for (const va of vas) {
      const h = hours[va.vaId] ?? { taskHrs: 0, atWorkHrs: 0 };
      const capacity = computeCapacity({
        targetHoursWeekly: va.targetHoursWeekly,
        taskHrs: h.taskHrs,
        atWorkHrs: h.atWorkHrs,
        startDate: va.startDate,
        window,
        thresholds,
      });
      if (capacity.noTarget) continue;

      const prev = await db.capacityFlagEvent.findFirst({
        where: { vaId: va.vaId, flagType: { in: ["overburdened", "underutilized", "cleared", "tracking_gap"] } },
        orderBy: { timestamp: "desc" },
      });
      const prevSeverity = (prev?.severity as CapacitySeverity | undefined) ?? "green";
      const prevWasTrackingGap = prev?.flagType === "tracking_gap";

      if (capacity.trackingGap) {
        if (prevWasTrackingGap) continue;
        await recordFlag(va, "tracking_gap", "flagged", "yellow");
        transitions++;
        if (from) await notifySupervisor(va, "tracking gap", from, teamLead,
          `${va.name} is clocked in but their hours aren't being logged to tasks. Coach on tracker usage.`);
        continue;
      }

      if (prevWasTrackingGap) {
        // Was in a tracking gap; task-hour logging resumed — clear it before re-evaluating over/under.
        await recordFlag(va, "cleared", "cleared", "green");
        transitions++;
      }

      const t = detectTransition(prevWasTrackingGap ? "green" : prevSeverity, {
        utilizationPct: capacity.utilizationPct,
        last14dHours: h.taskHrs,
      }, thresholds);
      if (t.transition === "none") continue;

      const flagType = capacity.overburdened ? "overburdened" : capacity.underutilized ? "underutilized" : "cleared";
      await recordFlag(va, flagType, t.transition, t.severity);
      transitions++;

      if (t.transition === "flagged" && from) {
        await notifySupervisor(va, flagType, from, teamLead,
          `${va.name} was flagged ${flagType} based on the last 14 days of tracked hours. Please check in and rebalance work if needed.`);
      }
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { transitions } },
    });
    console.log(`capacity-monitor: ${transitions} transition(s)`);
  } catch (err) {
    await db.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] },
    });
    throw err;
  }
}

async function recordFlag(
  va: { vaId: string; name: string; supervisorVaId: string | null },
  flagType: string,
  transition: string,
  severity: CapacitySeverity,
) {
  await db.capacityFlagEvent.create({
    data: {
      vaId: va.vaId,
      vaName: va.name,
      flagType,
      transition,
      severity,
      supervisorVaId: va.supervisorVaId,
    },
  });
  await logActivity({
    source: "capacity_monitor",
    eventType: `capacity_${transition}`,
    vaId: va.vaId,
    severity: severity === "red" ? "warning" : "info",
    summary: `${va.name}: ${flagType} (${transition})`,
  });
}

async function notifySupervisor(
  va: { vaId: string; name: string; supervisorVaId: string | null },
  flagType: string,
  from: string,
  teamLead: string,
  body: string,
) {
  let to = teamLead;
  if (va.supervisorVaId) {
    const sup = await db.va.findUnique({ where: { vaId: va.supervisorVaId } });
    if (sup?.email) to = sup.email;
  }
  if (!to) return;
  await sendSystemEmail({ from, to, subject: `Capacity flag: ${va.name} is ${flagType}`, body });
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`capacity-monitor failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
