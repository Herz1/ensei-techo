import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { EVENT_FIELD_NAMES } from "./event-field-model.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const ingestDir = path.join(projectDir, "src", "data", "ingest");
const dataDir = path.join(projectDir, "src", "data");

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function percentage(value, total) {
  return total ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function uniqueLatest(entries) {
  const byRequest = new Map();
  for (const entry of entries) {
    const key = `${entry.sourceId}|${entry.requestedUrl}`;
    const current = byRequest.get(key);
    if (!current || entry.attempt >= current.attempt) {
      byRequest.set(key, entry);
    }
  }
  return [...byRequest.values()];
}

async function actualItemCount(entry) {
  if (
    !["success", "cache_reused"].includes(entry.fetchStatus) ||
    !entry.rawFile
  ) return 0;
  const filename = path.join(ingestDir, entry.rawFile);
  const buffer = await readFile(filename);
  if (entry.contentType?.includes("json")) {
    const payload = JSON.parse(buffer.toString("utf8"));
    if (entry.sourceId === "yokohama-arena-official") {
      return Array.isArray(payload)
        ? payload.filter((item) =>
            item?.date1 &&
            !/^(?:設営日|撤去日|休館日)$/u.test(item.title || item.artist || ""),
          ).length
        : 0;
    }
    return payload?._embedded?.events?.length ?? 0;
  }
  const $ = cheerio.load(buffer.toString("utf8"));
  if (entry.sourceId.startsWith("zepp-")) {
    return $("a.sch-content").length;
  }
  if (entry.sourceId === "kenshi-yonezu-official") {
    return $("blockquote p").filter((_, element) =>
      /\d{1,2}\/\s*\d{1,2}.*OPEN.*START/u.test($(element).text()),
    ).length;
  }
  if (entry.sourceId === "sheena-ringo-official") {
    return $(".sched-list li").length;
  }
  return 0;
}

function fieldCoverage(candidates) {
  return Object.fromEntries(
    EVENT_FIELD_NAMES.map((field) => {
      const published = candidates.filter(
        (candidate) =>
          candidate.fields?.[field]?.availabilityStatus === "published",
      ).length;
      return [
        field,
        {
          count: published,
          total: candidates.length,
          percentage: percentage(published, candidates.length),
        },
      ];
    }),
  );
}

function markdown(report) {
  const rows = report.sources.map((source) =>
    `| ${source.name} | ${source.actualPageItems} | ${source.discoveredRecords} | ${source.detailVisitRate}% | ${source.detailFetchSuccessRate}% | ${source.parseSuccessRate}% | ${source.reviewable} | ${source.published} | ${source.missed} | ${source.parserFailed} | ${source.pageFetchFailed} | ${source.entityBlocked} |`,
  ).join("\n");
  return `# 官方来源召回率审计

批次：${report.batchId}

| 来源 | 官网条目 | 发现记录 | 详情访问率 | 详情抓取成功率 | 解析成功率 | 可审核 | 正式发布 | 漏抓 | parser_failed | page_fetch_failed | 实体阻塞 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## 抽样

${report.sources.map((source) =>
    `- ${source.name}：检查 ${source.sampleSize}/${source.actualPageItems} 条；漏抓原因 ${JSON.stringify(source.missedReasons)}。`,
  ).join("\n")}
`;
}

async function main() {
  const [manifest, ingestReport, candidates, approved, events] =
    await Promise.all([
      readJson(path.join(ingestDir, "raw-manifest.json"), null),
      readJson(path.join(ingestDir, "report.json"), {}),
      readJson(path.join(ingestDir, "candidates.json"), []),
      readJson(path.join(ingestDir, "approved.json"), []),
      readJson(path.join(dataDir, "events.json"), []),
    ]);
  if (!manifest) {
    throw new Error("缺少 raw-manifest.json，请先运行 npm run ingest:events");
  }
  const latestEntries = uniqueLatest(manifest.entries ?? []);
  const eventIds = new Set(events.map((event) => event.id));
  const approvedIds = new Set(approved.map((candidate) => candidate.id));
  const sources = [];

  for (const sourceResult of ingestReport.sources ?? []) {
    const sourceEntries = latestEntries.filter(
      (entry) => entry.sourceId === sourceResult.id,
    );
    const discoveryEntries = sourceEntries.filter(
      (entry) => entry.sourceRole !== "venue_detail",
    );
    const detailEntries = sourceEntries.filter(
      (entry) => entry.sourceRole === "venue_detail",
    );
    const actualPageItems = (
      await Promise.all(discoveryEntries.map(actualItemCount))
    ).reduce((sum, value) => sum + value, 0);
    const sourceCandidates = candidates.filter((candidate) =>
      candidate.sources?.some((source) => source.sourceId === sourceResult.id),
    );
    const expectedDetails = new Set(
      detailEntries.map((entry) => entry.requestedUrl),
    ).size;
    const visitedDetails = expectedDetails;
    const successfulDetails = new Set(
      detailEntries
        .filter((entry) =>
          ["success", "cache_reused"].includes(entry.fetchStatus),
        )
        .map((entry) => entry.requestedUrl),
    ).size;
    const parserFailed = sourceEntries.filter(
      (entry) => entry.parserStatus === "parser_failed",
    ).length;
    const pageFetchFailed = sourceEntries.filter(
      (entry) =>
        !["success", "cache_reused"].includes(entry.fetchStatus),
    ).length;
    const entityBlocked = sourceCandidates.filter((candidate) =>
      candidate.issues?.some((issue) =>
        [
          "unknown_artist",
          "partial_artist_resolution",
          "unknown_venue",
        ].includes(issue),
      ),
    ).length;
    const parsedRequests = sourceEntries.filter(
      (entry) =>
        ["success", "cache_reused"].includes(entry.fetchStatus) &&
        entry.parserStatus !== "not_recorded",
    ).length;
    const published = sourceCandidates.filter(
      (candidate) =>
        approvedIds.has(candidate.id) && eventIds.has(candidate.id),
    ).length;
    const discoveredRecords = sourceResult.recordCount ?? 0;
    const missed = Math.max(0, actualPageItems - discoveredRecords);
    const missedReasons = {
      pageStructure: parserFailed,
      pageFetch: pageFetchFailed,
      detailNotVisited: Math.max(0, expectedDetails - visitedDetails),
      entityMatching: entityBlocked,
      requiredFields: sourceCandidates.filter((candidate) =>
        candidate.blockingReasons?.some((reason) =>
          reason.startsWith("required_field:"),
        ),
      ).length,
    };
    sources.push({
      id: sourceResult.id,
      name: sourceResult.name,
      status: sourceResult.status,
      actualPageItems,
      discoveredRecords,
      candidateCount: sourceCandidates.length,
      detailExpected: expectedDetails,
      detailVisited: visitedDetails,
      detailVisitRate: percentage(visitedDetails, expectedDetails),
      detailFetchSuccessRate: percentage(
        successfulDetails,
        expectedDetails,
      ),
      parseSuccessRate: percentage(parsedRequests, sourceEntries.length),
      reviewable: sourceCandidates.filter(
        (candidate) => candidate.readyForReview,
      ).length,
      published,
      missed,
      missedReasons,
      fieldCoverage: fieldCoverage(sourceCandidates),
      parserFailed,
      pageFetchFailed,
      entityBlocked,
      sampleSize: Math.min(20, actualPageItems),
      sampleEventIds: sourceCandidates
        .slice(0, Math.min(20, sourceCandidates.length))
        .map((candidate) => candidate.id),
    });
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    batchId: manifest.batchId,
    sourceCount: sources.length,
    sources,
  };
  await Promise.all([
    writeFile(
      path.join(ingestDir, "source-audit-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(ingestDir, "source-audit-report.md"),
      markdown(report),
      "utf8",
    ),
  ]);
  console.log(
    `来源召回审计：${sources.length} 个 adapter，原始页面条目 ${sources.reduce((sum, source) => sum + source.actualPageItems, 0)}，详情访问 ${sources.reduce((sum, source) => sum + source.detailVisited, 0)}/${sources.reduce((sum, source) => sum + source.detailExpected, 0)}。`,
  );
}

main().catch((error) => {
  console.error(`来源审计失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
