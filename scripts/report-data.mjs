import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AVAILABILITY_STATUSES,
  EVENT_FIELD_NAMES,
} from "./event-field-model.mjs";

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

function percentage(count, total) {
  return total ? Number(((count / total) * 100).toFixed(1)) : 0;
}

function hasMeaningfulTicketType(event) {
  return (event.tiers ?? []).some(
    (tier) =>
      tier.name &&
      !/^官方公布票价(?:\s+\d+)?$/u.test(tier.name),
  );
}

function availabilityOf(event, field) {
  if (event.availability?.[field]) return event.availability[field];
  const inferred = {
    title: event.titleJa ? "published" : "pending_review",
    artist: event.artistIds?.length ? "published" : "pending_review",
    venue: event.venueId ? "published" : "pending_review",
    eventDate: event.date ? "published" : "pending_review",
    openTime: event.openTime ? "published" : "pending_review",
    startTime: event.startTime ? "published" : "pending_review",
    ticketTypes: hasMeaningfulTicketType(event)
      ? "published"
      : "pending_review",
    prices: event.tiers?.length ? "published" : "pending_review",
    additionalFees: event.additionalFees?.length
      ? "published"
      : "pending_review",
    ticketPhases: event.phases?.length ? "published" : "pending_review",
    eligibility: event.eligibility?.length ? "published" : "pending_review",
    purchaseUrls: event.ticketLinks?.length ? "published" : "pending_review",
  };
  return inferred[field];
}

function sourceContributions(events) {
  const counts = new Map();
  for (const event of events) {
    for (const source of event.verification?.sources ?? []) {
      const key = `${source.type}|${source.name}`;
      const current = counts.get(key) ?? {
        name: source.name,
        type: source.type,
        eventCount: 0,
      };
      current.eventCount += 1;
      counts.set(key, current);
    }
  }
  return [...counts.values()].sort((a, b) => b.eventCount - a.eventCount);
}

function queueItems(candidates, predicate) {
  const items = [];
  for (const candidate of candidates) {
    for (const [field, data] of Object.entries(candidate.fields ?? {})) {
      if (predicate(data)) {
        items.push({
          eventId: candidate.id,
          title: candidate.title,
          field,
          availabilityStatus: data.availabilityStatus,
          approvalState: data.approvalState,
        });
      }
    }
  }
  return items;
}

