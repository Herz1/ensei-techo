import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./event-ingest-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const ingestDir = path.join(projectDir, "src", "data", "ingest");
const blockedStatuses = new Set([
  "not_checked",
  "not_found_on_page",
  "parser_failed",
  "page_fetch_failed",
  "blocked",
  "pending_review",
  "conflicting_sources",
]);
const officialTypes = new Set([
  "artist_official",
  "venue_official",
  "promoter_official",
  "ticket_official",
  "official_api",
]);

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  const candidates = await readJson(path.join(ingestDir, "candidates.json"));
  const events = candidates
    .filter(
      (candidate) =>
        candidate.readyForReview &&
        candidate.sources?.every((source) => officialTypes.has(source.sourceType)) &&
        Object.values(candidate.fields).some(
          (field) =>
            field.approvalState !== "approved" &&
            field.approvalHash &&
            !blockedStatuses.has(field.availabilityStatus),
        ),
    )
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      date: candidate.date,
      venueId: candidate.venueId,
      sourceIds: candidate.sources.map((source) => source.sourceId),
      fields: Object.fromEntries(
        Object.entries(candidate.fields)
          .filter(
            ([, field]) =>
              field.approvalState !== "approved" &&
              field.approvalHash &&
              !blockedStatuses.has(field.availabilityStatus),
          )
          .map(([name, field]) => [
            name,
            {
              approvalHash: field.approvalHash,
              availabilityStatus: field.availabilityStatus,
              confidence: field.confidence,
            },
          ]),
      ),
      blockedFields: Object.fromEntries(
        Object.entries(candidate.fields)
          .filter(([, field]) => blockedStatuses.has(field.availabilityStatus))
          .map(([name, field]) => [name, field.availabilityStatus]),
      ),
    }));
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      eventCount: events.length,
      fieldCount: events.reduce(
        (sum, event) => sum + Object.keys(event.fields).length,
        0,
      ),
      blockedFieldCount: events.reduce(
        (sum, event) => sum + Object.keys(event.blockedFields).length,
        0,
      ),
    },
    events,
  };
  payload.batchHash = sha256(JSON.stringify(payload.events));
  await writeFile(
    path.join(ingestDir, "field-review-batch.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `字段审核批次：${payload.summary.eventCount} 场、${payload.summary.fieldCount} 个可批准字段、${payload.summary.blockedFieldCount} 个阻断字段`,
  );
  console.log(`batchHash=${payload.batchHash}`);
}

main().catch((error) => {
  console.error(`审核批次生成失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
