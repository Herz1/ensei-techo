import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReviewMigration } from "./event-field-model.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const dataDir = path.join(projectDir, "src", "data");
const ingestDir = path.join(dataDir, "ingest");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function sameArray(a, b) {
  return JSON.stringify([...(a ?? [])].sort()) ===
    JSON.stringify([...(b ?? [])].sort());
}

async function main() {
  const [published, candidates] = await Promise.all([
    readJson(path.join(dataDir, "events.json")),
    readJson(path.join(ingestDir, "candidates.json")),
  ]);
  const candidateById = new Map(candidates.map((item) => [item.id, item]));
  const matched = [];
  for (const event of published) {
    const candidate = candidateById.get(event.id);
    if (!candidate?.readyForReview || !candidate.fields) {
      throw new Error(`正式演出 ${event.id} 没有可迁移的字段级候选`);
    }
    const identityMatches =
      event.titleJa === candidate.title &&
      sameArray(event.artistIds, candidate.artistIds) &&
      event.venueId === candidate.venueId &&
      event.date === candidate.date &&
      event.openTime === candidate.openTime &&
      event.startTime === candidate.startTime;
    if (!identityMatches) {
      throw new Error(`正式演出 ${event.id} 与新候选身份字段不一致，拒绝自动迁移`);
    }
    matched.push(candidate);
  }
  if (matched.length !== published.length) {
    throw new Error("字段审核迁移数量与现有正式库不一致");
  }

  const verifiedAt = new Date().toISOString();
  const reviews = buildReviewMigration(matched, verifiedAt);
  await writeFile(
    path.join(ingestDir, "reviews.json"),
    `${JSON.stringify(reviews, null, 2)}\n`,
    "utf8",
  );
  const fieldCount = reviews.events.reduce(
    (sum, event) => sum + Object.keys(event.fields).length,
    0,
  );
  console.log(
    `审核迁移完成：${reviews.events.length} 场、${fieldCount} 个字段证据块；身份字段已逐条与原正式库比对`,
  );
}

main().catch((error) => {
  console.error(`审核迁移失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
