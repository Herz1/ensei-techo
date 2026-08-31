import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./event-ingest-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const ingestDir = path.join(projectDir, "src", "data", "ingest");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  const expectedHash = arg("--batch");
  const reviewer = arg("--reviewer");
  if (!expectedHash || !reviewer) {
    throw new Error("必须显式提供 --batch <hash> 和 --reviewer <name>");
  }
  const batch = await readJson(path.join(ingestDir, "entity-review-batch.json"));
  const actualHash = sha256(JSON.stringify({
    artists: batch.artists,
    venues: batch.venues,
  }));
  if (batch.batchHash !== actualHash || expectedHash !== actualHash) {
    throw new Error("实体审核批次哈希不匹配，候选内容可能已变化");
  }
  const verifiedAt = new Date().toISOString();
  const common = {
    schemaVersion: 2,
    verifiedAt,
    reviewer,
    batchHash: actualHash,
  };
  await Promise.all([
    writeFile(
      path.join(ingestDir, "artist-reviews.json"),
      `${JSON.stringify({
        ...common,
        approved: batch.artists
          .filter((item) => item.decision === "approve")
          .map((item) => ({ id: item.id, evidenceHash: item.evidenceHash })),
        rejected: batch.artists
          .filter((item) => item.decision === "reject")
          .map((item) => ({ id: item.id, reason: item.reason })),
      }, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(ingestDir, "venue-reviews.json"),
      `${JSON.stringify({
        ...common,
        approved: batch.venues
          .filter((item) => item.decision === "approve")
          .map((item) => ({ id: item.id, evidenceHash: item.evidenceHash })),
        rejected: batch.venues
          .filter((item) => item.decision === "reject")
          .map((item) => ({ id: item.id, reason: item.reason })),
      }, null, 2)}\n`,
      "utf8",
    ),
  ]);
  console.log(`已应用实体审核批次，reviewer=${reviewer}`);
}

main().catch((error) => {
  console.error(`应用实体审核失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