function markdown(report) {
  const rows = report.sources
    .map(
      (source) =>
        `| ${source.name} | ${source.type} | ${source.eventCount} |`,
    )
    .join("\n");
  return `# 演出数据完整度报告

生成时间：${report.generatedAt}

## 汇总

| 指标 | 数值 |
| --- | ---: |
| 正式演出 | ${report.summary.eventCount} |
| Discovered | ${report.funnel.discovered} |
| Reviewable | ${report.funnel.reviewable} |
| Published | ${report.funnel.published} |
| 官方来源 | ${report.summary.sourceCount} |
| Source adapters | ${report.summary.adapterCount} |
| Parsers | ${report.summary.parserCount} |
| 票价覆盖 | ${report.coverage.prices.count}/${report.summary.eventCount} (${report.coverage.prices.percentage}%) |
| 席种覆盖 | ${report.coverage.ticketTypes.count}/${report.summary.eventCount} (${report.coverage.ticketTypes.percentage}%) |
| 售票阶段覆盖 | ${report.coverage.ticketPhases.count}/${report.summary.eventCount} (${report.coverage.ticketPhases.percentage}%) |
| 官方链接覆盖 | ${report.coverage.officialLinks.count}/${report.summary.eventCount} (${report.coverage.officialLinks.percentage}%) |
| 具体购票链接覆盖 | ${report.coverage.purchaseUrls.count}/${report.summary.eventCount} (${report.coverage.purchaseUrls.percentage}%) |
| 额外费用覆盖 | ${report.coverage.additionalFees.count}/${report.summary.eventCount} (${report.coverage.additionalFees.percentage}%) |
| 待审核字段 | ${report.queues.pendingReview.length} |
| 可执行字段审核 | ${report.queues.actionableReview.length} |
| 必填字段阻塞候选 | ${report.queues.blockedCandidates.length} |
| 未检查字段 | ${report.queues.notChecked.length} |
| 当前页未发现字段 | ${report.queues.notFoundOnPage.length} |
| 解析失败字段 | ${report.queues.parserFailed.length} |
| 页面抓取失败字段 | ${report.queues.pageFetchFailed.length} |
| 访问受限字段 | ${report.queues.blocked.length} |
| 来源冲突字段 | ${report.queues.conflicts.length} |
| 官网变化字段 | ${report.queues.changed.length} |
| 模糊匹配待审 | ${report.queues.matchReview.length} |

## 来源贡献

| 来源 | 类型 | 正式记录贡献 |
| --- | --- | ---: |
${rows || "| 暂无 | - | 0 |"}

## 字段缺失状态

\`\`\`json
${JSON.stringify(report.availabilityCounts, null, 2)}
\`\`\`

## 队列

- 待审核：${report.queues.pendingReview.length}
- 可执行字段审核：${report.queues.actionableReview.length}
- 必填字段阻塞候选：${report.queues.blockedCandidates.length}
- 未检查：${report.queues.notChecked.length}
- 当前页未发现：${report.queues.notFoundOnPage.length}
- parser_failed：${report.queues.parserFailed.length}
- page_fetch_failed：${report.queues.pageFetchFailed.length}
- blocked：${report.queues.blocked.length}
- conflicting_sources：${report.queues.conflicts.length}
- 官网内容变化：${report.queues.changed.length}
- 模糊匹配待审：${report.queues.matchReview.length}
`;
}

