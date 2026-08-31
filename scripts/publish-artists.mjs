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
  const [candidates, reviews, existingArtists] = await Promise.all([
    readJson(path.join(ingestDir, "artist-candidates.json")),
    readJson(path.join(ingestDir, "artist-reviews.json")),
    readJson(path.join(dataDir, "artists-ingested.json")).catch(() => []),
  ]);
  const approved = new Map(
    (reviews.approved ?? []).map((item) => [item.id, item.evidenceHash]),
  );
  const newlyApproved = candidates
    .filter((candidate) => approved.get(candidate.id) === candidate.evidenceHash)
    .map((candidate) => ({
      id: candidate.id,
      nameJa: candidate.nameJa,
      nameZh: candidate.nameZh,
      romaji: candidate.romaji,
      kana: candidate.kana,
      aliases: candidate.aliases,
      genres: candidate.genres,
      color: candidate.color,
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
          rawContentHashes: [
            ...new Set(
              (source.sourceChain ?? [])
                .map((entry) => entry.contentHash)
                .filter(Boolean),
            ),
          ],
        })),
      },
    }));
  if (!newlyApproved.length) {
    throw new Error("没有已批准的发现艺人，拒绝覆盖");
  }
  const artistsById = new Map(existingArtists.map((artist) => [artist.id, artist]));
  for (const artist of newlyApproved) artistsById.set(artist.id, artist);
  const artists = [...artistsById.values()].sort((a, b) =>
    a.nameJa.localeCompare(b.nameJa, "ja"),
  );
  await writeFile(
    path.join(dataDir, "artists-ingested.json"),
    `${JSON.stringify(artists, null, 2)}\n`,
    "utf8",
  );
  console.log(`发现艺人正式库已发布：${artists.length} 位`);
}

main().catch((error) => {
  console.error(`艺人发布失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
