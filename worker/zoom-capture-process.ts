/**
 * zoom-capture-process — drain PENDING ZoomMeetingCapture rows (queued by the Zoom
 * recording webhook) into the shared MeetingAction pipeline. This is the timer-drain
 * half of the Zoom Meeting App Phase 1: the webhook records a capture and acks fast;
 * this worker does the slow transcript download + LLM extraction. The capture status
 * is the cursor (PENDING → PROCESSED/SKIPPED/FAILED); a FAILED capture is retried up
 * to MAX_ATTEMPTS. Mirrors worker/transcript-to-tasks.ts. Runs on a systemd timer
 * (va-management-zoom-capture.timer) every 5 minutes.
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { processCapture } from "@/lib/zoom/recordings";

const BATCH = Number(process.env.ZOOM_CAPTURE_BATCH || "10");
const MAX_ATTEMPTS = Number(process.env.ZOOM_CAPTURE_MAX_ATTEMPTS || "5");

async function main() {
  const run = await db.syncRun.create({ data: { worker: "zoom-capture-process", status: "FAILED" } });
  let processed = 0;
  let withItems = 0;
  let skipped = 0;
  let failed = 0;

  try {
    if (!env.OPENROUTER_API_KEY?.trim() && !env.NVIDIA_API_KEY?.trim()) {
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), firstErrorLine: "No LLM key — skipped", detailsJson: { skipped: true } },
      });
      console.log("zoom-capture-process: skipped (no LLM key configured)");
      return;
    }

    const pending = await db.zoomMeetingCapture.findMany({
      // source=RTMS rows are live sessions owned by worker/rtms-live.ts — this
      // worker only drains post-meeting recording captures.
      where: { source: "RECORDING", status: { in: ["PENDING", "FAILED"] }, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });

    for (const cap of pending) {
      try {
        const result = await processCapture(cap);
        if (result.status === "SKIPPED") {
          await db.zoomMeetingCapture.update({
            where: { id: cap.id },
            data: { status: "SKIPPED", error: result.reason, processedAt: new Date() },
          });
          skipped++;
          console.log(`  ${cap.meetingUuid}: skipped — ${result.reason}`);
        } else {
          await db.zoomMeetingCapture.update({
            where: { id: cap.id },
            data: { status: "PROCESSED", meetingActionId: result.meetingActionId, error: null, processedAt: new Date() },
          });
          processed++;
          if (result.itemCount > 0) withItems++;
          console.log(`  ${cap.meetingUuid}: ${result.itemCount} item(s)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const attempts = cap.attempts + 1;
        await db.zoomMeetingCapture.update({
          where: { id: cap.id },
          data: { status: "FAILED", attempts, error: msg.slice(0, 300) },
        });
        failed++;
        console.warn(`  ${cap.meetingUuid}: failed (attempt ${attempts}/${MAX_ATTEMPTS}) — ${msg.split("\n")[0]}`);
      }
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        detailsJson: { processed, withItems, skipped, failed, batch: BATCH },
      },
    });
    console.log(
      `zoom-capture-process: processed ${processed} (with items ${withItems}); ${skipped} skipped; ${failed} failed/retry`,
    );
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
    console.error(`zoom-capture-process failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
