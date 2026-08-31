import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName, sha256 } from "./event-ingest-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const dataDir = path.join(projectDir, "src", "data");
const ingestDir = path.join(dataDir, "ingest");

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function simpleOfficialName(value) {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 40) return undefined;
  if (
    /coming\s*soon|not\s*found|more(?:\.{3}|…)|公演中止|出演キャンセル|漫才選集|出演者|演奏[:：]|オープニングアクト|opening\s*act|live\s*act|dancer|costume|provider|guitar|vocal|bass|drums|keyboards|キーボード|ギター|ドラム|ベース|詳細|公式サイト|twin\s+live|^MC\s|\bMC[:：]|SD\.LEAGUE\s+\d|(?:HALL|LOFT|HEIST|MARZ|MARBLE|SAMURAI|SCIENCE)$/iu.test(
      name,
    )
  ) {
    return undefined;
  }
  if ((name.match(/[\[\]【】()（）]/gu) ?? []).length >= 4) return undefined;
  if (
    (name.match(/\(/gu) ?? []).length !== (name.match(/\)/gu) ?? []).length ||
    (name.match(/（/gu) ?? []).length !== (name.match(/）/gu) ?? []).length
  ) {
    return undefined;
  }
  return name;
}

function colorFromId(id) {
  return `#${sha256(id).slice(0, 6)}`;
}

async function main() {
  const [baseArtists, ingestedArtists, candidates, reviews] =
    await Promise.all([
      readJson(path.join(dataDir, "artists.json"), []),
      readJson(path.join(dataDir, "artists-ingested.json"), []),
      readJson(path.join(ingestDir, "candidates.json"), []),
      readJson(path.join(ingestDir, "artist-reviews.json"), {
        schemaVersion: 1,
        approved: [],
        rejected: [],
      }),
    ]);
  const existing = new Set(
    [...baseArtists, ...ingestedArtists]
      .flatMap((artist) => [
        artist.nameJa,
        artist.nameZh,
        artist.romaji,
        artist.kana,
        ...(artist.aliases ?? []),
      ])
      .map(normalizeName)
      .filter(Boolean),
  );
  const groups = new Map();
  for (const candidate of candidates) {
    if (
      !candidate.issues?.includes("unknown_artist") &&
      !candidate.issues?.includes("partial_artist_resolution")
    ) {
      continue;
    }
    const names = candidate.issues?.includes("partial_artist_resolution")
      ? candidate.unresolvedArtistNames
      : candidate.artistNames;
    for (const rawName of names ?? []) {
      const name = simpleOfficialName(rawName);
      const normalized = normalizeName(name);
      if (!name || !normalized || existing.has(normalized)) continue;
      const group = groups.get(normalized) ?? {
        name,
        normalized,
        sources: new Map(),
        eventIds: new Set(),
      };
      group.eventIds.add(candidate.id);
      for (const source of candidate.sources ?? []) {
        group.sources.set(
          `${source.sourceId}|${source.sourceEventId}`,
          source,
        );
      }
      groups.set(normalized, group);
    }
  }

  const approved = new Map(
    (reviews.approved ?? []).map((item) => [item.id, item.evidenceHash]),
  );
  const rejected = new Set(reviews.rejected ?? []);
  const artistCandidates = [...groups.values()]
    .map((group) => {
      const sources = [...group.sources.values()];
      const id = `artist-ext-${sha256(group.normalized).slice(0, 16)}`;
      const evidenceHash = sha256(
        `${group.normalized}|${sources
          .map((source) => source.contentHash)
          .sort()
          .join("|")}`,
      );
      const reviewState = rejected.has(id)
        ? "rejected"
        : approved.get(id) === evidenceHash
          ? "approved"
          : approved.has(id)
            ? "changed"
            : "pending_review";
      return {
        id,
        nameJa: group.name,
        nameZh: null,
        romaji: null,
        kana: null,
        aliases: [],
        genres: [],
        color: colorFromId(id),
        profileStatus: "minimal",
        eventCount: group.eventIds.size,
        eventIds: [...group.eventIds].sort(),
        evidenceHash,
        reviewState,
        sources,
      };
    })
    .sort((a, b) => b.eventCount - a.eventCount || a.nameJa.localeCompare(b.nameJa, "ja"));

  await mkdir(ingestDir, { recursive: true });
  await writeFile(
    path.join(ingestDir, "artist-candidates.json"),
    `${JSON.stringify(artistCandidates, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `艺人发现完成：${artistCandidates.length} 个清洁候选，已批准 ${artistCandidates.filter((item) => item.reviewState === "approved").length} 个`,
  );
}

main().catch((error) => {
  console.error(`艺人发现失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
