/**
 * transcript-to-tasks — read harvested Zoom transcripts, extract proposed action
 * items via OpenRouter, and queue them as MeetingAction rows for a team lead to
 * confirm in the console. Idempotent: MeetingAction.meetingFile is the cursor —
 * any Meetings/*.md not yet in the table is unprocessed. Runs on a systemd timer
 * (va-management-transcript.timer) at :15 past the hour, after the harvester.
 *
 * Strong-fit LLM task (local-AI-gateway routing guide): single doc in, strict
 * JSON out. Cross-cutting logic (frontmatter parse, account filter, JSON
 * validation) lives in src/lib/meetings/extract.ts (pure, unit-tested).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { openrouterChat } from "@/lib/matrix/openrouter";
import {
  parseMeetingFile,
  shouldProcess,
  buildExtractionMessages,
  parseExtractedItems,
  type ProposedItem,
} from "@/lib/meetings/extract";

const MEETINGS_DIR = process.env.MEETINGS_DIR || "/app/SecondBrain/Meetings";
const MODEL = process.env.OPENROUTER_TRANSCRIPT_MODEL || "google/gemini-2.5-flash-lite";
const BATCH = Number(process.env.TRANSCRIPT_BATCH || "8");

async function main() {
  const run = await db.syncRun.create({ data: { worker: "transcript-to-tasks", status: "FAILED" } });
  let processed = 0;
  let withItems = 0;
  let skippedScope = 0;
  let parseFailed = 0;

  try {
    if (!env.OPENROUTER_API_KEY?.trim()) {
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), firstErrorLine: "OpenRouter key absent — skipped", detailsJson: { skipped: true } },
      });
      console.log("transcript-to-tasks: skipped (no OpenRouter key)");
      return;
    }

    let files: string[];
    try {
      files = (await readdir(MEETINGS_DIR)).filter((f) => f.endsWith(".md") && f !== "meetings_index.md");
    } catch (err) {
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), firstErrorLine: `Meetings dir unavailable: ${String(err).split("\n")[0]}`, detailsJson: { skipped: true } },
      });
      console.log(`transcript-to-tasks: skipped (Meetings dir not found at ${MEETINGS_DIR})`);
      return;
    }

    // Idempotency: which of these absolute paths are already recorded?
    const fullPaths = files.map((f) => path.join(MEETINGS_DIR, f));
    const existing = await db.meetingAction.findMany({
      where: { meetingFile: { in: fullPaths } },
      select: { meetingFile: true },
    });
    const seen = new Set(existing.map((e) => e.meetingFile));

    for (const file of files) {
      if (processed >= BATCH) break;
      const fullPath = path.join(MEETINGS_DIR, file);
      if (seen.has(fullPath)) continue;

      const md = await readFile(fullPath, "utf8").catch(() => null);
      if (md === null) { parseFailed++; continue; }

      const meta = parseMeetingFile(md);
      if (!shouldProcess(meta)) { skippedScope++; continue; }

      // ONE LLM call per meeting (strong-fit: single doc → strict JSON).
      let items: ProposedItem[] | null;
      try {
        const res = await openrouterChat({
          messages: buildExtractionMessages(meta),
          temperature: 0.2,
          max_tokens: 1500,
          model: MODEL,
        });
        items = parseExtractedItems(res.choices?.[0]?.message?.content ?? "");
      } catch (err) {
        console.warn(`  ${file}: LLM call failed — ${String(err).split("\n")[0]}`);
        parseFailed++;
        continue; // no row written → retried next run
      }

      if (items === null) {
        console.warn(`  ${file}: unparseable LLM output — skipped, will retry`);
        parseFailed++;
        continue; // no row written → retried next run
      }

      // Valid (possibly empty) → write the cursor row so it's never reprocessed.
      await db.meetingAction.create({
        data: {
          meetingFile: fullPath,
          meetingTitle: meta.title || file.replace(/\.md$/, ""),
          meetingDate: meta.date,
          zoomAccount: meta.zoomAccount,
          status: items.length === 0 ? "RESOLVED" : "PENDING",
          items: {
            create: items.map((it) => ({
              title: it.title,
              description: it.description ?? null,
              suggestedAssignee: it.suggestedAssignee ?? null,
              suggestedDueDate: it.suggestedDueDate ? new Date(it.suggestedDueDate) : null,
              clientContext: it.clientContext ?? null,
            })),
          },
        },
      });
      processed++;
      if (items.length > 0) withItems++;
      console.log(`  ${file}: ${items.length} item(s)`);
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        detailsJson: { processed, withItems, skippedScope, parseFailed, model: MODEL },
      },
    });
    console.log(
      `transcript-to-tasks: processed ${processed} (with items ${withItems}); ${skippedScope} out-of-scope; ${parseFailed} parse/LLM failures (retry next run)`,
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
    console.error(`transcript-to-tasks failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
