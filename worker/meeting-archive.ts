/**
 * Archive MeetingAction rows older than ARCHIVE_AFTER_DAYS so stale meetings drop
 * off the meeting-actions list. Age is measured from meetingDate (falling back to
 * createdAt when meetingDate is unset). Run on a timer (e.g. daily): npm run worker:meeting-archive
 */
import { db } from "@/lib/db";

const ARCHIVE_AFTER_DAYS = 14;

async function main() {
  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await db.meetingAction.findMany({
    where: {
      archivedAt: null,
      OR: [
        { meetingDate: { lt: cutoff } },
        { meetingDate: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true },
  });

  console.log(`meeting-archive: ${candidates.length} meeting(s) older than ${ARCHIVE_AFTER_DAYS}d.`);
  if (candidates.length === 0) return;

  await db.meetingAction.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { archivedAt: new Date() },
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
