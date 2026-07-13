/**
 * AUTO_capacityMonitor — daily. Detect overburden/underuse flag transitions per
 * active VA (utilization vs target over the last 14 days) and, on a NEW flag,
 * record a CapacityFlagEvent and email the VA's direct supervisor (or team lead).
 */
import { db } from "@/lib/db";
import { computeFlags, computeUtilization, detectTransition, type CapacitySeverity } from "@/lib/services/capacity";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, str } from "@/lib/settings";

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const run = await db.syncRun.create({ data: { worker: "capacity-monitor", status: "FAILED" } });
  let transitions = 0;
  try {
    const settings = await loadSettings();
    const from = str(settings, "system_email_from", "");
    const teamLead = str(settings, "team_lead_email", "");

    const vas = await db.va.findMany({ where: { status: { in: ["active", "training"] } } });
    const since = new Date(Date.now() - 14 * DAY);
    const hours = await db.deskLogHours.groupBy({
      by: ["vaId"],
      where: { date: { gte: since } },
      _sum: { taskSpentHrs: true }, // capacity flags off task hours (the intended metric)
    });
    const last14 = new Map(hours.map((h) => [h.vaId, h._sum.taskSpentHrs ?? 0]));

    for (const va of vas) {
      const targetHoursWeekly = va.targetHoursWeekly ?? 0;
      const last14dHours = last14.get(va.vaId) ?? 0;
      const flags = computeFlags(targetHoursWeekly, last14dHours);
      const prev = await db.capacityFlagEvent.findFirst({
        where: { vaId: va.vaId, flagType: { in: ["overburdened", "underutilized", "cleared"] } },
        orderBy: { timestamp: "desc" },
      });
      const prevSeverity = (prev?.severity as CapacitySeverity | undefined) ?? "green";
      const t = detectTransition(prevSeverity, flags);
      if (t.transition === "none") continue;

      const flagType = flags.overburdened
        ? "overburdened"
        : flags.underutilized
          ? "underutilized"
          : "cleared";

      await db.capacityFlagEvent.create({
        data: {
          vaId: va.vaId,
          vaName: va.name,
          flagType,
          transition: t.transition,
          severity: t.severity,
          supervisorVaId: va.supervisorVaId,
        },
      });
      await logActivity({
        source: "capacity_monitor",
        eventType: `capacity_${t.transition}`,
        vaId: va.vaId,
        severity: t.severity === "red" ? "warning" : "info",
        summary: `${va.name}: ${flagType} (${t.transition})`,
      });
      transitions++;

      if (t.transition === "flagged") {
        // Notify the direct supervisor, else the team lead.
        let to = teamLead;
        if (va.supervisorVaId) {
          const sup = await db.va.findUnique({ where: { vaId: va.supervisorVaId } });
          if (sup?.email) to = sup.email;
        }
        if (from && to) {
          const { expected14d, utilizationPct } = computeUtilization(targetHoursWeekly, last14dHours);
          const overloadAmount = last14dHours - expected14d;
          const overloadLine =
            overloadAmount > 0
              ? `Overload: ${overloadAmount.toFixed(1)} hrs above the 14-day target.`
              : `Shortfall: ${Math.abs(overloadAmount).toFixed(1)} hrs below the 14-day target.`;
          const result = await sendSystemEmail({
            from,
            to,
            subject: `Capacity flag: ${va.name} is ${flagType}`,
            body: [
              `${va.name} was flagged ${flagType} based on the last 14 days of tracked hours.`,
              `Target: ${targetHoursWeekly.toFixed(1)} hrs/week (${expected14d.toFixed(1)} hrs over 14 days).`,
              `Tracked (last 14 days): ${last14dHours.toFixed(1)} hrs (${utilizationPct.toFixed(0)}% utilization).`,
              overloadLine,
              `Please check in and rebalance work if needed.`,
            ].join("\n"),
          });
          if (!result.ok) {
            await logActivity({
              source: "capacity_monitor",
              eventType: "capacity_email_skipped",
              vaId: va.vaId,
              severity: "warning",
              summary: `${va.name}: ${flagType} alert email not sent (${result.reason})`,
            });
            console.warn(`capacity-monitor: alert email not sent for ${va.name} — ${result.reason}`);
          }
        } else {
          await logActivity({
            source: "capacity_monitor",
            eventType: "capacity_email_skipped",
            vaId: va.vaId,
            severity: "warning",
            summary: `${va.name}: ${flagType} alert email skipped (${!from ? "no system_email_from setting" : "no supervisor or team_lead_email"})`,
          });
          console.warn(`capacity-monitor: skipped alert email for ${va.name} — ${!from ? "missing system_email_from" : "no recipient"}`);
        }
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

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`capacity-monitor failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
