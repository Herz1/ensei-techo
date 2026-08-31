import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const dataDir = path.join(projectDir, "src", "data");
const ingestDir = path.join(dataDir, "ingest");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  const [batch, reviews] = await Promise.all([
    readJson(path.join(ingestDir, "entity-review-batch.json")),
    readJson(path.join(ingestDir, "venue-reviews.json")),
  ]);
  const approved = new Map(
    (reviews.approved ?? []).map((item) => [item.id, item.evidenceHash]),
  );
  const venues = batch.venues
    .filter((candidate) =>
      candidate.decision === "approve" &&
      approved.get(candidate.id) === candidate.evidenceHash,
    )
    .map((candidate) => ({
      id: candidate.id,
      nameJa: candidate.nameJa,
      nameZh: null,
      prefecture: candidate.prefecture,
      city: candidate.city,
      lat: null,
      lng: null,
      capacity: null,
      tier: null,
      stations: [],
      hubAccess: [],
      profileStatus: "minimal",
      verification: {
        state: "verified",
        checkedAt: reviews.verifiedAt,
        evidenceHash: candidate.evidenceHash,
        sources: candidate.sources.map((source) => ({
          name: source.sourceName,
          type: source.sourceType,
          url: source.sourceUrl,
          fetchedAt: source.fetchedAt,
          rawContentHashes: candidate.rawContentHashes,
        })),
      },
    }));
  if (!venues.length) throw new Error("没有已批准的最小场馆实体，拒绝覆盖");
  await writeFile(
    path.join(dataDir, "venues-ingested.json"),
    `${JSON.stringify(venues, null, 2)}\n`,
    "utf8",
  );
  console.log(`最小场馆实体已发布：${venues.length} 个`);
}

main().catch((error) => {
  console.error(`场馆发布失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