async function main() {
  const [events, candidates, ingestReport] = await Promise.all([
    readJson(path.join(dataDir, "events.json"), []),
    readJson(path.join(ingestDir, "candidates.json"), []),
    readJson(path.join(ingestDir, "report.json"), {}),
  ]);
  const eventCount = events.length;
  const coverage = {
    prices: {
      count: events.filter((event) => event.tiers?.length).length,
    },
    ticketTypes: {
      count: events.filter(hasMeaningfulTicketType).length,
    },
    ticketPhases: {
      count: events.filter((event) => event.phases?.length).length,
    },
    officialLinks: {
      count: events.filter(
        (event) =>
          event.ticketLinks?.length ||
          event.verification?.sources?.some((source) => source.url),
      ).length,
    },
    purchaseUrls: {
      count: events.filter(
        (event) =>
          event.availability?.purchaseUrls === "published" &&
          event.ticketLinks?.some((link) => link.purpose === "ticket"),
      ).length,
    },
    additionalFees: {
      count: events.filter((event) => event.additionalFees?.length).length,
    },
  };
  for (const item of Object.values(coverage)) {
    item.percentage = percentage(item.count, eventCount);
  }

  const availabilityCounts = Object.fromEntries(
    EVENT_FIELD_NAMES.map((field) => [
      field,
      Object.fromEntries(
        AVAILABILITY_STATUSES.map((status) => [
          status,
          events.filter(
            (event) => availabilityOf(event, field) === status,
          ).length,
        ]),
      ),
    ]),
  );
  const sources = sourceContributions(events);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      eventCount,
      sourceCount: sources.length,
      adapterCount: ingestReport.sources?.length ?? 0,
      parserCount: new Set(
        (ingestReport.sources ?? []).flatMap(
          (source) => source.parserIds ?? [],
        ),
      ).size,
    },
    coverage,
    funnel: {
      discovered: candidates.length,
      fetchedSuccessfully: candidates.filter((candidate) =>
        candidate.sourceChain?.some(
          (entry) => entry.fetchStatus === "success",
        ),
      ).length,
      parsedSuccessfully: candidates.filter((candidate) =>
        !Object.values(candidate.fields ?? {}).some((field) =>
          ["parser_failed", "page_fetch_failed"].includes(
            field.availabilityStatus,
          ),
        ),
      ).length,
      requiredFieldsComplete: candidates.filter((candidate) =>
        ["title", "artist", "venue", "eventDate", "openTime", "startTime"]
          .every(
            (field) =>
              candidate.fields?.[field]?.availabilityStatus === "published",
          ),
      ).length,
      artistMatched: candidates.filter(
        (candidate) =>
          !candidate.issues?.includes("unknown_artist") &&
          !candidate.issues?.includes("partial_artist_resolution"),
      ).length,
      venueMatched: candidates.filter(
        (candidate) => !candidate.issues?.includes("unknown_venue"),
      ).length,
      reviewable: candidates.filter(
        (candidate) => candidate.readyForReview,
      ).length,
      reviewed: candidates.filter((candidate) =>
        Object.values(candidate.fields ?? {}).some(
          (field) => field.approvalState === "approved",
        ),
      ).length,
      published: eventCount,
    },
    availabilityCounts,
    sources,
    queues: {
      pendingReview: queueItems(
        candidates,
        (field) => field.approvalState === "pending_review",
      ),
      notChecked: queueItems(
        candidates,
        (field) => field.availabilityStatus === "not_checked",
      ),
      notFoundOnPage: queueItems(
        candidates,
        (field) => field.availabilityStatus === "not_found_on_page",
      ),
      actionableReview: candidates.flatMap((candidate) => {
        if (!candidate.readyForReview) return [];
        return Object.entries(candidate.fields ?? {})
          .filter(
            ([, field]) =>
              ["pending_review", "changed"].includes(field.approvalState) &&
              ![
                "not_checked",
                "not_found_on_page",
                "parser_failed",
                "page_fetch_failed",
                "blocked",
                "pending_review",
                "conflicting_sources",
              ].includes(field.availabilityStatus),
          )
          .map(([field, data]) => ({
            eventId: candidate.id,
            title: candidate.title,
            field,
            availabilityStatus: data.availabilityStatus,
            approvalState: data.approvalState,
          }));
      }),
      blockedCandidates: candidates
        .filter(
          (candidate) =>
            candidate.readyForReview &&
            candidate.reviewState !== "approved",
        )
        .map((candidate) => ({
          eventId: candidate.id,
          title: candidate.title,
          date: candidate.date,
          blockedFields: Object.fromEntries(
            Object.entries(candidate.fields ?? {})
              .filter(
                ([name, field]) =>
                  ["openTime", "startTime"].includes(name) &&
                  field.approvalState !== "approved",
              )
              .map(([name, field]) => [name, field.availabilityStatus]),
          ),
        })),
      parserFailed: queueItems(
        candidates,
        (field) => field.availabilityStatus === "parser_failed",
      ),
      pageFetchFailed: queueItems(
        candidates,
        (field) => field.availabilityStatus === "page_fetch_failed",
      ),
      blocked: queueItems(
        candidates,
        (field) => field.availabilityStatus === "blocked",
      ),
      conflicts: queueItems(
        candidates,
        (field) => field.availabilityStatus === "conflicting_sources",
      ),
      changed: queueItems(
        candidates,
        (field) => field.approvalState === "changed",
      ),
      matchReview: candidates
        .filter((candidate) => candidate.matchReview?.length)
        .map((candidate) => ({
          eventId: candidate.id,
          title: candidate.title,
          date: candidate.date,
          venueId: candidate.venueId,
          possibleMatches: candidate.matchReview,
        })),
    },
  };

  await mkdir(ingestDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(ingestDir, "completeness-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(ingestDir, "completeness-report.md"),
      markdown(report),
      "utf8",
    ),
  ]);
  console.log(
    `完整度报告：${eventCount} 场，票价 ${coverage.prices.percentage}%，席种 ${coverage.ticketTypes.percentage}%，售票阶段 ${coverage.ticketPhases.percentage}%，官方链接 ${coverage.officialLinks.percentage}%`,
  );
}

main().catch((error) => {
  console.error(`报告生成失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
