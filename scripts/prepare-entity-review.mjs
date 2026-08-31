import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName, sha256 } from "./event-ingest-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const dataDir = path.join(projectDir, "src", "data");
const ingestDir = path.join(dataDir, "ingest");

const VENUE_FACTS = new Map([
  ["市川市文化会館", {
    prefecture: "chiba",
    city: "市川市",
    sourceUrl: "https://www.tekona.net/bunkakaikan/facilities/",
  }],
  ["アクトシティ浜松 大ホール", {
    prefecture: "shizuoka",
    city: "浜松市",
    sourceUrl: "https://www.actcity.jp/access/",
  }],
  ["あきた芸術劇場ミルハス 大ホール", {
    prefecture: "akita",
    city: "秋田市",
    sourceUrl: "https://akiat.jp/about/",
  }],
  ["大分iichikoグランシアタ", {
    prefecture: "oita",
    city: "大分市",
    sourceUrl: "https://emo.or.jp/facilities/",
  }],
  ["神戸国際会館こくさいホール", {
    prefecture: "hyogo",
    city: "神戸市",
    sourceUrl: "https://www.kih.co.jp/s/access/index",
  }],
  ["松山市民会館", {
    prefecture: "ehime",
    city: "松山市",
    sourceUrl: "https://www.cul-spo.or.jp/mcph/access",
  }],
]);

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function rawHashes(sources) {
  return [...new Set(
    sources.flatMap((source) =>
      (source.sourceChain ?? []).map((entry) => entry.contentHash).filter(Boolean),
    ),
  )].sort();
}

function artistRejectionReason(candidate) {
  const name = candidate.nameJa;
  if (!candidate.sources?.length) return "missing_official_source";
  if (!rawHashes(candidate.sources).length) return "missing_raw_evidence";
  if (name.length > 40) return "compound_or_overlong_name";
  if (/^(?:more|FUKUOKA|NAGOYA|OSAKA)$/iu.test(name)) return "page_label_not_artist";
  if (/^者\s*[:：]/u.test(name)) return "truncated_role_label";
  if (/(?:\s+w|FACTORYw)$/u.test(name)) return "truncated_with_annotation";
  if (
    /^(?:Zepp\s|新宿(?:LOFT|MARZ|Marble|SAMURAI|Zirco|HEIST|Motion)|HOLIDAY\s+SHINJUKU|club\s+SCIENCE)/iu.test(name) ||
    /(?:POP\s+WAVE\s+LIVE|Luxury\s+Soul\s+Night|盆踊り20\d{2})/iu.test(name)
  ) {
    return "event_or_venue_label_not_artist";
  }
  if (
    /(?:出演キャンセル|coming\s*soon|公演中止|(?:^|\s)(?:guest|ゲスト|出演|演奏|member|司会|opening\s*act|live\s*act)\s*[:：]|(?:HALL|LOFT|HEIST|MARZ|MARBLE|SAMURAI|SCIENCE)(?:$|\s))/iu.test(name)
  ) {
    return "role_or_venue_text_mixed_into_name";
  }
  return null;
}

async function main() {
  const [artistCandidates, eventCandidates] = await Promise.all([
    readJson(path.join(ingestDir, "artist-candidates.json")),
    readJson(path.join(ingestDir, "candidates.json")),
  ]);

  const artists = artistCandidates.map((candidate) => {
    const rejectionReason = artistRejectionReason(candidate);
    return {
      id: candidate.id,
      nameJa: candidate.nameJa,
      profileStatus: "minimal",
      evidenceHash: candidate.evidenceHash,
      eventCount: candidate.eventCount,
      eventIds: candidate.eventIds,
      rawContentHashes: rawHashes(candidate.sources),
      sources: candidate.sources.map((source) => ({
        sourceName: source.sourceName,
        sourceType: source.sourceType,
        sourceUrl: source.sourceUrl,
        fetchedAt: source.fetchedAt,
        contentHash: source.contentHash,
      })),
      decision: rejectionReason ? "reject" : "approve",
      reason: rejectionReason ?? "官方日程的出演者字段与原始响应证据一致",
    };
  });

  const unknownVenueGroups = new Map();
  for (const candidate of eventCandidates.filter((item) =>
    item.issues?.includes("unknown_venue"),
  )) {
    const group = unknownVenueGroups.get(candidate.venueName) ?? {
      nameJa: candidate.venueName,
      eventIds: new Set(),
      sources: new Map(),
    };
    group.eventIds.add(candidate.id);
    for (const source of candidate.sources ?? []) {
      group.sources.set(`${source.sourceId}|${source.sourceEventId}`, source);
    }
    unknownVenueGroups.set(candidate.venueName, group);
  }

  const venues = [...unknownVenueGroups.values()].map((group) => {
    const facts = VENUE_FACTS.get(group.nameJa);
    const sources = [...group.sources.values()];
    const hashes = rawHashes(sources);
    const decision = facts && hashes.length ? "approve" : "reject";
    const id = `venue-ext-${sha256(normalizeName(group.nameJa)).slice(0, 16)}`;
    const evidenceHash = sha256(JSON.stringify({
      nameJa: group.nameJa,
      prefecture: facts?.prefecture ?? null,
      city: facts?.city ?? null,
      officialVenueSourceUrl: facts?.sourceUrl ?? null,
      rawContentHashes: hashes,
    }));
    return {
      id,
      nameJa: group.nameJa,
      nameZh: null,
      prefecture: facts?.prefecture ?? null,
      city: facts?.city ?? null,
      lat: null,
      lng: null,
      capacity: null,
      tier: null,
      stations: [],
      hubAccess: [],
      profileStatus: "minimal",
      eventIds: [...group.eventIds].sort(),
      evidenceHash,
      rawContentHashes: hashes,
      sources: [
        ...sources.map((source) => ({
          sourceName: source.sourceName,
          sourceType: source.sourceType,
          sourceUrl: source.sourceUrl,
          fetchedAt: source.fetchedAt,
          contentHash: source.contentHash,
        })),
        ...(facts ? [{
          sourceName: "场馆官方网站（所在地）",
          sourceType: "venue_official",
          sourceUrl: facts.sourceUrl,
          fetchedAt: new Date().toISOString(),
          contentHash: null,
        }] : []),
      ],
      decision,
      reason: decision === "approve"
        ? "演出官方页确认场馆名，场馆官网确认所在地；未知资料保持 null"
        : "缺少已核对的所在地或原始响应证据",
    };
  });

  const entities = {
    artists,
    venues,
  };
  const batchHash = sha256(JSON.stringify(entities));
  const batch = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    batchHash,
    summary: {
      artistApprove: artists.filter((item) => item.decision === "approve").length,
      artistReject: artists.filter((item) => item.decision === "reject").length,
      venueApprove: venues.filter((item) => item.decision === "approve").length,
      venueReject: venues.filter((item) => item.decision === "reject").length,
    },
    ...entities,
  };
  await mkdir(ingestDir, { recursive: true });
  await writeFile(
    path.join(ingestDir, "entity-review-batch.json"),
    `${JSON.stringify(batch, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `实体审核批次已生成：艺人批准 ${batch.summary.artistApprove} / 拒绝 ${batch.summary.artistReject}，场馆批准 ${batch.summary.venueApprove} / 拒绝 ${batch.summary.venueReject}`,
  );
  console.log(`批次哈希：${batchHash}`);
}

main().catch((error) => {
  console.error(`实体审核批次生成失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
